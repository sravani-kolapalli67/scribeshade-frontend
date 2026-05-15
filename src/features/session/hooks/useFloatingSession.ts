/**
 * useFloatingSession — business logic hook for the FloatingApp mini window.
 *
 * Composes:
 *  - Redux slice (floatingSessionSlice) for serializable session state
 *  - Local state for hardware/ephemeral state (mic, tab audio, streaming)
 *  - All Tauri event listeners for session-init, transcript, overlay events
 *  - AI chat via useAIChat
 *  - Timer, heartbeat, SSE hooks
 *
 * The component (FloatingApp) consumes this hook and remains a pure
 * presentation shell with no direct state management.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useAIChat } from "@/hooks/useAIChat";
import { useFreeSessionTimer } from "@/hooks/useFreeSessionTimer";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  initSession,
  setSelectedModel,
  addMessage,
  clearMessages,
  setCreditWarning,
  setIsWindowCollapsed,
  setIsResponsesExpanded,
  setIsTranscriptExpanded,
  setCurrentResponseIndex,
  endSessionThunk,
  type SessionInitData,
  type TranscriptMessage,
} from "@/features/session/slices/floatingSessionSlice";
import {
  selectSessionInfo,
  selectSelectedModel,
  selectMessages,
  selectCreditWarning,
  selectIsEnding,
  selectIsWindowCollapsed,
  selectIsResponsesExpanded,
  selectIsTranscriptExpanded,
  selectCurrentResponseIndex,
  selectLastMessage,
  selectHeartbeatParams,
  selectTimerParams,
} from "@/features/session/selectors/floatingSessionSelectors";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

function getLanguageCode(lang: string): string {
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
}

export function useFloatingSession() {
  const dispatch = useAppDispatch();

  // ── Redux state ─────────────────────────────────────────────────────────────
  const sessionInfo = useAppSelector(selectSessionInfo);
  const selectedModel = useAppSelector(selectSelectedModel);
  const messages = useAppSelector(selectMessages);
  const creditWarning = useAppSelector(selectCreditWarning);
  const isEnding = useAppSelector(selectIsEnding);
  const isWindowCollapsed = useAppSelector(selectIsWindowCollapsed);
  const isResponsesExpanded = useAppSelector(selectIsResponsesExpanded);
  const isTranscriptExpanded = useAppSelector(selectIsTranscriptExpanded);
  const currentResponseIndex = useAppSelector(selectCurrentResponseIndex);
  const lastMessage = useAppSelector(selectLastMessage);
  const heartbeatParams = useAppSelector(selectHeartbeatParams);
  const timerParams = useAppSelector(selectTimerParams);

  // ── Stable refs (prevent stale closures in Tauri event listeners) ──────────
  const sessionInfoRef = useRef<SessionInitData | null>(null);
  const messagesRef = useRef<TranscriptMessage[]>([]);
  const selectedModelRef = useRef(selectedModel);

  sessionInfoRef.current = sessionInfo;
  messagesRef.current = messages;
  selectedModelRef.current = selectedModel;

  // ── Hardware / ephemeral local state (NOT in Redux) ─────────────────────────
  const [isMicActive, setIsMicActive] = useState(false);
  const [isMicConnecting, setIsMicConnecting] = useState(false);
  const [micInterimTranscript, setMicInterimTranscript] = useState("");
  const [tabStatus, setTabStatus] = useState<"idle" | "connecting" | "transcribing" | "error">("idle");
  const [tabError, setTabError] = useState<string | null>(null);
  const [tabInterimTranscript, setTabInterimTranscript] = useState("");
  const [captureArmed, setCaptureArmed] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // ── Mutual exclusion refs for AI operations ─────────────────────────────────
  const isEmittingRef = useRef(false);
  const isAnalyzeEmittingRef = useRef(false);

  // ── AI Chat hook (streaming state lives here, not in Redux) ─────────────────
  const {
    aiChat,
    setAiChat,
    isAnalyzing,
    isAnswering,
    handleAiAnswer,
    handleAnalyzeScreen,
    handleCustomQuery,
    handleRegenerate,
  } = useAIChat();

  const aiResponses = aiChat.filter((m) => m.sender === "AI");

  // ── Deduplication helpers ───────────────────────────────────────────────────

  const isDupeMessage = useCallback(
    (sender: "User" | "Interviewer", text: string, timestamp: number): boolean => {
      const normalized = text.toLowerCase().trim().replace(/[.!?]/g, "");
      return messagesRef.current.some((m) => {
        if (m.sender !== sender) return false;
        if (Math.abs(m.timestamp - timestamp) > 2000) return false;
        const existing = m.text.toLowerCase().trim().replace(/[.!?]/g, "");
        return (
          existing === normalized ||
          existing.includes(normalized) ||
          normalized.includes(existing)
        );
      });
    },
    [],
  );

  // ── Transcript message handlers ─────────────────────────────────────────────

  const handleUserTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      if (!isFinal || !text.trim()) return;
      const sid = sessionInfoRef.current?.sessionId;
      const now = Date.now();

      if (isDupeMessage("User", text, now)) return;

      if (sid) {
        fetch(`${BACKEND_URL}/api/session/${sid}/save-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "USER",
            question: text,
            answer: "",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }),
        }).catch(console.error);
      }

      dispatch(
        addMessage({
          id: Math.random().toString(36).slice(7),
          sender: "User",
          text,
          timestamp: now,
        }),
      );
    },
    [dispatch, isDupeMessage],
  );

  const handleInterviewerTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      if (!isFinal || !text.trim()) return;
      const sid = sessionInfoRef.current?.sessionId;
      const now = Date.now();

      if (isDupeMessage("Interviewer", text, now)) return;

      if (sid) {
        fetch(`${BACKEND_URL}/api/session/${sid}/save-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "INTERVIEWER",
            question: text,
            answer: "",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }),
        }).catch(console.error);
      }

      dispatch(
        addMessage({
          id: Math.random().toString(36).slice(7),
          sender: "Interviewer",
          text,
          timestamp: now,
        }),
      );
    },
    [dispatch, isDupeMessage],
  );

  // Keep stable refs for Tauri event listeners
  const handleInterviewerTranscriptRef = useRef(handleInterviewerTranscript);
  const handleUserTranscriptRef = useRef(handleUserTranscript);
  handleInterviewerTranscriptRef.current = handleInterviewerTranscript;
  handleUserTranscriptRef.current = handleUserTranscript;

  // ── End session ─────────────────────────────────────────────────────────────

  const endSession = useCallback(() => {
    dispatch(endSessionThunk());
  }, [dispatch]);

  // ── Credit callbacks ────────────────────────────────────────────────────────

  const handleExhausted = useCallback(() => {
    toast.error("Session ended — credits exhausted.", { duration: 6000 });
    dispatch(endSessionThunk());
  }, [dispatch]);

  const handleCreditWarning = useCallback(
    (remaining: number) => {
      dispatch(setCreditWarning(remaining));
      toast.warning(
        `Only ${remaining} minute${remaining === 1 ? "" : "s"} of credit remaining!`,
        { duration: 8000 },
      );
    },
    [dispatch],
  );

  // ── Free session timer ──────────────────────────────────────────────────────

  const onTimeUp = useCallback(() => {
    toast.info("Free session time is up!");
    dispatch(endSessionThunk());
  }, [dispatch]);

  const { formattedTime } = useFreeSessionTimer({
    sessionId: timerParams.sessionId,
    onTimeUp,
    maxAllowedMinutes: timerParams.maxAllowedMinutes,
  });

  // ── Heartbeat + SSE (paid sessions) ────────────────────────────────────────

  useSessionHeartbeat({
    sessionId: heartbeatParams.sessionId,
    enabled: heartbeatParams.enabled,
    startedAt: heartbeatParams.startedAt,
    onExhausted: handleExhausted,
    onWarning: handleCreditWarning,
  });

  useSessionEvents({
    sessionId: heartbeatParams.sessionId,
    enabled: heartbeatParams.enabled,
    onExhausted: handleExhausted,
    onWarning: handleCreditWarning,
  });

  // ── System audio (Rust STT) ─────────────────────────────────────────────────

  const startSystemAudio = useCallback(async () => {
    if (!sessionInfoRef.current) return;
    const lang = getLanguageCode(sessionInfoRef.current.language ?? "English");
    setTabError(null);
    setTabStatus("connecting");
    try {
      await invoke("start_system_audio_transcription", { language: lang, model: "nova-3" });
    } catch (e: unknown) {
      const msg = String(e);
      setTabError(msg);
      setTabStatus("error");
    }
  }, []);

  // System audio transcript + status listeners (unconditional — wires up once)
  useEffect(() => {
    let unlistenTx: (() => void) | undefined;
    let unlistenSt: (() => void) | undefined;

    listen<{ text: string; is_final: boolean }>("stt:system-audio", (event) => {
      const { text, is_final } = event.payload;
      if (is_final) {
        setTabInterimTranscript("");
        handleInterviewerTranscriptRef.current(text, true);
      } else {
        setTabInterimTranscript(text);
      }
    }).then((fn) => { unlistenTx = fn; }).catch(() => {});

    listen<{ status: string; error?: string }>("stt:status:system", (event) => {
      const { status, error } = event.payload;
      setTabStatus(status as "idle" | "connecting" | "transcribing" | "error");
      if (status === "error" && error) {
        setTabError(error);
      } else if (status === "transcribing") {
        setTabError(null);
      }
    }).then((fn) => { unlistenSt = fn; }).catch(() => {});

    return () => {
      unlistenTx?.();
      unlistenSt?.();
    };
  }, []);

  // Arm → start system audio (only on live session-init, not sessionStorage hydration)
  useEffect(() => {
    if (!captureArmed || !sessionInfo) return;
    void startSystemAudio();
    return () => {
      invoke("stop_system_audio_transcription").catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureArmed, sessionInfo?.sessionId]);

  // Mic STT listeners
  useEffect(() => {
    let unlistenTx: (() => void) | undefined;
    let unlistenSt: (() => void) | undefined;

    listen<{ text: string; is_final: boolean }>("stt:mic", (event) => {
      const { text, is_final } = event.payload;
      if (is_final) {
        setMicInterimTranscript("");
        handleUserTranscriptRef.current(text, true);
      } else {
        setMicInterimTranscript(text);
      }
    }).then((fn) => { unlistenTx = fn; }).catch(() => {});

    listen<{ status: string; error?: string }>("stt:status:mic", (event) => {
      const { status, error } = event.payload;
      if (status === "transcribing") {
        setIsMicActive(true);
        setIsMicConnecting(false);
      } else if (status === "connecting") {
        setIsMicConnecting(true);
      } else {
        setIsMicActive(false);
        setIsMicConnecting(false);
      }
      if (status === "error" && error) {
        toast.error(`Mic: ${error}`, { duration: 6000 });
      }
    }).then((fn) => { unlistenSt = fn; }).catch(() => {});

    return () => {
      unlistenTx?.();
      unlistenSt?.();
    };
  }, []);

  // ── session-init Tauri event ────────────────────────────────────────────────

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<SessionInitData>("session-init", (event) => {
      const info = event.payload;
      try {
        sessionStorage.setItem("scribeshade.session-init", JSON.stringify(info));
      } catch {}

      // Dismiss lingering toasts from prior session (e.g. "Session ended")
      toast.dismiss();

      // Reset all prior-session AI chat state
      setAiChat([]);

      // Hydrate Redux slice (resets messages, panels, warnings, isEnding)
      dispatch(initSession(info));

      invoke("set_session_active", { active: true }).catch(() => {});
      setCaptureArmed(true);

      // Ack so the sender can stop retrying. Idempotent — safe to ack
      // multiple times if multiple session-init payloads arrive.
      emit("session-init-ack").catch(() => {});
    })
      .then((fn) => { unlisten = fn; })
      .catch(console.error);

    return () => { unlisten?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // ── overlay-transcript event (from main window / page.tsx) ─────────────────

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<{ sender: "User" | "Interviewer"; text: string; timestamp: number }>(
      "overlay-transcript",
      (event) => {
        const { sender, text, timestamp } = event.payload;
        if (!text.trim()) return;
        if (isDupeMessage(sender, text, timestamp)) return;
        dispatch(
          addMessage({
            id: Math.random().toString(36).slice(7),
            sender,
            text,
            timestamp,
          }),
        );
      },
    )
      .then((fn) => { unlisten = fn; })
      .catch(console.error);

    return () => { unlisten?.(); };
  }, [dispatch, isDupeMessage]);

  // ── Auto-expand responses panel ─────────────────────────────────────────────

  // Track the previous count so we can distinguish "first response arrived"
  // (jump to it) vs "another response was appended while user is reading an
  // earlier one" (stay put).
  const prevResponsesLenRef = useRef(0);

  useEffect(() => {
    const prev = prevResponsesLenRef.current;
    const curr = aiResponses.length;

    if (curr > 0 && prev === 0) {
      // First response ever — open the panel and point at it.
      dispatch(setCurrentResponseIndex(0));
      dispatch(setIsResponsesExpanded(true));
    } else if (curr > prev) {
      // New card(s) arrived. Always follow the latest card so the user sees
      // the streaming answer as it comes in. The previous logic only advanced
      // when currentResponseIndex === prev - 1, which was never true when
      // prev was 0 (0 === -1 is false), so multi-card Analyze Screen results
      // left the index stuck at 0 pointing at an empty/removed card.
      dispatch(setCurrentResponseIndex(curr - 1));
    }

    prevResponsesLenRef.current = curr;
  }, [aiResponses.length, dispatch]);

  // Auto-expand the responses panel the moment the user triggers a generation
  // (AI Answer or Analyze Screen) so the "Generating response…" loader is
  // visible immediately.
  useEffect(() => {
    if (isAnswering || isAnalyzing) {
      dispatch(setIsResponsesExpanded(true));
    }
  }, [isAnswering, isAnalyzing, dispatch]);

  // ── AI action handlers ──────────────────────────────────────────────────────

  const handleAiAnswerClick = useCallback(async () => {
    if (isEmittingRef.current || isAnswering || isAnalyzing) return;
    const info = sessionInfoRef.current;
    if (!info) return;

    const msgs = messagesRef.current;
    const combined = msgs
      .map((m) => `[${m.sender === "User" ? "YOU" : "Interviewer"}]: ${m.text}`)
      .join("\n");
    const fullTranscript =
      combined +
      (micInterimTranscript ? `\n[YOU]: ${micInterimTranscript}` : "") +
      (tabInterimTranscript ? `\n[Interviewer]: ${tabInterimTranscript}` : "");

    if (!fullTranscript.trim()) return;

    isEmittingRef.current = true;
    try {
      await handleAiAnswer(info.sessionId, fullTranscript, selectedModelRef.current);
    } finally {
      setTimeout(() => { isEmittingRef.current = false; }, 800);
    }
  }, [isAnswering, isAnalyzing, handleAiAnswer, micInterimTranscript, tabInterimTranscript]);

  const handleAnalyzeScreenClick = useCallback(
    async (screenshotBlob: Blob) => {
      // isAnalyzeEmittingRef is the source of truth — avoids stale isAnalyzing
      // closure values that could block legitimate calls after the first one.
      if (isAnalyzeEmittingRef.current) return;
      const info = sessionInfoRef.current;
      if (!info) return;

      isAnalyzeEmittingRef.current = true;
      setIsCapturing(true);
      try {
        await handleAnalyzeScreen(info.sessionId, screenshotBlob, selectedModelRef.current);
      } finally {
        setIsCapturing(false);
        setTimeout(() => { isAnalyzeEmittingRef.current = false; }, 500);
      }
    },
    [handleAnalyzeScreen],
  );

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !sessionInfoRef.current) return;
    const query = inputValue.trim();
    setInputValue("");
    handleCustomQuery(sessionInfoRef.current.sessionId, query, selectedModelRef.current);
  }, [inputValue, handleCustomQuery]);

  const handleRegenerateResponse = useCallback(
    async (messageId: string) => {
      const info = sessionInfoRef.current;
      if (!info || !messageId) return;
      await handleRegenerate(info.sessionId, messageId, selectedModelRef.current);
    },
    [handleRegenerate],
  );

  // ── Mic toggle ──────────────────────────────────────────────────────────────

  const handleToggleMic = useCallback(async () => {
    if (isMicActive || isMicConnecting) {
      await invoke("stop_mic_transcription").catch(() => {});
      setIsMicActive(false);
      setIsMicConnecting(false);
      setMicInterimTranscript("");
    } else if (sessionInfoRef.current) {
      setIsMicConnecting(true);
      try {
        await invoke("start_mic_transcription", {
          language: getLanguageCode(sessionInfoRef.current.language ?? "English"),
          model: "nova-3",
        });
      } catch (e: unknown) {
        toast.error(`Mic: ${String(e)}`);
        setIsMicConnecting(false);
      }
    }
  }, [isMicActive, isMicConnecting]);

  const handleClearTranscript = useCallback(() => {
    setMicInterimTranscript("");
    setTabInterimTranscript("");
    dispatch(clearMessages());
  }, [dispatch]);

  // ── Redux action dispatchers (stable, no closure deps) ──────────────────────

  const collapseWindow = useCallback(() => {
    dispatch(setIsWindowCollapsed(true));
  }, [dispatch]);

  const expandWindow = useCallback(() => {
    dispatch(setIsWindowCollapsed(false));
  }, [dispatch]);

  const toggleTranscriptExpanded = useCallback(() => {
    dispatch(setIsTranscriptExpanded(!isTranscriptExpanded));
  }, [dispatch, isTranscriptExpanded]);

  const toggleResponsesExpanded = useCallback(() => {
    dispatch(setIsResponsesExpanded(!isResponsesExpanded));
  }, [dispatch, isResponsesExpanded]);

  const expandResponses = useCallback(() => {
    dispatch(setIsResponsesExpanded(true));
  }, [dispatch]);

  const goToPrevResponse = useCallback(() => {
    dispatch(setCurrentResponseIndex(Math.max(0, currentResponseIndex - 1)));
  }, [dispatch, currentResponseIndex]);

  const goToNextResponse = useCallback(() => {
    dispatch(setCurrentResponseIndex(Math.min(aiResponses.length - 1, currentResponseIndex + 1)));
  }, [dispatch, currentResponseIndex, aiResponses.length]);

  const onModelChange = useCallback(
    (model: string) => {
      dispatch(setSelectedModel(model));
    },
    [dispatch],
  );

  // ── Derived state ───────────────────────────────────────────────────────────

  const lastTranscriptLine = lastMessage?.text ?? "";
  const lastTranscriptSender = lastMessage?.sender ?? null;
  const interimTranscript = micInterimTranscript || tabInterimTranscript;
  const isTabActive = tabStatus === "transcribing";
  const isTabConnecting = tabStatus === "connecting";

  return {
    // ── Redux state ──────────────────────────────────────────────────────────
    sessionInfo,
    selectedModel,
    messages,
    creditWarning,
    isEnding,
    isWindowCollapsed,
    isResponsesExpanded,
    isTranscriptExpanded,
    currentResponseIndex,

    // ── AI chat (from useAIChat) ─────────────────────────────────────────────
    aiChat,
    aiResponses,
    isAnalyzing,
    isAnswering,

    // ── Hardware / ephemeral state ───────────────────────────────────────────
    isMicActive,
    isMicConnecting,
    micInterimTranscript,
    tabStatus,
    tabError,
    tabInterimTranscript,
    isCapturing,
    inputValue,
    setInputValue,

    // ── Derived ──────────────────────────────────────────────────────────────
    lastTranscriptLine,
    lastTranscriptSender,
    interimTranscript,
    isTabActive,
    isTabConnecting,
    formattedTime,

    // ── Action handlers ──────────────────────────────────────────────────────
    endSession,
    handleAiAnswerClick,
    handleAnalyzeScreenClick,
    handleRegenerateResponse,
    handleSend,
    handleToggleMic,
    handleClearTranscript,
    startSystemAudio,
    collapseWindow,
    expandWindow,
    toggleTranscriptExpanded,
    toggleResponsesExpanded,
    expandResponses,
    goToPrevResponse,
    goToNextResponse,
    onModelChange,
  };
}
