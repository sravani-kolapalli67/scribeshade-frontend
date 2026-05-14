import { useState, useCallback, useRef } from "react";
import { Message } from "@/pages/Sessions/ActiveSession/Transcript";

const SEGMENT_MARKER = /\n?={3,}NEXT_QUESTION={3,}\n?/;
const QUESTION_MARKER = /(?:\*\*\s*)?QUESTION\s*:/i;
// Backend sentinel: the model returns this single line when the input block
// contains no genuine new interview question. We must not render a card for it.
const NO_QUESTION_MARKER = /={3,}\s*NO_NEW_QUESTION\s*={3,}/i;

/**
 * Helper used by both handleAnalyzeScreen and handleAiAnswer to consume a
 * streaming AI response and split it into multiple Message cards on the fly
 * whenever the model emits the `===NEXT_QUESTION===` separator.
 *
 * Behaviour:
 *   - keeps the FIRST real Q/A segment flowing into the original messageId
 *   - on every new separator detected, finalises the current segment and
 *     spawns a NEW Message record (so the user sees real-time card growth
 *     instead of one pager-style blob)
 *   - **preamble filtering**: some models emit a meta header like
 *     "I can see 10 questions on the screen. I will answer each one..."
 *     before the first **QUESTION:** block. We discard that segment so the
 *     user sees only real Q/A cards and never a "summary" card.
 */
async function consumeSegmentedStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  initialMessageId: string,
  setAiChat: React.Dispatch<React.SetStateAction<Message[]>>,
  baseTime: string,
): Promise<string[]> {
  const decoder = new TextDecoder();
  let buffer = "";
  // Number of leading `parts` to discard (preamble filtering).
  // Starts at 0; flips to 1 once we observe parts[0] is a meta preamble.
  let leadingSkip = 0;
  let preambleDecided = false;
  // segmentTexts[i] = current text of the i-th RENDERED card; segmentIds[i] = its message id.
  const segmentTexts: string[] = [""];
  const segmentIds: string[] = [initialMessageId];

  // Track which segment ids we've already hidden mid-stream (sentinel detected early).
  const midStreamDropped = new Set<string>();

  const flushToState = () => {
    setAiChat((prev) => {
      const next = [...prev];
      for (let i = 0; i < segmentIds.length; i++) {
        const sid = segmentIds[i];
        // If this segment contains the sentinel at any point during streaming,
        // immediately remove its card so it never flashes on screen.
        if (NO_QUESTION_MARKER.test(segmentTexts[i])) {
          midStreamDropped.add(sid);
        }
        if (midStreamDropped.has(sid)) {
          // Remove from state immediately — don't render or update.
          const idx = next.findIndex((m) => m.id === sid);
          if (idx >= 0) next.splice(idx, 1);
          continue;
        }
        const idx = next.findIndex((m) => m.id === sid);
        if (idx >= 0) {
          next[idx] = { ...next[idx], text: segmentTexts[i] };
        } else {
          next.push({
            id: sid,
            sender: "AI",
            text: segmentTexts[i],
            time: baseTime,
          });
        }
      }
      return next;
    });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split(SEGMENT_MARKER);

    // Decide preamble status as soon as we see at least one separator
    // (meaning parts[0] is finalised — no more text will be appended to it).
    if (!preambleDecided && parts.length >= 2) {
      preambleDecided = true;
      const first = parts[0].trim();
      if (!QUESTION_MARKER.test(first)) {
        // Preamble. Drop the placeholder card and shift everything by one.
        leadingSkip = 1;
        setAiChat((prev) => prev.filter((m) => m.id !== initialMessageId));
        // Re-anchor: the first RENDERED card is now parts[1]. Reuse a fresh
        // id so the existing initialMessageId is fully forgotten.
        segmentIds[0] = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        segmentTexts[0] = "";
      }
    }

    const renderable = parts.length - leadingSkip;
    while (segmentIds.length < renderable) {
      segmentIds.push(
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      );
      segmentTexts.push("");
    }

    for (let i = 0; i < renderable; i++) {
      segmentTexts[i] = parts[i + leadingSkip].trim();
    }

    flushToState();
  }

  // Final flush — also catches the case where the stream ended WITHOUT any
  // separator AND the single segment happened to be preamble-only (rare).
  if (!preambleDecided) {
    // Only one segment in total; treat as a single answer (no preamble check).
  }

  flushToState();

  // Final cleanup: ensure any sentinel cards detected mid-stream OR only at
  // the very end (no separators, stream ended) are removed from state.
  const allDropped = new Set<string>(midStreamDropped);
  for (let i = 0; i < segmentTexts.length; i++) {
    if (NO_QUESTION_MARKER.test(segmentTexts[i])) {
      allDropped.add(segmentIds[i]);
    }
  }
  if (allDropped.size) {
    setAiChat((prev) => prev.filter((m) => !allDropped.has(m.id)));
  }

  return segmentIds.filter((sid) => !allDropped.has(sid));
}

