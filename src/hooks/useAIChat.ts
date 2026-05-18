import { useState, useCallback, useRef, useEffect } from "react";
import { Message } from "@/pages/Sessions/ActiveSession/Transcript";

const SEGMENT_MARKER = /\n?={3,}NEXT_QUESTION={3,}\n?/;
const QUESTION_MARKER = /(?:\*\*\s*)?QUESTION\s*:/i;
// Backend sentinel: the model returns this single line when the input block
// contains no genuine new interview question. We must not render a card for it.
const NO_QUESTION_MARKER = /={3,}\s*NO_NEW_QUESTION\s*={3,}/i;

const EXTRACT_QUESTION_FROM_ANSWER_RE =
  /^\s*(?:\*+\s*)?(?:summarized\s+question|question)\s*:?\s*(?:\*+)?\s*([\s\S]*?)\s*(?:\*+\s*)?(?:answer)\s*:?\s*(?:\*+)?\s*[\s\S]*$/i;
const EXTRACT_INLINE_QUESTION_RE =
  /^\s*(?:\*+\s*)?(?:summarized\s+question|question)\s*:?\s*(?:\*+)?\s*(.+)$/im;
const FOLLOWUP_QUESTION_RE =
  /^(?:and|also|then|what about|how about|follow[- ]?up|can you expand|can you explain more|elaborate|why|when|where|which|who)\b/i;

function extractQuestionFromAiText(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) return "";
  const match = cleaned.match(EXTRACT_QUESTION_FROM_ANSWER_RE);
  return match?.[1]?.trim() ?? "";
}

function extractQuestionCandidate(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) return "";

  const structured = extractQuestionFromAiText(cleaned);
  if (structured) return structured;

  const inline = cleaned.match(EXTRACT_INLINE_QUESTION_RE)?.[1]?.trim();
  if (inline) return inline;

  return (
    cleaned
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.endsWith("?")) ?? ""
  );
}

function normalizeQuestionKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyFollowUpQuestion(question: string): boolean {
  const cleaned = question.trim();
  if (!cleaned) return false;
  if (FOLLOWUP_QUESTION_RE.test(cleaned)) return true;

  const words = normalizeQuestionKey(cleaned).split(" ").filter(Boolean);
  return (
    words.length <= 7 &&
    /\b(it|that|this|they|those|these|same|above|previous)\b/i.test(cleaned)
  );
}

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
  signal?: AbortSignal,
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
    if (signal?.aborted) return;
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
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (signal?.aborted) break;
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
        if (!signal?.aborted) {
          setAiChat((prev) => prev.filter((m) => m.id !== initialMessageId));
        }
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

  if (signal?.aborted) return [];

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
  if (allDropped.size && !signal?.aborted) {
    setAiChat((prev) => prev.filter((m) => !allDropped.has(m.id)));
  }

  return segmentIds.filter((sid) => !allDropped.has(sid));
}

