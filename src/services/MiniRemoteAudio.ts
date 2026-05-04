/**
 * MiniRemoteAudio
 *
 * Standalone service that owns the Rust ↔ Deepgram remote-audio pipeline for
 * the Mini overlay window.  Deliberately NOT a React hook so that the pipeline
 * lifecycle is completely decoupled from the React render cycle.
 *
 * Pipeline (same as before, but now isolated in one place):
 *
 *   Rust capture (WASAPI loopback / SCKit)
 *     └─ axum WebSocket (127.0.0.1:{port})
 *           └─ [PCM binary frames forwarded]
 *                 └─ Deepgram WebSocket (wss://api.deepgram.com/v1/listen)
 *                       └─ transcript Results → onTranscript callback
 *
 * Lifecycle
 * ---------
 *   const svc = new MiniRemoteAudio({ apiKey, model, language, onTranscript, onError });
 *   await svc.start();   // idempotent — safe to call multiple times
 *   svc.stop();          // stops all WS connections & Rust stream
 *
 * Reconnection
 * ------------
 *   • Deepgram closes after 12 s of silence → transparent DG-only reconnect
 *     after 1.5 s (Rust stream stays alive).
 *   • Rust WS closes unexpectedly → full pipeline restart after 2 s.
 *   • All reconnects are cancelled when stop() is called.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/utils";

export interface MiniRemoteAudioOptions {
  apiKey: string;
  model?: string;
  language?: string;
  onTranscript: (text: string, isFinal: boolean) => void;
  onStatusChange?: (status: MiniRemoteAudioStatus) => void;
  onError?: (message: string) => void;
}

export type MiniRemoteAudioStatus = "idle" | "connecting" | "transcribing" | "error";

interface AudioMeta {
  sampleRate: number;
  channels: number;
}

export class MiniRemoteAudio {
  // ── Options (mutated live so reconnect closures always have latest values) ──
  private apiKey: string;
  private model: string;
  private language: string;
  private onTranscript: (text: string, isFinal: boolean) => void;
  private onStatusChange?: (s: MiniRemoteAudioStatus) => void;
  private onError?: (msg: string) => void;

  // ── Connection state ──────────────────────────────────────────────────────
  private rustWs: WebSocket | null = null;
  private dgWs: WebSocket | null = null;
  private audioMeta: AudioMeta | null = null;
  private status: MiniRemoteAudioStatus = "idle";

  // ── Guard flags ───────────────────────────────────────────────────────────
  // Prevents double-start from rapid successive calls to start().
  private starting = false;

  // Counts consecutive DG reconnect attempts so we can bail on persistent
  // auth failures instead of looping forever.
  private dgReconnectCount = 0;
  private readonly DG_MAX_RECONNECTS = 5;

  // ── Timers ────────────────────────────────────────────────────────────────
  private dgKeepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private dgReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private rustReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Whether stop() has been called — prevents reconnect timers from firing
  // after an intentional teardown.
  private stopped = false;

  constructor(opts: MiniRemoteAudioOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "nova-3";
    this.language = opts.language ?? "en";
    this.onTranscript = opts.onTranscript;
    this.onStatusChange = opts.onStatusChange;
    this.onError = opts.onError;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Update live options without restarting the pipeline. */
  updateOptions(opts: Partial<Pick<MiniRemoteAudioOptions, "apiKey" | "model" | "language" | "onTranscript" | "onStatusChange" | "onError">>) {
    if (opts.apiKey !== undefined) this.apiKey = opts.apiKey;
    if (opts.model !== undefined) this.model = opts.model;
    if (opts.language !== undefined) this.language = opts.language;
    if (opts.onTranscript !== undefined) this.onTranscript = opts.onTranscript;
    if (opts.onStatusChange !== undefined) this.onStatusChange = opts.onStatusChange;
    if (opts.onError !== undefined) this.onError = opts.onError;
  }

  /** Start the capture pipeline. Idempotent. */
  async start(): Promise<void> {
    if (!isTauri()) return; // No-op in web browser
    if (this.starting || this.status === "transcribing") return;

    this.stopped = false;
    this.starting = true;
    this._clearAllTimers();
    this._closeLocalConnections();
    this._setStatus("connecting");

    try {
      // start_display_audio_stream is idempotent on the Rust side —
      // returns the existing port if the stream is already running.
      const port = await invoke<number>("start_display_audio_stream");
      this._openRustWs(port);
    } catch (e: unknown) {
      this.starting = false;
      const msg = e instanceof Error ? e.message : String(e);
      this._setStatus("error");
      this.onError?.(`Remote audio start failed: ${msg}`);
    }
  }

  /** Stop the pipeline and release all resources including the Rust stream. */
  stop(): void {
    this.stopped = true;
    this._clearAllTimers();
    this._closeLocalConnections();
    this._setStatus("idle");
    // Mini window is the primary consumer of the Rust loopback stream,
    // so always stop it on teardown.
    if (isTauri()) {
      invoke("stop_display_audio_stream").catch(() => {});
    }
  }

  /** Permanently stop including the Rust stream (call on session end). */
  stopAll(): void {
    this.stop();
    if (isTauri()) {
      invoke("stop_display_audio_stream").catch(() => {});
    }
  }

  getStatus(): MiniRemoteAudioStatus {
    return this.status;
  }

  // ── Private: Rust WebSocket ────────────────────────────────────────────────

  private _openRustWs(port: number): void {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.binaryType = "arraybuffer";
    this.rustWs = ws;

    ws.onopen = () => {
      // Starting flag released once the metadata frame arrives and Deepgram opens.
    };

    ws.onmessage = (evt) => {
      // ── First message: JSON metadata ──────────────────────────────────
      if (typeof evt.data === "string") {
        let meta: AudioMeta;
        try {
          meta = JSON.parse(evt.data) as AudioMeta;
        } catch {
          this.starting = false;
          this._setStatus("error");
          this.onError?.("Remote audio: bad metadata from Rust WS");
          return;
        }
        this.audioMeta = meta;
        this._openDeepgramWs(meta);
        return;
      }

      // ── Subsequent messages: raw i16 LE PCM binary frames ─────────────
      // Zero-copy forward to Deepgram — no AudioContext, no MediaRecorder.
      if (!(evt.data instanceof ArrayBuffer)) return;
      if (this.dgWs?.readyState === WebSocket.OPEN) {
        this.dgWs.send(evt.data);
      }
    };

    ws.onerror = () => {
      this.starting = false;
      this._setStatus("error");
      this.onError?.("Remote audio: Rust WebSocket error");
    };

    ws.onclose = () => {
      this._clearAllTimers();
      this._setStatus("idle");
      this.starting = false;
      // Reconnect the full pipeline if not intentionally stopped.
      if (!this.stopped) {
        this.rustReconnectTimer = setTimeout(async () => {
          if (!this.stopped) await this.start();
        }, 2_000);
      }
    };
  }

  // ── Private: Deepgram WebSocket ────────────────────────────────────────────

  private _openDeepgramWs(meta: AudioMeta): void {
    // Null handlers before closing the old WS so its onclose doesn't fire
    // a spurious reconnect.
    if (this.dgWs) {
      this.dgWs.onclose = null;
      this.dgWs.onerror = null;
      this.dgWs.close();
      this.dgWs = null;
    }
    if (this.dgKeepaliveTimer) {
      clearInterval(this.dgKeepaliveTimer);
      this.dgKeepaliveTimer = null;
    }
    if (this.dgReconnectTimer) {
      clearTimeout(this.dgReconnectTimer);
      this.dgReconnectTimer = null;
    }

    const url =
      `wss://api.deepgram.com/v1/listen` +
      `?model=${this.model}` +
      `&punctuate=true` +
      `&interim_results=true` +
      `&language=${this.language}` +
      `&smart_format=true` +
      // 300 ms endpointing gives the fastest possible finalisation latency
      // while still handling natural speech pauses.
      `&endpointing=300` +
      `&utterance_end_ms=600` +
      `&vad_events=true` +
      `&encoding=linear16` +
      `&sample_rate=${meta.sampleRate}` +
      `&channels=${meta.channels}` +
      // multichannel=true required for stereo (2-ch) WASAPI loopback on Windows;
      // without it Deepgram returns empty results for stereo linear16.
      (meta.channels > 1 ? `&multichannel=true` : ``) +
      `&tag=craftvita-remote`;

    const dg = new WebSocket(url, ["token", this.apiKey]);
    this.dgWs = dg;

    dg.onopen = () => {
      this.starting = false;
      this.dgReconnectCount = 0; // reset on successful connection
      this._setStatus("transcribing");
      // KeepAlive every 8 s — Deepgram closes the WS after 12 s of silence.
      this.dgKeepaliveTimer = setInterval(() => {
        if (this.dgWs?.readyState === WebSocket.OPEN) {
          this.dgWs.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, 8_000);
    };

    dg.onmessage = (evt) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(evt.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data["type"] !== "Results") return;

      const channel = data["channel"] as Record<string, unknown> | undefined;
      const alts = channel?.["alternatives"] as Array<Record<string, unknown>> | undefined;
      if (!alts?.[0]) return;

      const alt = alts[0];
      const text = (alt["transcript"] as string) ?? "";
      const isFinal = (data["is_final"] as boolean) ?? false;

      // Only fire the callback when there is actual text.
      if (text.trim()) {
        this.dgReconnectCount = 0; // received valid transcript — reset retry counter
        this.onTranscript(text, isFinal);
      }
    };

    dg.onerror = () => {
      this._setStatus("error");
      this.onError?.("Remote audio: Deepgram connection error");
    };

    dg.onclose = (evt: CloseEvent) => {
      if (this.dgKeepaliveTimer) {
        clearInterval(this.dgKeepaliveTimer);
        this.dgKeepaliveTimer = null;
      }

      // 1008 = Policy Violation: invalid / missing API key. No point retrying.
      if (evt.code === 1008) {
        this._setStatus("error");
        this.onError?.("Remote audio: Deepgram auth failed — check VITE_DEEPGRAM_API_KEY");
        return;
      }

      // If the Rust stream is still alive, transparently reconnect Deepgram.
      // This handles the 12-second inactivity timeout during long silences.
      const rustAlive = this.rustWs?.readyState === WebSocket.OPEN;
      if (rustAlive && this.audioMeta && !this.stopped) {
        // Too many consecutive reconnects without a transcript — something is
        // persistently wrong (bad key, network). Stop and surface the error.
        if (this.dgReconnectCount >= this.DG_MAX_RECONNECTS) {
          this._setStatus("error");
          this.onError?.(`Remote audio: Deepgram failed after ${this.DG_MAX_RECONNECTS} retries`);
          return;
        }
        const meta = this.audioMeta;
        this.dgReconnectCount += 1;
        this.dgReconnectTimer = setTimeout(() => {
          if (!this.stopped && this.rustWs?.readyState === WebSocket.OPEN) {
            this._openDeepgramWs(meta);
          }
        }, 800);
      } else if (!this.stopped) {
        this._setStatus("idle");
      }
    };
  }

  // ── Private: Helpers ───────────────────────────────────────────────────────

  private _closeLocalConnections(): void {
    if (this.rustWs) {
      this.rustWs.onclose = null;
      this.rustWs.onerror = null;
      this.rustWs.onmessage = null;
      this.rustWs.close();
      this.rustWs = null;
    }
    if (this.dgWs) {
      this.dgWs.onclose = null;
      this.dgWs.onerror = null;
      this.dgWs.close();
      this.dgWs = null;
    }
    this.audioMeta = null;
    this.starting = false;
  }

  private _clearAllTimers(): void {
    if (this.dgKeepaliveTimer) { clearInterval(this.dgKeepaliveTimer); this.dgKeepaliveTimer = null; }
    if (this.dgReconnectTimer) { clearTimeout(this.dgReconnectTimer); this.dgReconnectTimer = null; }
    if (this.rustReconnectTimer) { clearTimeout(this.rustReconnectTimer); this.rustReconnectTimer = null; }
  }

  private _setStatus(s: MiniRemoteAudioStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.onStatusChange?.(s);
  }
}