export const useAIChat = () => {
  const [aiChat, setAiChat] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);

  // In-flight counter — supports parallel AI calls (multi-question pipeline).
  // `isAnswering` reflects "at least one request in-flight" for UI spinners,
  // but new requests are NOT blocked while another is streaming.
  const inFlightRef = useRef(0);

  // Recent-question dedup: prevents the same exact question from being
  // re-issued within 4 s (e.g. transcript echo, double-click, debounced
  // multi-question splitter firing twice).
  const recentQuestionsRef = useRef<{ q: string; t: number }[]>([]);

  const handleAnalyzeScreen = useCallback(
    async (sessionId: string, screenshotBlob: Blob | null, aiModel: string) => {
      if (isAnalyzing || !screenshotBlob) return;

      setIsAnalyzing(true);

      const currentUsage = parseInt(localStorage.getItem(`aiUsage_${sessionId}`) || "0", 10);
      localStorage.setItem(`aiUsage_${sessionId}`, (currentUsage + 1).toString());

      const messageId = Date.now().toString();
      const newAiMessage: Message = {
        id: messageId,
        sender: "AI",
        text: "",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setAiChat((prev) => [...prev, newAiMessage]);

      try {
        const formData = new FormData();
        formData.append("screenshot", screenshotBlob, "screenshot.jpg");
        if (aiModel) {
          formData.append("aiModel", aiModel);
        }

        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/analyze-screen`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) throw new Error("Analysis failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        await consumeSegmentedStream(
          reader,
          messageId,
          setAiChat,
          newAiMessage.time,
        );
      } catch (error) {
        console.error("AI Streaming error:", error);
        setAiChat((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, text: "Sorry, I encountered an error during analysis." }
              : msg,
          ),
        );
      } finally {
        setIsAnalyzing(false);
      }
    },
    [isAnalyzing],
  );

  // handleAiAnswer — answers a SINGLE specific question.
  // `question` is the exact interviewer question text, NOT the full transcript blob.
  // The backend's getSessionFullContext already fetches conversation history from DB,
  // so sending just the question is sufficient and prevents the AI from fixating on
  // whichever question appears last in a large concatenated dump.
  const handleAiAnswer = useCallback(
    async (sessionId: string, question: string, aiModel: string) => {
      if (!question.trim()) return;

      // Same-question dedup window (4 s).
      const now = Date.now();
      const normalized = question.trim().toLowerCase();
      const recent = recentQuestionsRef.current.filter((r) => now - r.t < 4000);
      if (recent.some((r) => r.q === normalized)) {
        console.log("[useAIChat] Suppressed duplicate question:", question.slice(0, 60));
        return;
      }
      recentQuestionsRef.current = [...recent, { q: normalized, t: now }].slice(-10);

      // Parallel-safe: increment in-flight counter, mark answering.
      inFlightRef.current += 1;
      setIsAnswering(true);

      const currentUsage = parseInt(localStorage.getItem(`aiUsage_${sessionId}`) || "0", 10);
      localStorage.setItem(`aiUsage_${sessionId}`, (currentUsage + 1).toString());

      // Unique per-call id — Date.now() alone collides when 2+ parallel calls
      // start in the same millisecond. Add a random suffix.
      const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newAiMessage: Message = {
        id: messageId,
        sender: "AI",
        text: "",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        // Store the original question so Regenerate can re-use it without
        // rebuilding the transcript blob.
        question,
      };

      setAiChat((prev) => [...prev, newAiMessage]);

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            // Send only the specific question; backend context includes session history.
            body: JSON.stringify({ transcript: question, aiModel }),
          },
        );

        if (!response.ok) throw new Error("AI request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        await consumeSegmentedStream(
          reader,
          messageId,
          setAiChat,
          newAiMessage.time,
        );
      } catch (error) {
        console.error("AI Answering error:", error);
        setAiChat((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  text: "Sorry, I couldn't generate an answer from the transcript.",
                }
              : msg,
          ),
        );
      } finally {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        if (inFlightRef.current === 0) setIsAnswering(false);
      }
    },
    [],
  );

  const handleCustomQuery = useCallback(
    async (sessionId: string, query: string, aiModel: string) => {
      if (isAnswering || !query.trim()) return;

      setIsAnswering(true);

      const currentUsage = parseInt(
        localStorage.getItem(`aiUsage_${sessionId}`) || "0",
        10,
      );
      localStorage.setItem(
        `aiUsage_${sessionId}`,
        (currentUsage + 1).toString(),
      );

      const messageId = Date.now().toString();
      const userMessage: Message = {
        id: messageId + "-user",
        sender: "User",
        text: query,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setAiChat((prev) => [...prev, userMessage]);
      setInputMessage("");

      // Save user query to backend history
      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/save-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "USER",
          question: query,
          answer: "",
          time: userMessage.time,
        }),
      }).catch((err) => console.error("Failed to save user query:", err));

      const aiMessageId = Date.now().toString();
      const newAiMessage: Message = {
        id: aiMessageId,
        sender: "AI",
        text: "",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setAiChat((prev) => [...prev, newAiMessage]);

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ transcript: query, isCustomQuery: true, aiModel }),
          },
        );

        if (!response.ok) throw new Error("AI request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let streamedText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedText += chunk;

          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, text: streamedText } : msg,
            ),
          );
        }
      } catch (error) {
        console.error("AI Custom Query error:", error);
        setAiChat((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  text: "Sorry, I couldn't process your question.",
                }
              : msg,
          ),
        );
      } finally {
        setIsAnswering(false);
      }
    },
    [isAnswering],
  );

  // handleRegenerate — re-runs the AI for a specific message.
  // Uses the question stored on the message object (set by handleAiAnswer) so
  // the exact same question is re-answered with fresh generation.
  const handleRegenerate = useCallback(
    async (sessionId: string, messageId: string, aiModel: string) => {
      if (isAnswering) return;

      // Look up the stored question from the existing AI message.
      let question = "";
      setAiChat((prev) => {
        const target = prev.find((m) => m.id === messageId);
        if (target?.question) question = target.question;
        // Clear the text so the UI shows streaming from scratch.
        return prev.map((msg) => (msg.id === messageId ? { ...msg, text: "" } : msg));
      });

      if (!question) return;

      setIsAnswering(true);

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: question, aiModel }),
          },
        );

        if (!response.ok) throw new Error("AI request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let streamedText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedText += chunk;

          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, text: streamedText } : msg,
            ),
          );
        }
      } catch (error) {
        console.error("AI Regenerate error:", error);
        setAiChat((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, text: "Sorry, I couldn't regenerate the answer." }
              : msg,
          ),
        );
      } finally {
        setIsAnswering(false);
      }
    },
    [isAnswering],
  );

  return {
    aiChat,
    setAiChat,
    inputMessage,
    setInputMessage,
    isAnalyzing,
    isAnswering,
    handleAnalyzeScreen,
    handleAiAnswer,
    handleCustomQuery,
    handleRegenerate,
  };
};
