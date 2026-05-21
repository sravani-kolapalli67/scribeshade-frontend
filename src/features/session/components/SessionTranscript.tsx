/**
 * SessionTranscript
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible full conversation transcript panel inside the floating overlay.
 *
 * - Shows final messages from both mic ("You") and system audio ("System")
 * - Shows a live interim bubble for partial speech recognition results
 * - Scrolls to bottom on new messages
 * - Exports a clean interface so FloatingApp (and future SessionLayer) can
 *   render it without knowing the internal layout details.
 */
import React, { useEffect, useRef } from "react";
import { TranscriptBubble } from "./TranscriptBubble";

export interface TranscriptMessage {
  id: string;
  sender: "User" | "Interviewer";
  text: string;
  timestamp: number;
  originalText?: string;
  patchedText?: string;
  patchedAt?: number;
  patchedByUser?: boolean;
}

export interface SessionTranscriptProps {
  messages: TranscriptMessage[];
  micInterim?: string;
  tabInterim?: string;
  onPatchMessage?: (messageId: string, patchedText: string) => void;
}

export const SessionTranscript: React.FC<SessionTranscriptProps> = ({
  messages,
  micInterim = "",
  tabInterim = "",
  onPatchMessage,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const interimText = micInterim || tabInterim;
  const isYouInterim = !!micInterim;

  // Scroll to bottom when messages change or interim arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, interimText]);

  return (
    <div
      ref={scrollRef}
      className="border-b border-white/10 max-h-52 overflow-y-auto no-scrollbar px-3 py-2.5 space-y-2.5"
    >
      {messages.length === 0 && !interimText ? (
        <p className="text-[11px] text-white/30 text-center py-2">
          No transcript yet…
        </p>
      ) : (
        <>
          {messages.map((m) => (
            <TranscriptBubble
              key={m.id}
              id={m.id}
              sender={m.sender}
              text={m.patchedText || m.text}
              patchedByUser={m.patchedByUser}
              isInterim={false}
              onPatch={onPatchMessage}
            />
          ))}

          {interimText && (
            <TranscriptBubble
              sender={isYouInterim ? "User" : "Interviewer"}
              text={interimText}
              isInterim
            />
          )}
        </>
      )}
    </div>
  );
};