export const useAIChat = () => {
  const [aiChat, setAiChat] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);

  // Stream isolation management
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);

  const aiChatRef = useRef<Message[]>([]);
  const questionHistoryRef = useRef<{ key: string; t: number }[]>([]);

  useEffect(() => {
    aiChatRef.current = aiChat;
  }, [aiChat]);

  // Recent-question dedup: prevents the same exact question from being
  // re-issued within 4 s (e.g. transcript echo, double-click, debounced
  // multi-question splitter firing twice).
  const recentQuestionsRef = useRef<{ q: string; t: number }[]>([]);

  const startNewRequest = useCallback(() => {
    // Abort previous active request
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeRequestIdRef.current = reqId;

    return { controller, reqId };
  }, []);

  const applyQuestionGuardrail = useCallback(
    (
      newMessageIds: string[],
      options: { fallbackQuestion?: string; dedupeWindowMs?: number } = {},
    ) => {
      if (!newMessageIds.length) return;

      const now = Date.now();
      const dedupeWindowMs = options.dedupeWindowMs ?? 45_000;

      setAiChat((prev) => {
        const existingNewIds = new Set(newMessageIds);
        const recentHistory = questionHistoryRef.current.filter(
          (item) => now - item.t < dedupeWindowMs,
        );
        const seenKeys = new Set(recentHistory.map((item) => item.key));
        const batchKeys = new Set<string>();
        const next: Message[] = [];
        const keptHistory: { key: string; t: number }[] = [];

        for (const msg of prev) {
          if (!existingNewIds.has(msg.id)) {
            next.push(msg);
            continue;
          }

          const candidate =
            extractQuestionCandidate(msg.text) ||
            msg.question?.trim() ||
            options.fallbackQuestion?.trim() ||
            "";
          const key = normalizeQuestionKey(candidate);

          if (!key) {
            next.push(msg);
            continue;
          }

          const duplicate = seenKeys.has(key) || batchKeys.has(key);
          if (duplicate && !isLikelyFollowUpQuestion(candidate)) {
            console.log("[useAIChat] Dropped duplicate AI question card:", candidate);
            continue;
          }

          batchKeys.add(key);
          seenKeys.add(key);
          keptHistory.push({ key, t: now });
          next.push({ ...msg, question: msg.question || candidate });
        }

        questionHistoryRef.current = [...recentHistory, ...keptHistory].slice(
          -100,
        );
        return next;
      });
    },
    [],
  );

  const handleAnalyzeScreen = useCallback(
    async (sessionId: string, screenshotBlob: Blob | null, aiModel: string) => {
      if (!screenshotBlob) return;

      const { controller, reqId } = startNewRequest();
      setIsAnalyzing(true);
      setIsAnswering(false);

      const currentUsage = parseInt(localStorage.getItem(`aiUsage_${sessionId}`) || "0", 10);
      localStorage.setItem(`aiUsage_${sessionId}`, (currentUsage + 1).toString());

      const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const baseTime = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const newAiMessage: Message = {
        id: messageId,
        sender: "AI",
        text: "",
        time: baseTime,
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
            signal: controller.signal,
          },
        );

        if (!response.ok) throw new Error(`Analysis failed: ${response.status}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const renderedIds = await consumeSegmentedStream(
          reader,
          messageId,
          setAiChat,
          baseTime,
          controller.signal,
        );

        if (controller.signal.aborted) return;

        // Fallback: if the stream produced no renderable cards, show a helpful message
        setAiChat((prev) => {
          if (renderedIds.length > 0) {
            const allHaveText = renderedIds.every((rid) =>
              prev.find((m) => m.id === rid)?.text?.trim(),
            );
            if (allHaveText) return prev;
          }

          const emptyCardId =
            renderedIds.find((rid) => !prev.find((m) => m.id === rid)?.text?.trim()) ??
            (prev.find((m) => m.id === messageId) ? messageId : null);

          if (!emptyCardId) {
            return [
              ...prev,
              {
                id: messageId,
                sender: "AI" as const,
                text: "I couldn't detect a clear question from the screen. Try capturing again or ask a direct query.",
                time: baseTime,
              },
            ];
          }

          return prev.map((msg) =>
            msg.id === emptyCardId
              ? { ...msg, text: "I couldn't detect a clear question from the screen. Try capturing again or ask a direct query." }
              : msg,
          );
        });
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("[useAIChat] Screen analysis aborted:", reqId);
          return;
        }
        console.error("AI Streaming error (screen analysis):", error);

        if (controller.signal.aborted) return;

        setAiChat((prev) => {
          const exists = prev.find((m) => m.id === messageId);
          if (exists) {
            return prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, text: "Sorry, I encountered an error during analysis. Please try again." }
                : msg,
            );
          }
          return [
            ...prev,
            {
              id: messageId,
              sender: "AI" as const,
              text: "Sorry, I encountered an error during analysis. Please try again.",
              time: baseTime,
            },
          ];
        });
      } finally {
        if (activeRequestIdRef.current === reqId) {
          setIsAnalyzing(false);
          // Clean up completely empty AI response cards to avoid empty UI elements
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        }
      }
    },
    [startNewRequest],
  );

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

      const { controller, reqId } = startNewRequest();
      setIsAnswering(true);
      setIsAnalyzing(false);

      const currentUsage = parseInt(localStorage.getItem(`aiUsage_${sessionId}`) || "0", 10);
      localStorage.setItem(`aiUsage_${sessionId}`, (currentUsage + 1).toString());

      const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const baseTime = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const newAiMessage: Message = {
        id: messageId,
        sender: "AI",
        text: "",
        time: baseTime,
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
            body: JSON.stringify({ transcript: question, aiModel }),
            signal: controller.signal,
          },
        );

        if (!response.ok) throw new Error("AI request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        await consumeSegmentedStream(
          reader,
          messageId,
          setAiChat,
          baseTime,
          controller.signal,
        );

        if (controller.signal.aborted) return;

        setAiChat((prev) => {
          const target = prev.find((msg) => msg.id === messageId);
          if (target?.text?.trim()) return prev;
          return prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  text: "I couldn't generate an answer from the current transcript. Please try regenerate.",
                }
              : msg,
          );
        });
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("[useAIChat] AI Answer aborted:", reqId);
          return;
        }
        console.error("AI Answering error:", error);

        if (controller.signal.aborted) return;

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
        if (activeRequestIdRef.current === reqId) {
          setIsAnswering(false);
          // Clean up completely empty AI response cards
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        }
      }
    },
    [startNewRequest],
  );

  const handleCustomQuery = useCallback(
    async (sessionId: string, query: string, aiModel: string) => {
      if (!query.trim()) return;

      const { controller, reqId } = startNewRequest();
      setIsAnswering(true);
      setIsAnalyzing(false);

      const currentUsage = parseInt(
        localStorage.getItem(`aiUsage_${sessionId}`) || "0",
        10,
      );
      localStorage.setItem(
        `aiUsage_${sessionId}`,
        (currentUsage + 1).toString(),
      );

      const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
        signal: controller.signal,
      }).catch((err) => console.error("Failed to save user query:", err));

      const aiMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newAiMessage: Message = {
        id: aiMessageId,
        sender: "AI",
        text: "",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        question: query,
      };

      setAiChat((prev) => [...prev, newAiMessage]);

      // Build a compact context preamble from the last 3 AI-answered messages
      // so the model can detect follow-ups and build on prior answers.
      const recentAiAnswers = aiChatRef.current
        .filter((m) => m.sender === "AI" && m.text?.trim())
        .slice(-3);
      const contextPreamble =
        recentAiAnswers.length > 0
          ? recentAiAnswers
              .map((m, i) => {
                const q = m.question?.trim() || extractQuestionFromAiText(m.text ?? "");
                const a = m.text?.trim() ?? "";
                return q
                  ? `[Prior answer ${i + 1}]\nQ: ${q}\nA: ${a.slice(0, 400)}${a.length > 400 ? "..." : ""}`
                  : `[Prior answer ${i + 1}]\n${a.slice(0, 400)}${a.length > 400 ? "..." : ""}`;
              })
              .join("\n\n")
          : "";
      const enrichedQuery = contextPreamble
        ? `${contextPreamble}\n\n[New question / follow-up]\n${query}`
        : query;

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ transcript: enrichedQuery, isCustomQuery: true, aiModel }),
            signal: controller.signal,
          },
        );

        if (!response.ok) throw new Error("AI request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let streamedText = "";

        while (true) {
          if (controller.signal.aborted) break;
          const { done, value } = await reader.read();
          if (controller.signal.aborted) break;
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedText += chunk;

          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, text: streamedText } : msg,
            ),
          );
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("[useAIChat] Custom query aborted:", reqId);
          return;
        }
        console.error("AI Custom Query error:", error);

        if (controller.signal.aborted) return;

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
        if (activeRequestIdRef.current === reqId) {
          setIsAnswering(false);
          // Clean up empty cards
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        }
      }
    },
    [startNewRequest],
  );

  const handleRegenerate = useCallback(
    async (sessionId: string, messageId: string, aiModel: string) => {
      const targetMessage = aiChatRef.current.find((m) => m.id === messageId);
      if (!targetMessage) return;

      const extractedQ = extractQuestionFromAiText(targetMessage.text ?? "");
      const question = extractedQ || targetMessage.question?.trim() || "";

      if (!question) return;

      const { controller, reqId } = startNewRequest();
      setIsAnswering(true);
      setIsAnalyzing(false);

      // Clear the existing text so the card streams from scratch in-place.
      setAiChat((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, text: "" } : msg)),
      );

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: question, isRegenerate: true, aiModel }),
            signal: controller.signal,
          },
        );

        if (!response.ok) throw new Error("AI request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let streamedText = "";

        while (true) {
          if (controller.signal.aborted) break;
          const { done, value } = await reader.read();
          if (controller.signal.aborted) break;
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          streamedText += chunk;

          const renderText = streamedText.replace(NO_QUESTION_MARKER, "");
          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, text: renderText } : msg,
            ),
          );
        }

        if (controller.signal.aborted) return;

        const finalCleanText = streamedText.replace(NO_QUESTION_MARKER, "").trim();
        if (!finalCleanText) {
          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, text: "I couldn't regenerate the answer. Please try again." }
                : msg,
            ),
          );
        } else if (finalCleanText !== streamedText) {
          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, text: finalCleanText } : msg,
            ),
          );
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("[useAIChat] Regenerate aborted:", reqId);
          return;
        }
        console.error("AI Regenerate error:", error);

        if (controller.signal.aborted) return;

        setAiChat((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, text: "Sorry, I couldn't regenerate the answer." }
              : msg,
          ),
        );
      } finally {
        if (activeRequestIdRef.current === reqId) {
          setIsAnswering(false);
          // Clean up empty cards
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        }
      }
    },
    [startNewRequest],
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
