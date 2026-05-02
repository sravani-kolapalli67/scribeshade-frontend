/**
 * useNativeTabTranscription
 *
 * Transcribes display/tab audio captured by the Rust ScreenCaptureKit backend.
 *
 * Pipeline:
 *   SCKit display audio (Rust) ─► axum WS (localhost) ─► this hook ─► Deepgram WS
 *
 * SCKit taps the OS audio graph for the primary display — no virtual audio
 * device (BlackHole/Loopback) required.  Requires macOS 13.0+ and Screen
 * Recording permission (already granted for screen capture).
 *
 * The first message from the Rust WS is JSON metadata:
 *   { "sampleRate": 48000, "channels": 2 }
 * Every subsequent message is raw interleaved i16 LE PCM (converted from
 * SCKit’s float32 output in Rust).
 * We forward those binary frames directly to Deepgram using
 * encoding=linear16 so Deepgram knows the format.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/utils";

interface Props {
  apiKey: string;
  model?: string;
  language?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  /** When false the hook immediately stops any active stream. */
  enabled: boolean;
}

export function useNativeTabTranscription({
  apiKey,
  model = "nova-3",
  language = "en",
  onTranscript,
  enabled,
}: Props) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rustWsRef = useRef<WebSocket | null>(null);
  const dgWsRef = useRef<WebSocket | null>(null);

  // Keep latest props in refs so WS closures never go stale
  const onTranscriptRef = useRef(onTranscript);
  const apiKeyRef = useRef(apiKey);
  const modelRef = useRef(model);
  const languageRef = useRef(language);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { languageRef.current = language; }, [language]);

  // Last audio metadata received from Rust — needed for DG reconnect
  const audioMetaRef = useRef<{ sampleRate: number; channels: number } | null>(null);
  // Deepgram keepalive interval (prevents 12 s inactivity timeout during silence)
  const dgKeepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Reconnect back-off timer
  const dgReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDgTimers = useCallback(() => {
    if (dgKeepaliveRef.current) { clearInterval(dgKeepaliveRef.current); dgKeepaliveRef.current = null; }
    if (dgReconnectRef.current) { clearTimeout(dgReconnectRef.current); dgReconnectRef.current = null; }
  }, []);

  // Stable ref so openDeepgramWs can call itself recursively for reconnects
  const openDeepgramWsRef = useRef<((meta: { sampleRate: number; channels: number }) => void) | null>(null);

  // openDeepgramWs is redefined each render but always stored in the ref so
  // closures inside WS handlers get the freshest version.
  const openDeepgramWs = useCallback((meta: { sampleRate: number; channels: number }) => {
    clearDgTimers();
    // Close any existing DG connection before opening a fresh one
    dgWsRef.current?.close();
    dgWsRef.current = null;

    const dgUrl =
      `wss://api.deepgram.com/v1/listen` +
      `?model=${modelRef.current}` +
      `&punctuate=true` +
      `&interim_results=true` +
      `&language=${languageRef.current}` +
      `&smart_format=true` +
      `&endpointing=1500` +
      `&utterance_end_ms=2000` +
      `&vad_events=true` +
      `&encoding=linear16` +
      `&sample_rate=${meta.sampleRate}` +
      `&channels=${meta.channels}` +
      `&tag=craftvita-display`;

    const dgWs = new WebSocket(dgUrl, ["token", apiKeyRef.current]);
    dgWsRef.current = dgWs;

    dgWs.onopen = () => {
      setIsTranscribing(true);
      setIsConnecting(false);
      // Send KeepAlive every 8 s so Deepgram doesn't close during silence
      // (Deepgram's default inactivity timeout is ~12 s)
      dgKeepaliveRef.current = setInterval(() => {
        if (dgWsRef.current?.readyState === WebSocket.OPEN) {
          dgWsRef.current.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, 8_000);
    };

    dgWs.onmessage = (dgEvt) => {
      try {
        const data = JSON.parse(dgEvt.data as string);
        if (data.type === "Results" && data.channel?.alternatives?.[0]) {
          const alt = data.channel.alternatives[0];
          const text: string = alt.transcript;
          const isFinal: boolean = data.is_final;

          if (isFinal) {
            if (text.trim()) {
              setTranscript((p) => (p + " " + text).trim());
            }
            setInterimTranscript("");
          } else if (text) {
            setInterimTranscript(text);
          }

          if (onTranscriptRef.current && (text.trim() || !isFinal)) {
            onTranscriptRef.current(text, isFinal);
          }
        }
      } catch {
        // Ignore malformed Deepgram frames
      }
    };

    dgWs.onerror = () => {
      setError("Deepgram connection error");
    };

    dgWs.onclose = () => {
      clearDgTimers();
      // If the Rust stream is still alive, transparently reconnect Deepgram.
      // This handles Deepgram's inactivity close that occurs during long pauses
      // (e.g. the remote user is silent while the local user answers for 1-2 min).
      if (rustWsRef.current?.readyState === WebSocket.OPEN && audioMetaRef.current) {
        dgReconnectRef.current = setTimeout(() => {
          if (rustWsRef.current?.readyState === WebSocket.OPEN && audioMetaRef.current) {
            openDeepgramWsRef.current?.(audioMetaRef.current);
          }
        }, 1_500);
      } else {
        setIsTranscribing(false);
      }
    };
  }, [clearDgTimers]);

  // Keep the ref current on every render
  openDeepgramWsRef.current = openDeepgramWs;

  const stopTranscription = useCallback(async () => {
    clearDgTimers();
    rustWsRef.current?.close();
    rustWsRef.current = null;
    dgWsRef.current?.close();
    dgWsRef.current = null;
    audioMetaRef.current = null;
    setIsTranscribing(false);
    setIsConnecting(false);
    if (isTauri()) {
      try { await invoke("stop_display_audio_stream"); } catch (_) { /* best-effort */ }
    }
  }, [clearDgTimers]);

  const startTranscription = useCallback(async () => {
    // Native Tauri audio path only — silently no-op in web browser
    if (!isTauri()) return;
    // Idempotent — don't start twice
    if (isConnecting || isTranscribing) return;
    await stopTranscription();
    setError(null);
    setIsConnecting(true);

    try {
      const port = await invoke<number>("start_display_audio_stream");

      const rustWs = new WebSocket(`ws://127.0.0.1:${port}`);
      rustWs.binaryType = "arraybuffer";
      rustWsRef.current = rustWs;

      rustWs.onmessage = (evt) => {
        // ── Metadata frame (text JSON) ──────────────────────────────────
        if (typeof evt.data === "string") {
          let meta: { sampleRate: number; channels: number };
          try {
            meta = JSON.parse(evt.data);
          } catch {
            setError("Bad metadata from audio server");
            setIsConnecting(false);
            return;
          }

          // Store for reconnects
          audioMetaRef.current = meta;
          // Open (or reopen) Deepgram with the received audio format
          openDeepgramWsRef.current?.(meta);
          return;
        }

        // ── PCM binary frame ────────────────────────────────────────────
        // Forward raw i16 LE PCM bytes directly to Deepgram — zero copy,
        // zero AudioContext, works in WKWebView with no user-gesture needed.
        if (!(evt.data instanceof ArrayBuffer)) return;
        const dg = dgWsRef.current;
        if (dg?.readyState === WebSocket.OPEN) {
          dg.send(evt.data);
        }
      };

      rustWs.onerror = () => {
        setError("Audio capture WebSocket error");
        setIsConnecting(false);
      };

      rustWs.onclose = () => {
        clearDgTimers();
        setIsTranscribing(false);
        setIsConnecting(false);
      };
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setIsConnecting(false);
    }
  }, [stopTranscription, clearDgTimers, isConnecting, isTranscribing]);

  // React to `enabled` changes
  useEffect(() => {
    if (enabled) {
      startTranscription();
    } else {
      stopTranscription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dgKeepaliveRef.current) clearInterval(dgKeepaliveRef.current);
      if (dgReconnectRef.current) clearTimeout(dgReconnectRef.current);
      rustWsRef.current?.close();
      dgWsRef.current?.close();
      if (isTauri()) {
        invoke("stop_display_audio_stream").catch(() => {});
      }
    };
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    isTranscribing,
    isConnecting,
    transcript,
    interimTranscript,
    error,
    startTranscription,
    stopTranscription,
    clearTranscript,
  };
}
