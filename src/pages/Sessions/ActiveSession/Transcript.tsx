import { useState, useEffect, useRef } from "react";
import { Mic, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  isFullscreen?: boolean;
  onMinimize?: () => void;
  onChangeTab?: () => void;
}

export const Transcript = ({ 
  messages,
  micInterimTranscript, 
  isMicTranscribing, 
  tabInterimTranscript,
  isTabTranscribing,
  isConnecting,
  onStart, 
  onStop, 
  onClear,
  isFullscreen = false,
  onMinimize,
  onChangeTab,
}: TranscriptProps) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isTranscribing = isMicTranscribing || isTabTranscribing;

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, micInterimTranscript, tabInterimTranscript, autoScroll]);

  return (
    <div
      className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        isFullscreen ? "bg-transparent" : "bg-white",
      )}
    >
      {/* HEADER */}
      <div
        className={cn(
          "flex flex-col border-b border-white/10 shrink-0",
          isFullscreen
            ? "bg-transparent drop-shadow-lg"
            : "bg-white border-slate-200/50",
        )}
      >
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-bold text-slate-800">Transcript</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={isTranscribing ? onStop : onStart}
                disabled={isConnecting}
                className={cn(
                  "h-8 gap-2 rounded-xl text-xs font-bold px-3 transition-all",
                  isTranscribing
                    ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 shadow-sm shadow-rose-100/50"
                    : "bg-white/50 border-slate-200 hover:bg-white text-slate-700 hover:border-slate-300",
                  isConnecting && "opacity-70 cursor-not-allowed",
                )}
              >
                {isConnecting ? (
                  <div className="h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Mic
                    className={cn(
                      "h-3.5 w-3.5 transition-all text-slate-500",
                      isTranscribing && "animate-pulse text-rose-500",
                    )}
                  />
                )}
                {isConnecting
                  ? "Connecting..."
                  : isTranscribing
                    ? "Disconnect"
                    : "Connect"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onClear}
                className="h-8 gap-2 rounded-xl text-xs font-bold bg-white/50 border-slate-200 hover:bg-white px-3 text-slate-700 transition-all hover:border-slate-300"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">
              Auto Scroll
            </span>
            <Switch
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
              className="scale-75"
            />
          </div>
        </div>

        {isFullscreen && (
          <div className="px-5 pb-3 flex items-center gap-2">
            <Button
              onClick={onMinimize}
              className="h-8 gap-2 rounded-xl text-xs font-bold px-4 bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_12px_rgba(239,68,68,0.2)]"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Minimize
            </Button>
            <Button
              onClick={onChangeTab}
              className="h-8 gap-2 rounded-xl text-xs font-bold px-4 bg-slate-200/50 backdrop-blur-sm hover:bg-slate-300/50 text-slate-700 border-none"
            >
              Change Tab
            </Button>
          </div>
        )}
      </div>

      {/* Unified Chat Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-5 space-y-4 scroll-smooth no-scrollbar"
      >
        {messages.length === 0 &&
        !micInterimTranscript &&
        !tabInterimTranscript ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Mic className="h-8 w-8 mb-2 opacity-10" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Ready to Transcribe
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300",
                  m.sender === "User"
                    ? "ml-auto items-end"
                    : "mr-auto items-start",
                )}
              >
                <div
                  className={cn(
                    "px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-sm leading-relaxed",
                    m.sender === "User"
                      ? "bg-brand/80 text-white rounded-tr-none"
                      : "bg-slate-100 text-slate-700 rounded-tl-none border border-slate-200/50",
                  )}
                >
                  {m.text}
                </div>
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    {m.sender === "User" ? "You" : "Interviewer"}
                  </span>
                  <span className="text-[9px] text-slate-300 font-medium">
                    {m.time}
                  </span>
                </div>
              </div>
            ))}

            {/* Interim Transcripts (Typing Indicators) */}
            {tabInterimTranscript && (
              <div className="flex flex-col items-start max-w-[80%] mr-auto animate-pulse">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300 mb-1 px-1">
                  Interviewer...
                </span>
                <div className="px-4 py-2.5 rounded-2xl rounded-tl-none text-sm font-semibold bg-slate-50 text-slate-400 border border-dashed border-slate-200 italic">
                  {tabInterimTranscript}...
                </div>
              </div>
            )}

            {micInterimTranscript && (
              <div className="flex flex-col items-end max-w-[80%] ml-auto animate-pulse">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300 mb-1 px-1">
                  You...
                </span>
                <div className="px-4 py-2.5 rounded-2xl rounded-tr-none text-sm font-semibold bg-slate-50 text-slate-400 border border-dashed border-slate-200 italic">
                  {micInterimTranscript}...
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
