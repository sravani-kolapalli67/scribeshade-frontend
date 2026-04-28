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
  // Keep latest callback ref so the WS handler never stales
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  const stopTranscription = useCallback(async () => {
    rustWsRef.current?.close();
    rustWsRef.current = null;
    dgWsRef.current?.close();
    dgWsRef.current = null;
    setIsTranscribing(false);
    setIsConnecting(false);
    try { await invoke("stop_display_audio_stream"); } catch (_) { /* best-effort */ }
  }, []);

  const startTranscription = useCallback(async () => {
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

          const { sampleRate, channels } = meta;

          // Open Deepgram WS for raw linear16 PCM at the native cpal rate.
          // No AudioContext, no MediaRecorder — just binary forwarding.
          const dgUrl =
            `wss://api.deepgram.com/v1/listen` +
            `?model=${model}` +
            `&punctuate=true` +
            `&interim_results=true` +
            `&language=${language}` +
            `&smart_format=true` +
            `&endpointing=500` +
            `&utterance_end_ms=1000` +
            `&vad_events=true` +
            `&encoding=linear16` +
            `&sample_rate=${sampleRate}` +
            `&channels=${channels}` +
            `&tag=craftvita-display`;

          const dgWs = new WebSocket(dgUrl, ["token", apiKey]);
          dgWsRef.current = dgWs;

          dgWs.onopen = () => {
            setIsTranscribing(true);
            setIsConnecting(false);
          };

          dgWs.onmessage = (dgEvt) => {
            try {
              const data = JSON.parse(dgEvt.data);
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
            setIsTranscribing(false);
          };
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
        setIsTranscribing(false);
        setIsConnecting(false);
      };
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setIsConnecting(false);
    }
  }, [apiKey, model, language, stopTranscription, isConnecting, isTranscribing]);

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
      rustWsRef.current?.close();
      dgWsRef.current?.close();
      invoke("stop_display_audio_stream").catch(() => {});
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
