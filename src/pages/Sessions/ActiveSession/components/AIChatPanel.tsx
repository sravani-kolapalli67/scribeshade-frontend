import { Message } from "../Transcript";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ChatActionButtons } from "./ChatActionButtons";
import { cn } from "@/lib/utils";

interface AIChatPanelProps {
  messages: Message[];
  inputMessage: string;
  onInputChange: (value: string) => void;
  isAnalyzing: boolean;
  isAnswering: boolean;
  canAnswer: boolean;
  canAnalyze: boolean;
  onAiAnswer: () => void;
  onAnalyzeScreen: () => void;
  onExit: () => void;
  isFullscreen?: boolean;
}

export const AIChatPanel = ({
  messages,
  inputMessage,
  onInputChange,
  isAnalyzing,
  isAnswering,
  canAnswer,
  canAnalyze,
  onAiAnswer,
  onAnalyzeScreen,
  onExit,
  isFullscreen = false,
}: AIChatPanelProps) => {
  return (
    <div className={cn(
        "h-full flex flex-col overflow-hidden relative transition-all duration-300", 
        isFullscreen ? "bg-transparent" : "bg-white"
    )}>
      <ChatHeader onExit={onExit} isFullscreen={isFullscreen} />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <ChatMessageList
          messages={messages}
          isStreaming={isAnalyzing || isAnswering}
          isFullscreen={isFullscreen}
        />
      </div>

      <div className={cn(
        "p-6 pt-2 border-t border-white/10 shrink-0", 
        isFullscreen ? "bg-transparent drop-shadow-xl" : "bg-white border-slate-200/50"
      )}>
        <ChatInput value={inputMessage} onChange={onInputChange} isFullscreen={isFullscreen} />
        <ChatActionButtons
          onAiAnswer={onAiAnswer}
          onAnalyzeScreen={onAnalyzeScreen}
          isAnswering={isAnswering}
          isAnalyzing={isAnalyzing}
          canAnswer={canAnswer}
          canAnalyze={canAnalyze}
        />
      </div>
    </div>
  );
};
