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
  const [selectedModel, setSelectedModel] = useState(
    location.state?.connectData?.aiModel || "google/gemma-4-26b-a4b-it",
  );
  const [selectedLanguage, setSelectedLanguage] = useState(
    location.state?.connectData?.language || "English",
  );
  const selectedModelRef = useRef(selectedModel);

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

  // Activate response data — populated once the ConnectDialog succeeds
  const [maxAllowedMinutes, setMaxAllowedMinutes] = useState<number | null>(
    null,
  );
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [creditWarning, setCreditWarning] = useState<number | null>(null); // remaining minutes
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const { refresh: refreshBalance } = useCreditsBalance();

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

  const endSessionNow = useCallback(async () => {
    if (!id) return;

    toast.info("Ending session...", {
      duration: 3000,
    });

    // Stop heartbeat immediately so no new ticks fire during cleanup
    stopHeartbeatRef.current?.();

    try {
      const transcript = messages
        .map((m) => `[${m.sender}]: ${m.text}`)
        .join("\n");
      const aiUsage = parseInt(localStorage.getItem(`aiUsage_${id}`) || "0");
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/session/${id}/deactivate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transcript, aiUsage }),
        },
      );
      localStorage.removeItem(`aiUsage_${id}`);

      // For paid sessions, wait up to 8 seconds for the BullMQ job to mark
      // the session COMPLETED before navigating away.
      if (res.ok && maxAllowedMinutes !== null) {
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
            toast.success("Session ended — no credits charged (free zone)");
          } else if (deductedCredits) {
            toast.info(`Session ended — ${deductedCredits} credits deducted`);
          }
        }
      }
    } catch (error) {
      console.error("Error ending session directly:", error);
    } finally {
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
  }, [id, messages, maxAllowedMinutes, navigate]);

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

  const handleTranscript = useCallback(
    (sender: "User" | "Interviewer", text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        console.log(`[Transcript Final] ${sender}: ${text}`);
        setMessages((prev) => {
          const now = Date.now();
          // ... deduplication logic ...
          const normalizedNew = text.toLowerCase().trim().replace(/[.!?]/g, "");

          // Deduplication: Check if this message was already captured by the OTHER source
          // within a small time window (2 seconds).
          const isEcho = prev.some((m) => {
            if (m.sender === sender) return false;
            if (!m.timestamp || now - m.timestamp > 2000) return false;

            const normalizedExisting = m.text
              .toLowerCase()
              .trim()
              .replace(/[.!?]/g, "");
            return (
              normalizedExisting === normalizedNew ||
              normalizedExisting.includes(normalizedNew) ||
              normalizedNew.includes(normalizedExisting)
            );
          });

          if (isEcho) {
            console.log(`[Dedupe] Suppressed echo from ${sender}: "${text}"`);
            return prev;
          }

          const newMsg: Message = {
            id: Math.random().toString(36).substring(7),
            sender,
            text,
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            timestamp: now,
          };

          // Save to backend
          fetch(
            `${import.meta.env.VITE_BACKEND_URL}/api/session/${id}/save-message`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: sender === "User" ? "USER" : "INTERVIEWER",
                question: text,
                answer: "",
                time: newMsg.time,
              }),
            },
          ).catch((err) =>
            console.error("Failed to save transcript segment:", err),
          );

          // Forward structured transcript to the mini overlay so it can render
          // both sides even when native SCKit audio is unavailable (e.g. Windows).
          if (isTauri()) {
            emit("overlay-transcript", { sender, text, timestamp: now }).catch(
              () => {},
            );
          }

          return [...prev, newMsg];
        });
      }
    },
    [id],
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

  // Display audio transcription: SCKit (Rust) ─► localhost WS ─► Deepgram WS
  // Captures the primary display's system audio directly via ScreenCaptureKit,
  // so YouTube/tab audio is transcribed — not the microphone.
  // SCKit works independently of getDisplayMedia — no need to wait for stream.
  const tabTranscription = useNativeTabTranscription({
    apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY || "",
    model: "nova-3",
    language: getLanguageCode(selectedLanguage),
    onTranscript: onInterviewerTranscript,
    enabled: !isConnectDialogOpen,
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
    if (streamHasAudio) {
      tabAudioTranscription.startTranscription();
    } else {
      tabAudioTranscription.stopTranscription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamHasAudio]);

  // Surface cpal errors as toasts
  useEffect(() => {
    if (tabTranscription.error) toast.error(tabTranscription.error);
  }, [tabTranscription.error]);

  // Surface browser tab audio errors as toasts
  useEffect(() => {
    if (tabAudioTranscription.error) toast.error(tabAudioTranscription.error);
  }, [tabAudioTranscription.error]);

  // Merged tab transcription state (SCKit native + browser stream audio)
  const mergedTabIsTranscribing =
    tabTranscription.isTranscribing || tabAudioTranscription.isTranscribing;
  const mergedTabIsConnecting =
    tabTranscription.isConnecting || tabAudioTranscription.isConnecting;
  const mergedTabInterimTranscript =
    tabTranscription.interimTranscript ||
    tabAudioTranscription.interimTranscript;
  const mergedTabError = tabTranscription.error || tabAudioTranscription.error;

  const {
    aiChat,
    inputMessage,
    setInputMessage,
    isAnalyzing,
    isAnswering,
    handleAnalyzeScreen,
    handleAiAnswer,
    handleCustomQuery,
  } = useAIChat();

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

    // Check if we have anything to answer (history or live interim text)
    const hasHistory = messages.length > 0;
    const interimText =
      micTranscription.interimTranscript || mergedTabInterimTranscript;

    if (!hasHistory && !interimText) return;

    isExecutingRef.current = true;
    try {
      console.log("[Trigger] AI Answer initiated");
      let combinedTranscript = messages
        .map(
          (m) => `[${m.sender === "User" ? "YOU" : "Interviewer"}]: ${m.text}`,
        )
        .join("\n");

      if (interimText) {
        const sender = micTranscription.interimTranscript
          ? "YOU"
          : "Interviewer";
        combinedTranscript +=
          (combinedTranscript ? "\n" : "") + `[${sender}]: ${interimText}`;
      }

      handleAiAnswer(id, combinedTranscript, selectedModel);
    } finally {
      setTimeout(() => {
        isExecutingRef.current = false;
      }, 1000);
    }
  }, [
    id,
    messages,
    handleAiAnswer,
    micTranscription.interimTranscript,
    mergedTabInterimTranscript,
    selectedModel,
  ]);

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
          micTranscription.interimTranscript || mergedTabInterimTranscript,
        status:
          micTranscription.isConnecting || mergedTabIsConnecting
            ? "Connecting"
            : micTranscription.isTranscribing || mergedTabIsTranscribing
              ? "Recording"
              : "Connected",
        isMicActive: micTranscription.isTranscribing,
        isMicConnecting: micTranscription.isConnecting,
        timerText: formattedTime,
        sessionId: id || null,
        selectedModel: selectedModel,
      });
    };
    syncOverlay();
  }, [
    messages,
    micTranscription.isTranscribing,
    micTranscription.interimTranscript,
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

  // Stable refs for overlay event handlers to prevent listener leakage
  const onAiAnswerRef = useRef(onAiAnswer);
  const onAnalyzeScreenRef = useRef(onAnalyzeScreen);
  const handleCustomQueryRef = useRef(handleCustomQuery);

  const onToggleMicRef = useRef(() => {
    if (micTranscription.isTranscribing) {
      micTranscription.stopTranscription();
    } else {
      micTranscription.startTranscription();
    }
  });

  const onClearRef = useRef(() => {
    micTranscription.clearTranscript();
    tabTranscription.clearTranscript();
    tabAudioTranscription.clearTranscript();
    setMessages([]);
  });

  const endSessionNowRef = useRef(endSessionNow);

  onAiAnswerRef.current = onAiAnswer;
  onAnalyzeScreenRef.current = onAnalyzeScreen;
  handleCustomQueryRef.current = handleCustomQuery;
  endSessionNowRef.current = endSessionNow;
  onToggleMicRef.current = () => {
    if (micTranscription.isTranscribing) {
      micTranscription.stopTranscription();
    } else {
      micTranscription.startTranscription();
    }
  };
  onClearRef.current = () => {
    micTranscription.clearTranscript();
    tabTranscription.clearTranscript();
    tabAudioTranscription.clearTranscript();
    setMessages([]);
  };

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
        !micTranscription.interimTranscript &&
        !mergedTabInterimTranscript) ||
      isAnswering,
  });

  useKeyboardShortcut("k", onAnalyzeScreen, {
    disabled: !stream || isAnalyzing,
  });

  const transcriptProps = {
    messages,
    micInterimTranscript: micTranscription.interimTranscript,
    isMicTranscribing: micTranscription.isTranscribing,
    tabInterimTranscript: mergedTabInterimTranscript,
    isTabTranscribing: mergedTabIsTranscribing,
    isConnecting: micTranscription.isConnecting || mergedTabIsConnecting,
    error: micTranscription.error || mergedTabError,
    onToggleMic: () => {
      if (micTranscription.isTranscribing) {
        micTranscription.stopTranscription();
      } else {
        micTranscription.startTranscription();
      }
    },
    onClear: () => {
      micTranscription.clearTranscript();
      tabTranscription.clearTranscript();
      tabAudioTranscription.clearTranscript();
      setMessages([]);
    },
    onMinimize: toggleFullscreen,
    onChangeTab: startShare,
    onOpenOverlay: handleOpenOverlay,
  };

  const chatPanelProps = {
    messages: aiChat,
    inputMessage,
    onInputChange: setInputMessage,
    isAnalyzing,
    isAnswering,
    canAnswer:
      messages.length > 0 ||
      !!micTranscription.interimTranscript ||
      !!mergedTabInterimTranscript,
    canAnalyze: !!stream,
    onAiAnswer,
    onAnalyzeScreen,
    onSend: () => id && handleCustomQuery(id, inputMessage, selectedModel),
    onExit: () => setIsEndSessionDialogOpen(true),
    isFreeSession,
    timerText: formattedTime,
    isWarning: creditWarning !== null,
    selectedModel,
    onModelChange: setSelectedModel,
  };

  return (
    <div className="h-screen w-screen bg-[#f8f9fb] text-slate-900 flex flex-col overflow-hidden font-sans select-none fixed inset-0">
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
