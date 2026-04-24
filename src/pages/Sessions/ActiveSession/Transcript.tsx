import { useState } from "react";
import { cn } from "@/lib/utils";
import { TranscriptHeader } from "./components/TranscriptHeader";
import { TranscriptMessageList } from "./components/TranscriptMessageList";

export interface Message {
  id: string;
  sender: "User" | "Interviewer" | "AI";
  text: string;
  time: string;
  timestamp?: number;
}

interface TranscriptProps {
  messages: Message[];
  micInterimTranscript: string;
  isMicTranscribing: boolean;
  tabInterimTranscript: string;
  isTabTranscribing: boolean;
  isConnecting?: boolean;
  error?: string | null;
  onToggleMic: () => void;
  onClear: () => void;
  isFullscreen?: boolean;
  onMinimize?: () => void;
  onChangeTab?: () => void;
  onOpenOverlay?: () => void;
}

export const Transcript = ({
  messages,
  micInterimTranscript,
  isMicTranscribing,
  tabInterimTranscript,
  isTabTranscribing,
  isConnecting,
  error,
  onToggleMic,
  onClear,
  isFullscreen = false,
  onMinimize,
  onChangeTab,
  onOpenOverlay,
}: TranscriptProps) => {
  const [autoScroll, setAutoScroll] = useState(true);

  return (
    <div
      className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        isFullscreen ? "bg-transparent" : "bg-white",
      )}
    >
      <TranscriptHeader
        isConnecting={isConnecting}
        isTabTranscribing={isTabTranscribing}
        isMicTranscribing={isMicTranscribing}
        error={error}
        onToggleMic={onToggleMic}
        onClear={onClear}
        onOpenOverlay={onOpenOverlay}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
        isFullscreen={isFullscreen}
        onMinimize={onMinimize}
        onChangeTab={onChangeTab}
      />

      <TranscriptMessageList
        messages={messages}
        micInterim={micInterimTranscript}
        tabInterim={tabInterimTranscript}
        isFullscreen={isFullscreen}
      />
    </div>
  );
};
