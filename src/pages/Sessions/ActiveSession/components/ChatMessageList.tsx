import { Sparkles } from "lucide-react";
import { Message } from "../Transcript";
import { ChatMessage } from "./ChatMessage";
import { cn } from "@/lib/utils";

interface ChatMessageListProps {
  messages: Message[];
  isStreaming: boolean;
  isFullscreen?: boolean;
  onRegenerate?: (messageId: string) => void;
}

export const ChatMessageList = ({
  messages,
  isStreaming,
  isFullscreen = false,
  onRegenerate,
}: ChatMessageListProps) => {
  return (
    <div className="flex-1 overflow-y-auto p-8 relative no-scrollbar">
      {messages.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
          <div className="h-12 w-12 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-brand" />
          </div>
          <h3 className={cn(
            "text-lg font-bold mb-1",
            isFullscreen ? "text-white" : "text-slate-700"
          )}>
            No messages yet.
          </h3>
          <p className={cn(
            "text-sm font-medium",
            isFullscreen ? "text-slate-300" : "text-slate-400"
          )}>
            Click "AI Answer" to start!
          </p>
        </div>
      ) : (
        messages.map((chat) => (
          <ChatMessage
            key={chat.id}
            message={chat}
            isFullscreen={isFullscreen}
            isStreaming={
              isStreaming && chat.id === messages[messages.length - 1].id
            }
            onRegenerate={onRegenerate ? () => onRegenerate(chat.id) : undefined}
          />
        ))
      )}
    </div>
  );
};
