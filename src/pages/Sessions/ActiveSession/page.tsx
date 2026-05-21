import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useDeepgram } from "@/hooks/useDeepgram";
import { useScreenShare } from "@/hooks/useScreenShare";
import { useNativeTabTranscription } from "@/hooks/useNativeTabTranscription";
import { useAIChat } from "@/hooks/useAIChat";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useFreeSessionTimer } from "@/hooks/useFreeSessionTimer";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { toast } from "sonner";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/utils";
import { detectIntent, isFillerPhrase } from "@/lib/intent-detector";
import {
  createTranscriptStabilizer,
  prepareGeneration,
  shouldTriggerGeneration,
  classifyTranscript,
  isContinuationOfPreviousQuestion,
} from "@/lib/generation-pipeline";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { ScreenCapture } from "./components/ScreenCapture";
import { AIChatPanel } from "./components/AIChatPanel";
import { OverlayContainer } from "./components/OverlayContainer";
import { EndSessionDialog } from "./EndSessionDialog";
import { Transcript, type Message } from "./Transcript";
import {
  ActivateResponseData,
  ConnectDialog,
} from "@/components/Sessions/ConnectDialog";
import { BuyCreditsDialog } from "@/components/Billing/BuyCreditsDialog";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";
import { useCreditBrackets } from "@/hooks/useCreditBrackets";

/**
 * Segments a single transcript chunk into individual interview questions.
 *
 * Handles three patterns commonly produced by interviewer speech:
 *   1. '?'-terminated:        "What is X? How does Y work?"
 *   2. Digit-numbered list:   "1. Explain X. 2. Explain Y."
 *   3. Word-numbered list:    "One: X. Two, Y. Three: Z."
 *
 * Returns an empty array if no clear segmentation is detected — caller falls
 * back to treating the whole chunk as one question.
 */
function segmentQuestions(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Word-number prefixes (lowercase): used to split spoken numbered lists.
  const wordNumbers =
    "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)";

  // Pattern: a number marker (digit or word) followed by `:`, `.`, `,`, `)` or whitespace
  // Examples matched: "1.", "1)", "Two:", "Three,", "Four "
  // We use lookahead to KEEP the marker on the next segment.
  const numberedPattern = new RegExp(
    `(?=(?:^|[\\s.])\\s*(?:\\d{1,2}|${wordNumbers})\\s*[.:),]\\s+)`,
    "gi",
  );

  // First try numbered split.
  const numberedParts = trimmed
    .split(numberedPattern)
    .map((s) => s.trim())
    .filter((s) => s.length > 6);

  if (numberedParts.length >= 2) {
    return numberedParts;
  }

  // Otherwise split on '?' boundaries (preserving the '?').
  const questionParts = trimmed
    .split(/(?<=\?)\s+/g)
    .map((s) => s.trim())
    .filter((s) => s.endsWith("?") && s.length > 6);

  if (questionParts.length >= 1) return questionParts;

  return [];
}

/**
 * Deduplicates repeated adjacent phrases within a single transcript string (up to 6 words).
 */
function deduplicatePhrases(text: string): string {
  let cleaned = text.replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ");
  for (let n = 1; n <= Math.min(6, Math.floor(words.length / 2)); n++) {
    for (let i = 0; i <= words.length - 2 * n; i++) {
      const first = words.slice(i, i + n).join(" ").toLowerCase();
      const second = words.slice(i + n, i + 2 * n).join(" ").toLowerCase();
      const normFirst = first.replace(/[^a-z0-9\s]/gi, "").trim();
      const normSecond = second.replace(/[^a-z0-9\s]/gi, "").trim();
      if (normFirst === normSecond && normFirst.length > 0) {
        words.splice(i + n, n);
        i--; // Step back to check again with the updated array
      }
    }
  }
  return words.join(" ");
}

/**
 * Removes sliding-window overlaps between the end of lastText and the start of newText.
 */
function removeOverlap(lastText: string, newText: string): string {
  const normLast = lastText.toLowerCase().trim().replace(/[^a-z0-9\s]/gi, "");
  const normNew = newText.toLowerCase().trim().replace(/[^a-z0-9\s]/gi, "");
  
  const lastWords = normLast.split(/\s+/);
  const newWords = normNew.split(/\s+/);
  
  let overlapWordsCount = 0;
  const maxSearch = Math.min(lastWords.length, newWords.length, 15);
  
  for (let len = 1; len <= maxSearch; len++) {
    const lastSuffix = lastWords.slice(-len).join(" ");
    const newPrefix = newWords.slice(0, len).join(" ");
    if (lastSuffix === newPrefix) {
      overlapWordsCount = len;
    }
  }
  
  if (overlapWordsCount > 0) {
    const actualNewWords = newText.trim().split(/\s+/);
    return actualNewWords.slice(overlapWordsCount).join(" ");
  }
  
  return newText;
}

