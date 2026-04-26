import { useEffect, useRef } from "react";
import { Mic, MicOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlayTranscriptProps {
  transcript: string;
  interimTranscript?: string;
  isMicActive?: boolean;
  className?: string;
}

export const OverlayTranscript = ({
  transcript,
  interimTranscript,
  isMicActive,
  className,
}: OverlayTranscriptProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimTranscript]);

  return (
    <div
      data-tauri-drag-region
      className={cn("flex-1 overflow-hidden flex flex-col gap-2", className)}
    >
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-2 scrollbar-hide text-sm leading-relaxed selection:bg-blue-500/30"
      >
        {transcript || interimTranscript ? (
          <p className="italic">
            <span className="text-white/70 font-medium">{transcript}</span>
            {interimTranscript && (
              <span className="text-white/30 ml-1">{interimTranscript}</span>
            )}
          </p>
        ) : (
          <span className="text-white/20 italic animate-pulse">
            {isMicActive ? "Listening for speech..." : "Waiting for audio..."}
          </span>
        )}
      </div>
    </div>
  );
};
