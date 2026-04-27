import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useDeepgram } from "@/hooks/useDeepgram";
import { useScreenShare } from "@/hooks/useScreenShare";
import { useAIChat } from "@/hooks/useAIChat";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useFreeSessionTimer } from "@/hooks/useFreeSessionTimer";
import { toast } from "sonner";
import { emit, listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

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
import { ConnectDialog } from "@/components/Sessions/ConnectDialog";
import { useInactivityObserver } from "@/hooks/useInactivityObserver";
import { InactivityDialog } from "@/components/Sessions/InactivityDialog";

export default function ActiveSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isEndSessionDialogOpen, setIsEndSessionDialogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState(
    location.state?.connectData?.aiModel || "google/gemma-4-26b-a4b-it"
  );
  const [selectedLanguage, setSelectedLanguage] = useState(
    location.state?.connectData?.language || "English"
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

  const handleConnectSuccess = useCallback((finalModel: string, finalLanguage: string) => {
    setIsConnectDialogOpen(false);
    if (finalModel) {
      setSelectedModel(finalModel);
    }
    if (finalLanguage) {
      setSelectedLanguage(finalLanguage);
    }
  }, []);

  const handleConnectCancel = useCallback(() => {
    setIsConnectDialogOpen(false);
    navigate("/sessions");
  }, [navigate]);

  const endSessionNow = useCallback(async () => {
    if (!id) return;

    toast.info("Ending session...", {
      duration: 3000,
    });

    try {
      const transcript = messages
        .map((m) => `[${m.sender}]: ${m.text}`)
        .join("\n");
      const aiUsage = parseInt(localStorage.getItem(`aiUsage_${id}`) || "0");
      await fetch(
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
  }, [id, messages, navigate]);

  const onTimeUp = useCallback(async () => {
    toast.info("Free session time is up!");
    endSessionNow();
  }, [endSessionNow]);

  const { isFreeSession, formattedTime } = useFreeSessionTimer({
    sessionId: id,
    onTimeUp,
  });

  //   const { showDialog: showInactivityDialog, remainingTime, onStayActive } = useInactivityObserver(
  //     undefined, // Use default from env
  //     endSessionNow
  //   );

  const { stream, videoRef, startShare, captureScreenshot } = useScreenShare({
    autoStart: !isConnectDialogOpen,
  });

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

  const tabTranscription = useDeepgram({
    apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY || "",
    model: "nova-3",
    language: getLanguageCode(selectedLanguage),
    inputStream: stream,
    onTranscript: onInterviewerTranscript,
  });

  // Auto-start tab transcription when a stream is available
  useEffect(() => {
    console.log("[Auto-Start Check]", {
      hasStream: !!stream,
      isTranscribing: tabTranscription.isTranscribing,
      isConnecting: tabTranscription.isConnecting,
    });
    if (
      stream &&
      !tabTranscription.isTranscribing &&
      !tabTranscription.isConnecting
    ) {
      console.log("Auto-starting tab transcription...");
      tabTranscription.startTranscription();
    }
  }, [
    stream,
    tabTranscription.isTranscribing,
    tabTranscription.isConnecting,
    tabTranscription.startTranscription,
  ]);

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
      micTranscription.interimTranscript || tabTranscription.interimTranscript;

    if (!hasHistory && !interimText) return;

    isExecutingRef.current = true;
    try {
      console.log("[Trigger] AI Answer initiated");
      let combinedTranscript = messages
        .map((m) => `[${m.sender === "User" ? "YOU" : "Interviewer"}]: ${m.text}`)
        .join("\n");

      if (interimText) {
        const sender = micTranscription.interimTranscript ? "YOU" : "Interviewer";
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
    tabTranscription.interimTranscript,
    selectedModel,
  ]);

  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  const isOpeningOverlayRef = useRef(false);
  const lastMinimizeTriggerRef = useRef(0);

  const handleOpenOverlay = async () => {
    if (isOpeningOverlayRef.current) return;
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
      const combinedTranscript = messages.map((m) => m.text).join("\n");
      await emit("overlay-update", {
        transcript: combinedTranscript,
        interimTranscript:
          micTranscription.interimTranscript ||
          tabTranscription.interimTranscript,
        status:
          micTranscription.isConnecting || tabTranscription.isConnecting
            ? "Connecting"
            : micTranscription.isTranscribing || tabTranscription.isTranscribing
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
    tabTranscription.isTranscribing,
    tabTranscription.interimTranscript,
    formattedTime,
    id,
    selectedModel,
  ]);

  // Forward AI chat responses to overlay
  useEffect(() => {
    if (aiChat.length === 0) return;
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
    setMessages([]);
  };

  // Listen for overlay events (AI answer, analyze screen, exit)
  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
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
        if (active && id) handleCustomQueryRef.current(id, query, selectedModelRef.current);
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
        !tabTranscription.interimTranscript) ||
      isAnswering,
  });

  useKeyboardShortcut("k", onAnalyzeScreen, {
    disabled: !stream || isAnalyzing,
  });

  const transcriptProps = {
    messages,
    micInterimTranscript: micTranscription.interimTranscript,
    isMicTranscribing: micTranscription.isTranscribing,
    tabInterimTranscript: tabTranscription.interimTranscript,
    isTabTranscribing: tabTranscription.isTranscribing,
    isConnecting:
      micTranscription.isConnecting || tabTranscription.isConnecting,
    error: micTranscription.error || tabTranscription.error,
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
      !!tabTranscription.interimTranscript,
    canAnalyze: !!stream,
    onAiAnswer,
    onAnalyzeScreen,
    onSend: () => id && handleCustomQuery(id, inputMessage, selectedModel),
    onExit: () => setIsEndSessionDialogOpen(true),
    isFreeSession,
    timerText: formattedTime,
    selectedModel,
    onModelChange: setSelectedModel,
  };

  return (
    <div className="h-screen w-screen bg-[#f8f9fb] text-slate-900 flex flex-col overflow-hidden font-sans select-none fixed inset-0">
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