export default function ActiveSession() {
  useEffect(() => {
    if (!isTauri()) return;
    invoke("set_session_active", { active: true });
    return () => {
      invoke("set_session_active", { active: false });
    };
  }, []);

  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isEndSessionDialogOpen, setIsEndSessionDialogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const PREFERRED_MODEL_KEY = "scribeshade_preferred_model";
  const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";
  
  // Available models - should match ModelSelector.AI_MODELS
  const AVAILABLE_MODELS = [
    "anthropic/claude-haiku-4-5",
    "anthropic/claude-sonnet-4-5",
    "google/gemini-3.1-flash-lite-preview",
    "openai/gpt-5",
  ];
  
  const [selectedModel, setSelectedModel] = useState(() => {
    // Priority: 1. Navigation state, 2. Stored preference (if valid), 3. Default
    const navModel = location.state?.connectData?.aiModel;
    const storedModel = localStorage.getItem(PREFERRED_MODEL_KEY);
    
    // Validate and return a valid model
    if (navModel && AVAILABLE_MODELS.includes(navModel)) {
      return navModel;
    }
    if (storedModel && AVAILABLE_MODELS.includes(storedModel)) {
      return storedModel;
    }
    return DEFAULT_MODEL;
  });

  const [selectedLanguage, setSelectedLanguage] = useState(
    location.state?.connectData?.language || "English",
  );
  const selectedModelRef = useRef(selectedModel);
  // Keep ref in sync so callbacks that close over it always read the latest model.
  useEffect(() => {
    selectedModelRef.current = selectedModel;
    // Persist to localStorage whenever it changes
    localStorage.setItem(PREFERRED_MODEL_KEY, selectedModel);
  }, [selectedModel]);


  // Stable ref to handleAiAnswer — set after useAIChat() is called below.
  // Using a ref allows handleTranscript (defined before useAIChat) to call
  // handleAiAnswer without creating a forward-reference ordering problem.
  const handleAiAnswerRef = useRef<((sessionId: string, question: string, aiModel: string) => void) | null>(null);

  const getLanguageCode = (lang: string) => {
    const mapping: Record<string, string> = {
      English: "en",
      Spanish: "es",
      French: "fr",
      German: "de",
      Hindi: "hi",
      Arabic: "ar",
      Chinese: "zh",
      Portuguese: "pt",
      Japanese: "ja",
    };
    return mapping[lang] || "en";
  };

  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(
    !!location.state?.showConnect,
  );
  const connectData = location.state?.connectData || {};
  // Ephemeral mode flag — false means nothing persists after the session ends.
  // Defaults to true to match backend (saveTranscription defaults to true).
  const saveTranscriptEnabled: boolean = connectData?.saveTranscript !== false;

  // Activate response data — populated once the ConnectDialog succeeds
  const [maxAllowedMinutes, setMaxAllowedMinutes] = useState<number | null>(
    null,
  );
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [creditWarning, setCreditWarning] = useState<number | null>(null); // remaining minutes
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const { refresh: refreshBalance } = useCreditsBalance();
  const { brackets: creditBrackets } = useCreditBrackets();
  const graceZoneMinutes = creditBrackets[0]?.graceZoneMinutes ?? 5;
  const creditsPerMinute = parseFloat(creditBrackets[0]?.creditsPerMinute ?? "0.5");

  const handleConnectSuccess = useCallback(
    (
      finalModel: string,
      finalLanguage: string,
      activateData: ActivateResponseData,
    ) => {
      setIsConnectDialogOpen(false);
      if (finalModel) setSelectedModel(finalModel);
      if (finalLanguage) setSelectedLanguage(finalLanguage);
      setMaxAllowedMinutes(activateData.maxAllowedMinutes);
      setSessionStartedAt(activateData.startedAt);
    },
    [],
  );

  const handleConnectCancel = useCallback(() => {
    setIsConnectDialogOpen(false);
    navigate("/sessions");
  }, [navigate]);

  const stopHeartbeatRef = useRef<(() => void) | null>(null);
  const isEndingRef = useRef(false);
  const sessionStartedAtRef = useRef<string | null>(null);

  // Keep ref in sync with state so endSessionNow always reads the latest value
  sessionStartedAtRef.current = sessionStartedAt;

  const endSessionNow = useCallback(async () => {
    if (!id) return;
    // Guard against double-invocation (both heartbeat and SSE can fire simultaneously)
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    toast.info("Ending session...", {
      duration: 3000,
    });

    // Stop heartbeat immediately so no new ticks fire during cleanup
    stopHeartbeatRef.current?.();

    // Calculate exact elapsed duration so the backend can apply the free-zone rule
    // Use ref to get the latest value (avoids stale closure — sessionStartedAt not in deps)
    const startedAt = sessionStartedAtRef.current;
    const durationMinutes = startedAt
      ? Math.ceil((Date.now() - new Date(startedAt).getTime()) / 60_000)
      : null;

    // Client-side grace-zone determination (≤ graceZoneMinutes → no charge)
    const isFreeZone = durationMinutes !== null && durationMinutes <= graceZoneMinutes;

    try {
      // For ephemeral sessions, do NOT send transcript to the backend.
      // Sending it would trigger background analytics generation on the server.
      const transcript = saveTranscriptEnabled
        ? messages.map((m) => `[${m.sender}]: ${m.text}`).join("\n")
        : undefined;
      const aiUsage = parseInt(localStorage.getItem(`aiUsage_${id}`) || "0");
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/session/${id}/deactivate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transcript, aiUsage, durationMinutes }),
        },
      );
      localStorage.removeItem(`aiUsage_${id}`);

      // Grace-zone: no credits charged — no need to poll
      if (isFreeZone) {
        toast.success(`Session ended — no credits charged (under ${graceZoneMinutes} min)`);
      }

      // For paid sessions, wait up to 8 seconds for the BullMQ job to mark
      // the session COMPLETED before navigating away.
      if (res.ok && maxAllowedMinutes !== null && !isFreeZone) {
        const data = await res.json();
        if (data.status === "COMPLETING") {
          let attempts = 0;
          let deductedCredits: string | null = null;
          let deductedReason: string | null = null;
          while (attempts < 4) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const poll = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/session/${id}`,
              );
              if (poll.ok) {
                const session = await poll.json();
                const sessionData = session.data || session;
                const status = sessionData?.status;
                deductedCredits = sessionData?.creditsDeducted ?? null;
                deductedReason = sessionData?.deductionReason ?? null;
                if (status === "COMPLETED" || status === "CREDIT_EXHAUSTED")
                  break;
              }
            } catch {
              // ignore poll errors — we'll navigate regardless
            }
            attempts++;
          }
          if (deductedReason === "FREE_ZONE") {
            toast.success(`Session ended — no credits charged (under ${graceZoneMinutes} min)`);
          } else if (deductedCredits) {
            const mins = durationMinutes ?? 0;
            toast.info(`Session ended — ${deductedCredits} credits deducted (${mins} min × ${creditsPerMinute} credits/min)`);
          }
        }
      }
    } catch (error) {
      console.error("Error ending session directly:", error);
    } finally {
      // Stop all transcription streams and screen share gracefully
      try {
        // Stop mic transcription
        if (!isTauri()) {
          micTranscription.stopTranscription();
        } else {
          // For Tauri, invoke the stop command
          await invoke("stop_mic_transcription").catch(() => {});
        }
        
        // Stop tab transcription (browser only)
        if (!isTauri()) {
          tabTranscription.stopTranscription();
          tabAudioTranscription.stopTranscription();
        }
        
        // Stop screen share stream
        if (stream) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (e) {
              console.warn("Error stopping track:", e);
            }
          });
        }
      } catch (err) {
        console.error("Stream cleanup error:", err);
      }

      // Clean up overlay and main windows
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const mini = await WebviewWindow.getByLabel("mini");
        if (mini) {
          await mini.close();
        }
        const mainWindow = await WebviewWindow.getByLabel("main");
        if (mainWindow) {
          await mainWindow.show();
          await mainWindow.unminimize();
          await mainWindow.setFocus();
        }
      } catch (err) {
        console.error("Window mgmt error:", err);
      }
      navigate("/sessions");
    }
  }, [id, messages, maxAllowedMinutes, navigate, saveTranscriptEnabled, graceZoneMinutes, creditsPerMinute]);

  const onTimeUp = useCallback(async () => {
    toast.info("Free session time is up!");
    endSessionNow();
  }, [endSessionNow]);

  const onCreditExhausted = useCallback(() => {
    toast.error("Session ended — credits exhausted.", { duration: 6000 });
    endSessionNow();
  }, [endSessionNow]);

  const onCreditWarning = useCallback((remaining: number) => {
    setCreditWarning(remaining);
    toast.warning(
      `Only ${remaining} minute${remaining === 1 ? "" : "s"} of credit remaining!`,
      { duration: 8000 },
    );
  }, []);

  const { isFreeSession, formattedTime } = useFreeSessionTimer({
    sessionId: id,
    onTimeUp,
    maxAllowedMinutes,
  });

  // Heartbeat: runs every 60s for paid sessions after activation
  const { stop: stopHeartbeat } = useSessionHeartbeat({
    sessionId: id,
    enabled:
      !isFreeSession && !isConnectDialogOpen && sessionStartedAt !== null,
    startedAt: sessionStartedAt,
    onExhausted: onCreditExhausted,
    onWarning: onCreditWarning,
  });

  // SSE: real-time events for paid sessions
  useSessionEvents({
    sessionId: id,
    enabled:
      !isFreeSession && !isConnectDialogOpen && sessionStartedAt !== null,
    onExhausted: onCreditExhausted,
    onWarning: onCreditWarning,
  });

  // Keep the ref current so endSessionNow (defined above) can call stop
  stopHeartbeatRef.current = stopHeartbeat;

  //   const { showDialog: showInactivityDialog, remainingTime, onStayActive } = useInactivityObserver(
  //     undefined, // Use default from env
  //     endSessionNow
  //   );

  const { stream, videoRef, startShare, captureScreenshot } = useScreenShare();

  // NOTE: Do NOT auto-start getDisplayMedia from useEffect — WKWebView in
  // production strictly requires getDisplayMedia to originate from a direct
  // synchronous user gesture (button click). The ScreenCapture panel's
  // "Select Screen / Tab" button serves as the user gesture entry point.

  const autoGenerateResponse = location.state?.connectData?.autoGenerateResponse ?? false;

  // ── Comprehensive cleanup on unmount ──────────────────────────────────────
  // Each transcription hook (useDeepgram, useNativeTabTranscription) has its own
  // cleanup effect that calls stopTranscription(). We don't duplicate that here.
  // The parent only cleans up screen stream and internal refs.
  useEffect(() => {
    return () => {
      // Stop screen share stream (not handled by hooks)
      try {
        if (stream) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (e) {
              console.warn("Error stopping screen track on unmount:", e);
            }
          });
        }
      } catch (err) {
        console.warn("Error stopping screen stream on unmount:", err);
      }

      // Clear pending timers and refs (not handled by hooks)
      try {
        pendingTranscriptRef.current = [];
        stabilizerRef.current?.destroy();
        stabilizerRef.current = null;
        previousAutoContextRef.current = null;
      } catch (err) {
        console.warn("Error clearing refs on unmount:", err);
      }
    };
    // Empty dependency array ensures this only runs on unmount
  }, []);

  // ── Screen stream cleanup on stream change ──────────────────────────────────
  // When user picks a new tab/screen, the old stream's tracks should stop.
  // This is separate from the unmount cleanup to handle mid-session stream changes.
  useEffect(() => {
    return () => {
      // This cleanup runs when the component unmounts OR when 'stream' changes
      // If stream changes (user picked a new tab), the old stream is cleaned up
      // by the useScreenShare hook, so this is just a safety measure.
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            if (track.readyState === 'live') {
              track.stop();
            }
          } catch (e) {
            console.warn("Error stopping screen track in stream cleanup:", e);
          }
        });
      }
    };
  }, [stream]);


  // Monotonic sequence + per-source dedup memory.
  // - `transcriptSeqRef` provides a strict ordering stamp on every accepted
  //   transcript chunk. Useful for replay safety and downstream consumers.
  // - `recentChunksRef` remembers the last ~20 normalized chunks per source
  //   with their timestamp so duplicate websocket events / replays / Deepgram
  //   re-emits cannot create double entries even outside the cross-source
  //   echo window below.
  const transcriptSeqRef = useRef(0);
  const recentChunksRef = useRef<{ key: string; t: number }[]>([]);

  // ── Interviewer-chunk debouncing (auto-answer pipeline) ───────────────────
  // Speech-to-text emits each spoken sentence as its own `isFinal: true`
  // chunk. A scenario-style prompt ("Your company is building... Suddenly...
  // API time spiked... How would you fix it?") arrives as 6-10 separate
  // chunks within ~5-10 seconds. If we fire the AI on every chunk we get:
  //   (a) 8 redundant AI calls + 8 cards in the UI for ONE question
  //   (b) early calls only see a fragment ("Suddenly,") and answer nonsense
  //   (c) wasted credits
  //
  // Strategy: buffer interviewer chunks; reset a 1.8 s silence timer on each
  // new chunk; when the timer fires (no speech for 1.8 s), treat the whole
  // joined buffer as a single transcript and run segmentQuestions on it.
  // This naturally merges scenario fragments into one AI call while still
  // producing one AI call per question for genuinely separate spoken
  // questions (since speakers pause >1.8 s between distinct topics).
  const pendingTranscriptRef = useRef<string[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DEBOUNCE_MS = 1200;

  // Stabilizer-based auto-answer pipeline
  const stabilizerRef = useRef<ReturnType<typeof createTranscriptStabilizer> | null>(null);
  const previousAutoContextRef = useRef<{ transcript: string; timestamp: number } | null>(null);

  // Clear any pending debounce timer and refs on unmount (also covered by
  // comprehensive cleanup above, but kept for clarity of intent).
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  const handleTranscript = useCallback(
    (sender: "User" | "Interviewer", text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        const now = Date.now();
        console.log(`[Transcript Final Input] ${sender}: ${text}`);
        setMessages((prev) => {
          let cleanText = deduplicatePhrases(text);
          // removeOverlap is only meaningful for the Interviewer (tab/system audio)
          // path where Deepgram streams overlapping context windows. Applying it
          // to User (mic) transcription strips valid words that happen to match
          // the end of the previous message, silently dropping mic utterances.
          if (sender === "Interviewer") {
            const lastSameSenderMsg = [...prev].reverse().find((m) => m.sender === sender);
            if (lastSameSenderMsg) {
              cleanText = removeOverlap(lastSameSenderMsg.text, cleanText);
            }
          }
          cleanText = cleanText.trim();
          if (!cleanText) {
            console.log(`[Dedupe] Empty after overlap removal from ${sender}: "${text}"`);
            return prev;
          }

          const normalizedNew = cleanText.toLowerCase().trim().replace(/[^a-z0-9\s]/gi, "");
          const ownKey = `${sender}::${normalizedNew}`;

          // ── Pass 1: same-source replay/duplicate within 5s ────────────
          // Catches Deepgram re-emitting the same final, websocket reconnect replays.
          // IMPORTANT: Only suppress if ALREADY in current state. This prevents
          // React StrictMode double-renders from suppressing valid new messages.
          // StrictMode renders the component twice in dev; the second render with
          // the same input should add the message, not suppress it.
          const isAlreadyInState = prev.some((m) => {
            if (m.sender !== sender) return false;
            const normExisting = m.text
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9\s]/gi, "");
            return normExisting === normalizedNew;
          });

          if (isAlreadyInState) {
            console.log(`[Dedup-self] Suppressed replay from ${sender}: "${cleanText}"`);
            return prev;
          }

          // Track in ref for future dedup, but don't use it to suppress messages
          // that aren't already in state.
          const recent = recentChunksRef.current.filter((c) => now - c.t < 5000);
          recentChunksRef.current = [...recent, { key: ownKey, t: now }].slice(-20);

          // ── Pass 2: cross-source echo within 2s (mic ↔ tab audio) ─────
          const isEcho = prev.some((m) => {
            if (!m.timestamp || now - m.timestamp > 2000) return false;
            const normalizedExisting = m.text
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9\s]/gi, "");
            return (
              normalizedExisting === normalizedNew ||
              normalizedExisting.includes(normalizedNew) ||
              normalizedNew.includes(normalizedExisting)
            );
          });

          if (isEcho) {
            console.log(`[Dedupe] Suppressed echo from ${sender}: "${cleanText}"`);
            return prev;
          }

          // Stable, content-derived id — same chunk replayed across renders
          // produces the same id, so React keys never accidentally split a
          // single utterance into two list items.
          const seq = ++transcriptSeqRef.current;
          const stableId = `t-${seq}-${sender[0]}-${normalizedNew.slice(0, 24)}`;

          const newMsg: Message = {
            id: stableId,
            sender,
            text: cleanText,
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            timestamp: now,
          };

          // Save to backend — skip entirely for ephemeral sessions, and skip under Tauri
          // because the mini window (useFloatingSession) handles DB persistence for Tauri.
          if (saveTranscriptEnabled && !isTauri()) {
            fetch(
              `${import.meta.env.VITE_BACKEND_URL}/api/session/${id}/save-message`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  role: sender === "User" ? "USER" : "INTERVIEWER",
                  question: cleanText,
                  answer: "",
                  time: newMsg.time,
                }),
              },
            ).catch((err) =>
              console.error("Failed to save transcript segment:", err),
            );
          }

          // Auto-answer: when the user opted in during session setup, each
          // finalised Interviewer chunk is buffered. The AI call fires only
          // after DEBOUNCE_MS of silence so multi-sentence scenarios
          // ("Your company is building... Suddenly... How would you fix it?")
          // arrive as ONE coherent prompt instead of 8 fragmented calls.
          //
          // Multi-question handling: once the silence window elapses, the
          // joined buffer is segmented using segmentQuestions(); each truly
          // distinct question (numbered list, '?'-terminated sequence, or
          // word-numbered list) gets its own AI call with a small stagger.
          if (sender === "Interviewer" && autoGenerateResponse && id) {
            pendingTranscriptRef.current.push(cleanText);
            const joined = pendingTranscriptRef.current.join(" ").trim();
            stabilizerRef.current?.feed(joined);
          }

          return [...prev, newMsg];
        });
      }
    },
    [id, autoGenerateResponse, saveTranscriptEnabled],
  );

  const onUserTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      handleTranscript("User", text, isFinal);
    },
    [handleTranscript],
  );

  const onInterviewerTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      handleTranscript("Interviewer", text, isFinal);
    },
    [handleTranscript],
  );

  const micTranscription = useDeepgram({
    apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY || "",
    model: "nova-3",
    language: getLanguageCode(selectedLanguage),
    onTranscript: onUserTranscript,
  });

  const currentMicDevice = micTranscription.currentDeviceLabel;

  // Display audio transcription: SCKit (Rust) ─► localhost WS ─► Deepgram WS
  // Captures the primary display's system audio directly via ScreenCaptureKit,
  // so YouTube/tab audio is transcribed — not the microphone.
  // SCKit works independently of getDisplayMedia — no need to wait for stream.
  const tabTranscription = useNativeTabTranscription({
    apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY || "",
    model: "nova-3",
    language: getLanguageCode(selectedLanguage),
    onTranscript: onInterviewerTranscript,
    enabled: !isConnectDialogOpen && !isTauri(),
  });

  // ── Browser tab audio transcription (getDisplayMedia path) ────────────────
  // When the user shares a tab/window with "Also share tab audio" / "Include
  // audio" enabled, the MediaStream contains audio tracks.  We pipe those
  // directly into a second Deepgram instance so the Interviewer side of the
  // transcript is populated even without the macOS SCKit backend.
  const streamHasAudio = !!stream && stream.getAudioTracks().length > 0;

  const tabAudioTranscription = useDeepgram({
    apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY || "",
    model: "nova-3",
    language: getLanguageCode(selectedLanguage),
    onTranscript: onInterviewerTranscript,
    inputStream: streamHasAudio ? stream : null,
  });

  // Auto-start / stop browser tab audio transcription based on stream audio
  useEffect(() => {
    if (isTauri()) return;
    if (streamHasAudio) {
      tabAudioTranscription.startTranscription();
    } else {
      tabAudioTranscription.stopTranscription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamHasAudio]);

  // Surface cpal errors as toasts
  useEffect(() => {
    if (isTauri()) return;
    if (tabTranscription.error) toast.error(tabTranscription.error);
  }, [tabTranscription.error]);

  // Surface browser tab audio errors as toasts
  useEffect(() => {
    if (tabAudioTranscription.error) toast.error(tabAudioTranscription.error);
  }, [tabAudioTranscription.error]);

  // Tauri STT states
  const [tauriMicActive, setTauriMicActive] = useState(false);
  const [tauriMicConnecting, setTauriMicConnecting] = useState(false);
  const [tauriMicInterim, setTauriMicInterim] = useState("");

  const [tauriTabActive, setTauriTabActive] = useState(false);
  const [tauriTabConnecting, setTauriTabConnecting] = useState(false);
  const [tauriTabInterim, setTauriTabInterim] = useState("");
  const [tauriError, setTauriError] = useState<string | null>(null);

  // ── Unified transcription states (Tauri vs Web) ──────────────────────────
  const isMicTranscribing = isTauri() ? tauriMicActive : micTranscription.isTranscribing;
  const isMicConnectingState = isTauri() ? tauriMicConnecting : micTranscription.isConnecting;
  const activeMicInterimTranscript = isTauri() ? tauriMicInterim : micTranscription.interimTranscript;

  const mergedTabIsTranscribing = isTauri()
    ? tauriTabActive
    : (tabTranscription.isTranscribing || tabAudioTranscription.isTranscribing);
  const mergedTabIsConnecting = isTauri()
    ? tauriTabConnecting
    : (tabTranscription.isConnecting || tabAudioTranscription.isConnecting);
  const mergedTabInterimTranscript = isTauri()
    ? tauriTabInterim
    : (tabTranscription.interimTranscript || tabAudioTranscription.interimTranscript);
  const mergedTabError = isTauri()
    ? tauriError
    : (tabTranscription.error || tabAudioTranscription.error);

  const onUserTranscriptRef = useRef(onUserTranscript);
  const onInterviewerTranscriptRef = useRef(onInterviewerTranscript);

  useEffect(() => {
    onUserTranscriptRef.current = onUserTranscript;
  }, [onUserTranscript]);

  useEffect(() => {
    onInterviewerTranscriptRef.current = onInterviewerTranscript;
  }, [onInterviewerTranscript]);

  // Tauri STT listeners
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenMicTx: (() => void) | undefined;
    let unlistenMicSt: (() => void) | undefined;
    let unlistenSysTx: (() => void) | undefined;
    let unlistenSysSt: (() => void) | undefined;

    // Mic transcript listener
    listen<{ text: string; is_final: boolean }>("stt:mic", (event) => {
      const { text, is_final } = event.payload;
      if (is_final) {
        setTauriMicInterim("");
        onUserTranscriptRef.current(text, true);
      } else {
        setTauriMicInterim(text);
      }
    }).then((fn) => { unlistenMicTx = fn; }).catch(() => {});

    // Mic status listener
    listen<{ status: string; error?: string }>("stt:status:mic", (event) => {
      const { status, error } = event.payload;
      if (status === "transcribing") {
        setTauriMicActive(true);
        setTauriMicConnecting(false);
      } else if (status === "connecting") {
        setTauriMicConnecting(true);
      } else {
        setTauriMicActive(false);
        setTauriMicConnecting(false);
      }
      if (status === "error" && error) {
        setTauriError(error);
        toast.error(`Mic: ${error}`);
      } else if (status === "transcribing") {
        setTauriError(null);
      }
    }).then((fn) => { unlistenMicSt = fn; }).catch(() => {});

    // System audio transcript listener
    listen<{ text: string; is_final: boolean }>("stt:system-audio", (event) => {
      const { text, is_final } = event.payload;
      if (is_final) {
        setTauriTabInterim("");
        onInterviewerTranscriptRef.current(text, true);
      } else {
        setTauriTabInterim(text);
      }
    }).then((fn) => { unlistenSysTx = fn; }).catch(() => {});

    // System audio status listener
    listen<{ status: string; error?: string }>("stt:status:system", (event) => {
      const { status, error } = event.payload;
      if (status === "transcribing") {
        setTauriTabActive(true);
        setTauriTabConnecting(false);
      } else if (status === "connecting") {
        setTauriTabConnecting(true);
      } else {
        setTauriTabActive(false);
        setTauriTabConnecting(false);
      }
      if (status === "error" && error) {
        setTauriError(error);
        toast.error(`System Audio: ${error}`);
      } else if (status === "transcribing") {
        setTauriError(null);
      }
    }).then((fn) => { unlistenSysSt = fn; }).catch(() => {});

    return () => {
      unlistenMicTx?.();
      unlistenMicSt?.();
      unlistenSysTx?.();
      unlistenSysSt?.();
    };
  }, []);

  const toggleTauriOrBrowserMic = useCallback(async () => {
    if (isTauri()) {
      if (tauriMicActive || tauriMicConnecting) {
        await invoke("stop_mic_transcription").catch(() => {});
        setTauriMicActive(false);
        setTauriMicConnecting(false);
        setTauriMicInterim("");
      } else {
        setTauriMicConnecting(true);
        try {
          await invoke("start_mic_transcription", {
            language: getLanguageCode(selectedLanguage),
            model: "nova-3",
          });
        } catch (e) {
          toast.error(`Mic: ${String(e)}`);
          setTauriMicConnecting(false);
        }
      }
    } else {
      if (micTranscription.isTranscribing) {
        micTranscription.stopTranscription();
      } else {
        micTranscription.startTranscription();
      }
    }
  }, [selectedLanguage, tauriMicActive, tauriMicConnecting, micTranscription]);

  const {
    aiChat,
    setAiChat,
    inputMessage,
    setInputMessage,
    isAnalyzing,
    isAnswering,
    handleAnalyzeScreen,
    handleAiAnswer,
    handleCustomQuery,
    handleRegenerate,
  } = useAIChat();

  // Wire handleAiAnswer into the stable ref so handleTranscript can call it.
  handleAiAnswerRef.current = handleAiAnswer;

  // Stable ref for handleStableTranscript so the stabilizer callback always
  // invokes the latest version without recreating the stabilizer instance.
  const handleStableTranscriptRef = useRef<((t: string) => void) | null>(null);

  const handleStableTranscript = useCallback((stableTranscript: string) => {
    if (!id || !handleAiAnswer) return;

    // Get classification with previous context for continuation detection
    const classification = classifyTranscript(
      stableTranscript,
      previousAutoContextRef.current?.transcript,
    );

    // Check continuation — if within 8s of previous, check if it's a follow-up
    if (previousAutoContextRef.current) {
      const timeDelta = Date.now() - previousAutoContextRef.current.timestamp;
      if (
        isContinuationOfPreviousQuestion(
          stableTranscript,
          previousAutoContextRef.current.transcript,
          timeDelta,
        )
      ) {
        // Merge with previous and re-classify
        const merged =
          previousAutoContextRef.current.transcript + " " + stableTranscript;
        // The pipeline's prepareGeneration handles merging internally,
        // but we pass the previous context so it can detect continuation
        // eslint-disable-next-line no-console
        console.log(
          "[AutoAnswer] Continuation detected, merged:",
          merged.slice(0, 80),
        );
      }
    }

    // Use shouldTriggerGeneration to decide
    const triggerResult = shouldTriggerGeneration({
      transcript: stableTranscript,
      isStable: true,
      classification,
      lastGenerationTimestamp: previousAutoContextRef.current?.timestamp ?? 0,
      recentQuestions: [], // The useAIChat hook handles its own recent dedup
    });

    if (!triggerResult.trigger) {
      // eslint-disable-next-line no-console
      console.log("[AutoAnswer] Skipped:", triggerResult.reason);
      return;
    }

    // Route based on classification
    if (classification.shouldGroup) {
      // Grouped scenario: ONE call with full transcript
      handleAiAnswer(id, stableTranscript, selectedModel);
    } else {
      // Independent questions: call for each segment with stagger
      const segments = classification.segments;
      segments.forEach((segment, index) => {
        setTimeout(() => {
          handleAiAnswer(id, segment, selectedModel);
        }, index * 500);
      });
    }

    // Clear the pending buffer so the next batch starts fresh
    pendingTranscriptRef.current = [];

    // Update previous context for continuation detection
    previousAutoContextRef.current = {
      transcript: stableTranscript,
      timestamp: Date.now(),
    };
  }, [id, selectedModel, handleAiAnswer]);

  handleStableTranscriptRef.current = handleStableTranscript;

  // Initialize stabilizer with 1200ms freeze window
  useEffect(() => {
    if (!stabilizerRef.current) {
      stabilizerRef.current = createTranscriptStabilizer(
        (stableSnapshot) => {
          handleStableTranscriptRef.current?.(stableSnapshot);
        },
        { freezeWindowMs: 1200 },
      );
    }
    return () => {
      stabilizerRef.current?.destroy();
      stabilizerRef.current = null;
    };
  }, []);

  // Restore persisted transcript + AI answers on mount (survives refresh / back-nav).
  // Skipped entirely for ephemeral sessions — nothing should be restored.
  const historyLoadedRef = useRef(false);

  // Status-aware redirect: if a user lands on /sessions/:id for a session that
  // has already ended (COMPLETED, ABANDONED, FORCE_ENDED, AUTO_ENDED,
  // CREDIT_EXHAUSTED, COMPLETING), bounce them to the sessions list with the
  // transcript dialog auto-opened. The fresh-creation flow sets
  // location.state.showConnect=true, so we never redirect in that case.
  const statusCheckRef = useRef(false);
  useEffect(() => {
    if (!id || statusCheckRef.current) return;
    if (location.state?.showConnect) return;
    statusCheckRef.current = true;

    const LIVE_STATUSES = new Set(["ACTIVE", "PAUSED", "DISCONNECTED", "PRE_CHECK"]);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const sessionData = data.data ?? data;
        const status = sessionData?.status;
        if (status && !LIVE_STATUSES.has(String(status).toUpperCase())) {
          navigate(`/sessions?view=${id}`, { replace: true });
        }
      })
      .catch(() => {
        // Best-effort — if the status probe fails, fall through to normal flow.
      });
  }, [id, location.state?.showConnect, navigate]);

  useEffect(() => {
    if (!id || historyLoadedRef.current) return;
    // Ephemeral mode: the backend returns empty messages/transcript and the user
    // never expects data to survive a reload, so skip the restore fetch entirely.
    if (!saveTranscriptEnabled) return;
    historyLoadedRef.current = true;

    fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const sessionData = data.data ?? data;
        const storedMessages: any[] = Array.isArray(sessionData.messages) ? sessionData.messages : [];
        if (storedMessages.length === 0) return;

        const transcriptMsgs: Message[] = [];
        const aiMsgs: Message[] = [];

        storedMessages.forEach((m: any, i: number) => {
          const time = m.time || new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          if (m.role === "AI_ASSISTANT") {
            // AI answer — show the answer text; store original question for regeneration
            const text = m.answer || m.question || "";
            if (text) {
              aiMsgs.push({
                id: `hist-ai-${i}`,
                sender: "AI",
                text,
                time,
                // Restore the original question so Regenerate works on history entries too.
                question: m.question || "",
                snapshotId: m.snapshotId,
              });
            }
          } else {
            // USER or INTERVIEWER transcript line
            const sender = m.role === "USER" ? "User" : "Interviewer";
            const text = m.question || "";
            if (text) {
              transcriptMsgs.push({ id: `hist-${i}`, sender, text, time, timestamp: m.timestamp ? new Date(m.timestamp).getTime() : undefined });
            }
          }
        });

        if (transcriptMsgs.length > 0) setMessages(transcriptMsgs);
        if (aiMsgs.length > 0) setAiChat(aiMsgs);
      })
      .catch((err) => console.error("[Session] Failed to restore history:", err));
  }, [id, setAiChat]);

  const isExecutingRef = useRef(false);

  const onAnalyzeScreen = useCallback(
    async (payload?: any) => {
      if (isExecutingRef.current || !id) return;
      isExecutingRef.current = true;
      try {
        console.log("[Trigger] Analyze Screen initiated");
        let screenshot: Blob | null = null;

        if (payload?.screenshotData) {
          // Convert base64 to Blob
          const base64Data = payload.screenshotData.split(",")[1];
          const contentType = payload.screenshotData
            .split(",")[0]
            .split(":")[1]
            .split(";")[0];
          const byteCharacters = atob(base64Data);
          const byteArrays = [];

          for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
              byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
          }

          screenshot = new Blob(byteArrays, { type: contentType });
        } else if (stream) {
          screenshot = await captureScreenshot();
        }

        if (screenshot) {
          await handleAnalyzeScreen(id, screenshot, selectedModel);
        } else {
          console.warn("No screenshot could be captured.");
        }
      } catch (err) {
        console.error("Error analyzing screen:", err);
      } finally {
        // Small delay to ensure any duplicate events from the same interaction are ignored
        setTimeout(() => {
          isExecutingRef.current = false;
        }, 1000);
      }
    },
    [stream, id, captureScreenshot, handleAnalyzeScreen],
  );

  const onAiAnswer = useCallback(() => {
    if (isExecutingRef.current || !id) return;

    // Create an immutable transcript snapshot at the moment AI Answer is triggered.
    // This prevents race conditions where new transcript chunks arrive during
    // context extraction and contaminate the AI request context.
    const snapshotTimestamp = Date.now();
    const messagesSnapshot = [...messages];
    const micInterimSnapshot = activeMicInterimTranscript;
    const tabInterimSnapshot = mergedTabInterimTranscript;

    console.log("[AI Answer] Creating transcript snapshot at timestamp:", snapshotTimestamp);
    console.log("[AI Answer] Snapshot contains", messagesSnapshot.length, "messages");

    // Resolve the SPECIFIC question to answer from the immutable snapshot.
    // Priority: live interim Interviewer text → last final Interviewer message.
    // Sending only the specific question (not the whole transcript blob) ensures
    // the AI answers THIS question instead of fixating on whatever was last in a
    // 50-message concatenated dump.  The backend fetches full session history from
    // DB for context, so nothing is lost.
    const interimText = micInterimSnapshot || tabInterimSnapshot;

    const interviewerInterim =
      !micInterimSnapshot && tabInterimSnapshot
        ? tabInterimSnapshot
        : null;

    let question = "";
    let questionSource = "";
    const CONTEXT_WINDOW_MS = 60000; // 60 second window for recent context

    if (isTauri()) {
      // Prefer the live (not-yet-final) interviewer speech; fall back to the last
      // finalised Interviewer message in the transcript; fall back to the last
      // finalised message of any sender; fall back to any live interim text.
      question =
        interviewerInterim ||
        messagesSnapshot.reverse().find((m) => m.sender === "Interviewer")?.text ||
        messagesSnapshot.reverse().find((m) => m.text)?.text ||
        interimText ||
        "";
      questionSource = interviewerInterim ? "interviewer_interim" : 
                       messagesSnapshot.reverse().find((m) => m.sender === "Interviewer")?.text ? "last_interviewer" :
                       "fallback";
    } else {
      // For web/browser context, both the user voice input and processed transcript/context
      // should be included together so the AI can correctly understand and answer the intended question.
      
      // Get user voice input from mic or recent messages (with strict timestamp window)
      const now = snapshotTimestamp;
      
      let userVoiceInput = micInterimSnapshot.trim() ||
        messagesSnapshot
          .filter((m) => m.sender === "User" && m.timestamp && now - m.timestamp < CONTEXT_WINDOW_MS)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0]?.text ||
        "";
      
      questionSource = userVoiceInput ? "user_interim" : "";

      // If the user voice input is just filler/noise, look for a more meaningful recent User message
      if (userVoiceInput && isFillerPhrase(userVoiceInput)) {
        console.log("[AI Answer] Detected filler phrase in user voice input:", userVoiceInput);
        // Look for a more meaningful User message within the context window
        const meaningfulUserMsg = messagesSnapshot
          .filter((m) => 
            m.sender === "User" && 
            m.timestamp && 
            now - m.timestamp < CONTEXT_WINDOW_MS &&
            !isFillerPhrase(m.text) &&
            m.text.trim().length > 5 // Require at least 5 characters
          )
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        
        if (meaningfulUserMsg) {
          console.log("[AI Answer] Using meaningful user message instead:", meaningfulUserMsg.text);
          userVoiceInput = meaningfulUserMsg.text;
          questionSource = "meaningful_user";
        } else {
          // If no meaningful user message found, clear the filler input
          console.log("[AI Answer] No meaningful user message found in context window, clearing filler input");
          userVoiceInput = "";
          questionSource = "";
        }
      }

      // Get interviewer context with strict timestamp window
      const interviewerContext =
        interviewerInterim ||
        messagesSnapshot
          .filter((m) => m.sender === "Interviewer" && m.timestamp && now - m.timestamp < CONTEXT_WINDOW_MS)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0]?.text ||
        "";
      
      if (!questionSource && interviewerContext) {
        questionSource = "interviewer_context";
      }

      if (userVoiceInput && interviewerContext) {
        // Apply intent detection to clean up the user input
        const intentResult = detectIntent(userVoiceInput);
        const cleanedUserInput = intentResult.cleanedQuestion || userVoiceInput;
        question = `Context: ${interviewerContext}\nQuestion: ${cleanedUserInput}`;
      } else {
        question = userVoiceInput || interviewerContext || interimText || "";
        if (!questionSource && question) {
          questionSource = "fallback_interim";
        }
      }
    }

    if (!question) {
      console.log("[AI Answer] No question could be extracted from transcript snapshot");
      return;
    }

    console.log("[AI Answer] Question extracted from source:", questionSource);
    console.log("[AI Answer] Question content:", question.slice(0, 100));
    console.log("[AI Answer] Context window:", CONTEXT_WINDOW_MS, "ms");

    isExecutingRef.current = true;
    try {
      console.log("[Trigger] AI Answer initiated for question:", question.slice(0, 80));
      handleAiAnswer(id, question, selectedModel);
    } finally {
      setTimeout(() => {
        isExecutingRef.current = false;
      }, 1000);
    }
  }, [
    id,
    messages,
    handleAiAnswer,
    activeMicInterimTranscript,
    mergedTabInterimTranscript,
    selectedModel,
  ]);

  const onRegenerate = useCallback(
    (messageId: string) => {
      if (!id) return;
      // The question is stored on the AI message object (set when handleAiAnswer
      // created it).  handleRegenerate looks it up internally — no need to
      // rebuild a transcript blob here.
      handleRegenerate(id, messageId, selectedModel);
    },
    [id, handleRegenerate, selectedModel],
  );

  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  const isOpeningOverlayRef = useRef(false);
  const lastMinimizeTriggerRef = useRef(0);

  const handleOpenOverlay = async () => {
    if (!isTauri() || isOpeningOverlayRef.current) return;
    isOpeningOverlayRef.current = true;

    try {
      await invoke("show_mini_top_center");
      await getCurrentWindow().hide();
    } catch (error) {
      console.error("Failed to open overlay:", error);
      toast.error("Failed to open overlay window");
    } finally {
      isOpeningOverlayRef.current = false;
    }
  };

  // Detect Minimization to open Overlay
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    const setup = async () => {
      if (!isTauri()) return;
      const window = getCurrentWindow();
      const fn = await window.onResized(async () => {
        const minimized = await window.isMinimized();
        if (minimized) {
          const now = Date.now();
          // Debounce minimize triggers (1 second)
          if (now - lastMinimizeTriggerRef.current < 1000) return;
          lastMinimizeTriggerRef.current = now;

          console.log("Main window minimized, opening overlay...");
          handleOpenOverlay();
        }
      });

      if (!isMounted) {
        fn();
      } else {
        unlisten = fn;
      }
    };

    setup();
    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  // Sync data with overlay
  useEffect(() => {
    const syncOverlay = async () => {
      if (!isTauri()) return;
      const combinedTranscript = messages.map((m) => m.text).join("\n");
      await emit("overlay-update", {
        transcript: combinedTranscript,
        interimTranscript:
          activeMicInterimTranscript || mergedTabInterimTranscript,
        status:
          isMicConnectingState || mergedTabIsConnecting
            ? "Connecting"
            : isMicTranscribing || mergedTabIsTranscribing
              ? "Recording"
              : "Connected",
        isMicActive: isMicTranscribing,
        isMicConnecting: isMicConnectingState,
        timerText: formattedTime,
        sessionId: id || null,
        selectedModel: selectedModel,
      });
    };
    syncOverlay();
  }, [
    messages,
    isMicTranscribing,
    activeMicInterimTranscript,
    mergedTabIsTranscribing,
    mergedTabInterimTranscript,
    formattedTime,
    id,
    selectedModel,
  ]);

  // Forward AI chat responses to overlay
  useEffect(() => {
    if (!isTauri() || aiChat.length === 0) return;
    const latest = aiChat[aiChat.length - 1];
    const forwardToOverlay = async () => {
      await emit("overlay-ai-response", {
        text: latest.text,
        isStreaming: isAnswering || isAnalyzing,
        messageId: latest.id,
        sender: latest.sender,
      });
    };
    forwardToOverlay();
  }, [aiChat, isAnswering, isAnalyzing]);

  const onClear = useCallback(() => {
    if (isTauri()) {
      setTauriMicInterim("");
      setTauriTabInterim("");
    }
    micTranscription.clearTranscript();
    tabTranscription.clearTranscript();
    tabAudioTranscription.clearTranscript();
    setMessages([]);
    pendingTranscriptRef.current = [];
    stabilizerRef.current?.cancel();
    previousAutoContextRef.current = null;
  }, [micTranscription, tabTranscription, tabAudioTranscription]);

  // Stable refs for overlay event handlers to prevent listener leakage
  const onAiAnswerRef = useRef(onAiAnswer);
  const onAnalyzeScreenRef = useRef(onAnalyzeScreen);
  const handleCustomQueryRef = useRef(handleCustomQuery);
  const onToggleMicRef = useRef(toggleTauriOrBrowserMic);
  const onClearRef = useRef(onClear);
  const endSessionNowRef = useRef(endSessionNow);

  onAiAnswerRef.current = onAiAnswer;
  onAnalyzeScreenRef.current = onAnalyzeScreen;
  handleCustomQueryRef.current = handleCustomQuery;
  endSessionNowRef.current = endSessionNow;
  onToggleMicRef.current = toggleTauriOrBrowserMic;
  onClearRef.current = onClear;

  // Listen for overlay events (AI answer, analyze screen, exit)
  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      if (!isTauri()) return;
      const u1 = await listen("overlay-ai-answer", () => {
        if (active) onAiAnswerRef.current();
      });
      const u2 = await listen("overlay-analyze-screen", (event) => {
        if (active) onAnalyzeScreenRef.current(event.payload);
      });
      const u3 = await listen("overlay-exit", async () => {
        if (active) {
          const { WebviewWindow } =
            await import("@tauri-apps/api/webviewWindow");
          const mainWindow = await WebviewWindow.getByLabel("main");
          if (mainWindow) {
            await mainWindow.show();
            await mainWindow.unminimize();
            await mainWindow.setFocus();
          }
          setIsEndSessionDialogOpen(true);
        }
      });
      const u4 = await listen("overlay-ai-query", (event) => {
        const { query } = event.payload as { query: string };
        if (active && id)
          handleCustomQueryRef.current(id, query, selectedModelRef.current);
      });
      const uModel = await listen("overlay-model-change", (event) => {
        const { model } = event.payload as { model: string };
        if (active) setSelectedModel(model);
      });
      const u5 = await listen("overlay-toggle-mic", () => {
        if (active) onToggleMicRef.current();
      });
      const u6 = await listen("overlay-clear-transcript", () => {
        if (active) onClearRef.current();
      });
      const u7 = await listen("overlay-restore", async () => {
        if (active) {
          console.log("Received overlay-restore event");
          const { WebviewWindow } =
            await import("@tauri-apps/api/webviewWindow");
          const mainWindow = await WebviewWindow.getByLabel("main");
          if (mainWindow) {
            await mainWindow.show();
            await mainWindow.unminimize();
            await mainWindow.setFocus();
          } else {
            // Fallback
            const window = getCurrentWindow();
            await window.show();
            await window.unminimize();
            await window.setFocus();
          }
        }
      });
      const u8 = await listen("overlay-hide-main", async () => {
        if (active) {
          await getCurrentWindow().hide();
        }
      });
      const u9 = await listen("overlay-end-session-direct", async () => {
        if (active) {
          endSessionNowRef.current();
        }
      });

      if (!active) {
        u1();
        u2();
        u3();
        u4();
        u5();
        u6();
        u7();
        u8();
        u9();
        uModel();
        return;
      }

      unlisteners.push(u1, u2, u3, u4, u5, u6, u7, u8, u9, uModel);
    };

    setup();
    return () => {
      active = false;
      unlisteners.forEach((u) => u());
    };
  }, []); // Only register once on mount

  // Keyboard Shortcuts
  useKeyboardShortcut("g", onAiAnswer, {
    disabled:
      (messages.length === 0 &&
        !activeMicInterimTranscript &&
        !mergedTabInterimTranscript) ||
      isAnswering,
  });

  useKeyboardShortcut("k", onAnalyzeScreen, {
    disabled: !stream || isAnalyzing,
  });

  const transcriptProps = {
    messages,
    micInterimTranscript: activeMicInterimTranscript,
    isMicTranscribing: isMicTranscribing,
    tabInterimTranscript: mergedTabInterimTranscript,
    isTabTranscribing: mergedTabIsTranscribing,
    isConnecting: isMicConnectingState || mergedTabIsConnecting,
    error: (isTauri() ? tauriError : micTranscription.error) || mergedTabError,
    onToggleMic: toggleTauriOrBrowserMic,
    onClear,
    onMinimize: toggleFullscreen,
    onChangeTab: startShare,
    onOpenOverlay: handleOpenOverlay,
    currentMicDevice,
  };

  const chatPanelProps = {
    messages: aiChat,
    inputMessage,
    onInputChange: setInputMessage,
    isAnalyzing,
    isAnswering,
    canAnswer:
      messages.length > 0 ||
      !!activeMicInterimTranscript ||
      !!mergedTabInterimTranscript,
    canAnalyze: !!stream,
    onAiAnswer,
    onAnalyzeScreen,
    onSend: () => id && handleCustomQuery(id, inputMessage, selectedModel),
    onExit: () => setIsEndSessionDialogOpen(true),
    onRegenerate,
    isFreeSession,
    timerText: formattedTime,
    isWarning: creditWarning !== null,
    selectedModel,
    onModelChange: setSelectedModel,
  };

  return (
    <div className="h-screen w-screen bg-[#f8f9fb] text-slate-900 flex flex-col overflow-hidden font-sans select-none fixed inset-0">
      {/* Ephemeral session indicator — visible whenever transcript saving is OFF */}
      {!saveTranscriptEnabled && (
        <div className="fixed top-0 inset-x-0 z-40 flex items-center justify-center gap-2 bg-slate-900 text-white text-xs font-medium py-1 px-4 shadow">
          <span>🔒</span>
          <span>
            Ephemeral session — transcript saving is OFF. Nothing will be persisted after this session ends.
          </span>
        </div>
      )}

      {/* Credit warning banner — shown for paid sessions approaching exhaustion */}
      {creditWarning !== null && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-semibold py-1.5 px-4 shadow-lg">
          <span>⚠️</span>
          <span>
            Only {creditWarning} minute{creditWarning === 1 ? "" : "s"} of
            credit remaining — session will end soon.
          </span>
          <button
            className="ml-4 bg-white/20 hover:bg-white/30 text-white text-[10px] uppercase tracking-wider font-bold py-1 px-3 rounded-full border border-white/30 transition-colors shadow-sm"
            onClick={() => setBuyCreditsOpen(true)}
          >
            Top up
          </button>
          <button
            className="ml-2 opacity-70 hover:opacity-100 text-xs underline"
            onClick={() => setCreditWarning(null)}
          >
            dismiss
          </button>
        </div>
      )}

      <BuyCreditsDialog
        open={buyCreditsOpen}
        onOpenChange={setBuyCreditsOpen}
        onSuccess={refreshBalance}
      />

      {isFullscreen ? (
        /* ================= FULLSCREEN OVERLAY MODE ================= */
        <>
          <ScreenCapture
            stream={stream}
            videoRef={videoRef}
            onChangeTab={startShare}
            isFullscreen={true}
            onToggleFullscreen={toggleFullscreen}
          />
          <OverlayContainer
            isFullscreen={isFullscreen}
            leftComponent={<Transcript {...transcriptProps} isFullscreen />}
            rightComponent={<AIChatPanel {...chatPanelProps} isFullscreen />}
          />
        </>
      ) : (
        /* ================= NORMAL RESIZABLE PANEL MODE ================= */
        <main className="flex-1 overflow-hidden h-full relative z-10">
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel
              defaultSize={40}
              minSize={25}
              className="flex flex-col"
            >
              <ResizablePanelGroup orientation="vertical">
                <ResizablePanel defaultSize={50} minSize={20}>
                  <ScreenCapture
                    stream={stream}
                    videoRef={videoRef}
                    onChangeTab={startShare}
                    isFullscreen={false}
                    onToggleFullscreen={toggleFullscreen}
                  />
                </ResizablePanel>

                <ResizableHandle
                  className="bg-slate-200/50 hover:bg-slate-300 transition-colors"
                  withHandle
                />

                <ResizablePanel
                  defaultSize={50}
                  minSize={20}
                  className="flex flex-col"
                >
                  <Transcript {...transcriptProps} />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle
              className="bg-slate-200/50 hover:bg-slate-300 transition-colors w-1.5"
              withHandle
            />

            <ResizablePanel
              defaultSize={60}
              minSize={30}
              className="flex flex-col"
            >
              <AIChatPanel {...chatPanelProps} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      )}

      <EndSessionDialog
        isOpen={isEndSessionDialogOpen}
        onClose={() => setIsEndSessionDialogOpen(false)}
        sessionId={id || ""}
        transcript={messages.map((m) => `[${m.sender}]: ${m.text}`).join("\n")}
      />

      <ConnectDialog
        open={isConnectDialogOpen}
        onSuccess={handleConnectSuccess}
        onCancel={handleConnectCancel}
        onStartShare={startShare}
        sessionId={connectData?.sessionId || id || ""}
        companyName={connectData?.companyName || ""}
        jobTitle={connectData?.jobTitle || ""}
        extraContext={connectData?.extraContext || ""}
        language={selectedLanguage}
        simpleLanguage={connectData?.simpleLanguage || false}
        aiModel={selectedModel}
      />

      {/* <InactivityDialog
        isOpen={showInactivityDialog}
        remainingTime={remainingTime}
        onStayActive={onStayActive}
      /> */}
    </div>
  );
}
