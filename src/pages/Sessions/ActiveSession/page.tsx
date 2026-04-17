import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDeepgram } from "@/hooks/useDeepgram";
import { useScreenShare } from "@/hooks/useScreenShare";
import { useAIChat } from "@/hooks/useAIChat";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useFreeSessionTimer } from "@/hooks/useFreeSessionTimer";
import { toast } from "sonner";

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

export default function ActiveSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isEndSessionDialogOpen, setIsEndSessionDialogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const onTimeUp = useCallback(async () => {
    if (!id) return;
    
    toast.info("Free session time is up! Ending session...", {
      duration: 3000,
    });

    try {
      const transcript = messages.map(m => `[${m.sender}]: ${m.text}`).join('\n');
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
      console.error("Error auto-deactivating session:", error);
    } finally {
      navigate("/sessions");
    }
  }, [id, messages, navigate]);

  const { isFreeSession, formattedTime } = useFreeSessionTimer({
    sessionId: id,
    onTimeUp,
  });

  const { stream, videoRef, startShare, captureScreenshot } = useScreenShare();

  const onTranscriptUpdate = (sender: "User" | "Interviewer") => (text: string, isFinal: boolean) => {
    if (isFinal) {
      setMessages(prev => {
        const now = Date.now();
        const normalizedNew = text.toLowerCase().trim().replace(/[.!?]/g, '');
        
        // Deduplication: Check if this message was already captured by the OTHER source
        // within a small time window (2 seconds).
        const isEcho = prev.some(m => {
          if (m.sender === sender) return false;
          if (!m.timestamp || (now - m.timestamp) > 2000) return false;
          
          const normalizedExisting = m.text.toLowerCase().trim().replace(/[.!?]/g, '');
          return normalizedExisting === normalizedNew || 
                 normalizedExisting.includes(normalizedNew) || 
                 normalizedNew.includes(normalizedExisting);
        });

        if (isEcho) {
          console.log(`[Dedupe] Suppressed echo from ${sender}: "${text}"`);
          return prev;
        }

        return [...prev, {
          id: Math.random().toString(36).substring(7),
          sender,
          text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: now
        }];
      });
    }
  };

  const micTranscription = useDeepgram({
    apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY || "",
    model: "nova-3",
    onTranscript: onTranscriptUpdate("User")
  });

  const tabTranscription = useDeepgram({
    apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY || "",
    model: "nova-3",
    inputStream: stream,
    onTranscript: onTranscriptUpdate("Interviewer")
  });

  const {
    aiChat,
    inputMessage,
    setInputMessage,
    isAnalyzing,
    isAnswering,
    handleAnalyzeScreen,
    handleAiAnswer,
  } = useAIChat();

  const onAnalyzeScreen = async () => {
    if (!stream || !id) return;
    const screenshot = await captureScreenshot();
    handleAnalyzeScreen(id, screenshot);
  };

  const onAiAnswer = () => {
    if (!id) return;
    // We use a combination of both transcripts for AI answering
    const combinedTranscript = messages.map(m => `[${m.sender}]: ${m.text}`).join('\n');
    handleAiAnswer(id, combinedTranscript);
  };

  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  // Keyboard Shortcuts
  useKeyboardShortcut("g", onAiAnswer, { 
    disabled: (messages.length === 0) || isAnswering 
  });
  
  useKeyboardShortcut("k", onAnalyzeScreen, { 
    disabled: !stream || isAnalyzing 
  });

  const transcriptProps = {
    messages,
    micInterimTranscript: micTranscription.interimTranscript,
    isMicTranscribing: micTranscription.isTranscribing,
    tabInterimTranscript: tabTranscription.interimTranscript,
    isTabTranscribing: tabTranscription.isTranscribing,
    isConnecting: micTranscription.isConnecting || tabTranscription.isConnecting,
    error: micTranscription.error || tabTranscription.error,
    onStart: () => {
      micTranscription.startTranscription();
      tabTranscription.startTranscription();
    },
    onStop: () => {
      micTranscription.stopTranscription();
      tabTranscription.stopTranscription();
    },
    onClear: () => {
      micTranscription.clearTranscript();
      tabTranscription.clearTranscript();
      setMessages([]);
    },
    onMinimize: toggleFullscreen,
    onChangeTab: startShare,
  };

  const chatPanelProps = {
    messages: aiChat,
    inputMessage,
    onInputChange: setInputMessage,
    isAnalyzing,
    isAnswering,
    canAnswer: messages.length > 0,
    canAnalyze: !!stream,
    onAiAnswer,
    onAnalyzeScreen,
    onExit: () => setIsEndSessionDialogOpen(true),
    isFreeSession,
    timerText: formattedTime,
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
            <ResizablePanel defaultSize={40} minSize={25} className="flex flex-col">
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
 
                <ResizableHandle className="bg-slate-200/50 hover:bg-slate-300 transition-colors" withHandle />
 
                <ResizablePanel defaultSize={50} minSize={20} className="flex flex-col">
                  <Transcript {...transcriptProps} />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
 
            <ResizableHandle className="bg-slate-200/50 hover:bg-slate-300 transition-colors w-1.5" withHandle />
 
            <ResizablePanel defaultSize={60} minSize={30} className="flex flex-col">
              <AIChatPanel {...chatPanelProps} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      )}
 
      <EndSessionDialog
        isOpen={isEndSessionDialogOpen}
        onClose={() => setIsEndSessionDialogOpen(false)}
        sessionId={id || ""}
        transcript={messages.map(m => `[${m.sender}]: ${m.text}`).join('\n')}
      />
    </div>
  );
}

