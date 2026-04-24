import { useRef, useEffect, useState } from "react";
import { Radio, Headset, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Message } from "../Transcript";
import { TranscriptMessage } from "./TranscriptMessage";

interface TranscriptMessageListProps {
  messages: Message[];
  micInterim?: string;
  tabInterim?: string;
  isFullscreen?: boolean;
}

export const TranscriptMessageList = ({
  messages,
  micInterim,
  tabInterim,
  isFullscreen = false,
}: TranscriptMessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, micInterim, tabInterim, autoScroll]);

  const isEmpty = messages.length === 0 && !micInterim && !tabInterim;

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className={cn(
          "w-16 h-16 rounded-3xl flex items-center justify-center mb-4 transition-colors",
          isFullscreen ? "bg-white/5" : "bg-slate-50"
        )}>
          <Radio className={cn(
            "h-8 w-8 animate-pulse",
            isFullscreen ? "text-white/20" : "text-slate-200"
          )} />
        </div>
        <span className={cn(
          "text-[11px] font-bold uppercase tracking-[0.3em]",
          isFullscreen ? "text-white/30" : "text-slate-400"
        )}>
          Waiting for conversation...
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth no-scrollbar"
      onScroll={(e) => {
        const target = e.currentTarget;
        const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
        setAutoScroll(isAtBottom);
      }}
    >
      <div className="flex flex-col gap-5">
        {messages.map((m) => (
          <TranscriptMessage key={m.id} message={m} isFullscreen={isFullscreen} />
        ))}

        {/* Interim Transcripts */}
        {tabInterim && (
          <div className="flex flex-row mr-auto max-w-[80%] animate-in fade-in slide-in-from-left-2 duration-300">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center mr-3 shrink-0 shadow-sm border transition-colors",
              isFullscreen ? "bg-white/10 border-white/10" : "bg-slate-100 border-slate-200"
            )}>
              <Headset className={cn("h-4 w-4", isFullscreen ? "text-white/50" : "text-slate-500")} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <span className="text-[9px] text-brand font-bold uppercase animate-pulse">
                  Live
                </span>
              </div>
              <div className={cn(
                "px-5 py-3 rounded-2xl rounded-tl-none text-[14px] font-medium border italic transition-all",
                isFullscreen 
                  ? "bg-white/5 text-white/80 border-white/10 backdrop-blur-md"
                  : "bg-white text-slate-500 border-slate-100 shadow-sm"
              )}>
                {tabInterim}
              </div>
            </div>
          </div>
        )}

        {micInterim && (
          <div className="flex flex-row-reverse ml-auto max-w-[80%] animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center ml-3 shrink-0 shadow-sm border border-brand/20">
              <User className="h-4 w-4 text-brand" />
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 mb-1.5 px-1 text-right">
                <span className="text-[9px] text-brand font-bold uppercase animate-pulse">
                  Live
                </span>
                <span className={cn(
                  "text-[10px] font-extrabold uppercase tracking-widest",
                  isFullscreen ? "text-white/40" : "text-slate-400"
                )}>
                  You
                </span>
              </div>
              <div className={cn(
                "px-5 py-3 rounded-2xl rounded-tr-none text-[14px] font-medium border italic transition-all",
                isFullscreen 
                  ? "bg-brand/20 text-white border-brand/30 backdrop-blur-md"
                  : "bg-brand/5 text-brand-dark border-brand/10 shadow-sm"
              )}>
                {micInterim}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
