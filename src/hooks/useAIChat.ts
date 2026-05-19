import { useState, useCallback, useRef, useEffect } from "react";
import { Message } from "@/pages/Sessions/ActiveSession/Transcript";

const SEGMENT_MARKER = /\n?={3,}NEXT_QUESTION={3,}\n?/;
const QUESTION_MARKER = /(?:\*\*\s*)?QUESTION\s*:/i;
// Backend sentinel: the model returns this single line when the input block
// contains no genuine new interview question. We must not render a card for it.
const NO_QUESTION_MARKER = /={3,}\s*NO_NEW_QUESTION\s*={3,}/i;

// ── Transcript normalization ────────────────────────────────────────────────
// Common speech-to-text substitution errors and their corrections.
// Applied before every AI call to improve prompt quality without an extra AI
// round-trip. Keep entries lowercase; the function lower-cases the input
// before matching and re-joins to original casing logic.
const STT_CORRECTIONS: [RegExp, string][] = [
  [/\btext stack\b/gi, "tech stack"],
  [/\btext stacks\b/gi, "tech stacks"],
  [/\btext sex stack\b/gi, "tech stack"],
  [/\brest full\b/gi, "RESTful"],
  [/\bdata race\b/gi, "data race"],
  [/\bmy sequel\b/gi, "MySQL"],
  [/\bpost gres\b/gi, "Postgres"],
  [/\bpost gress\b/gi, "Postgres"],
  [/\bpost grey s\b/gi, "Postgres"],
  [/\bno sequel\b/gi, "NoSQL"],
  [/\bno sql\b/gi, "NoSQL"],
  [/\bkubernetes\b/gi, "Kubernetes"],
  [/\bcube rnetes\b/gi, "Kubernetes"],
  [/\bjava script\b/gi, "JavaScript"],
  [/\btype script\b/gi, "TypeScript"],
  [/\bnode js\b/gi, "Node.js"],
  [/\breact js\b/gi, "React"],
  [/\bvue js\b/gi, "Vue.js"],
  [/\bai pi\b/gi, "API"],
  [/\ba p i\b/gi, "API"],
  [/\bgit hub\b/gi, "GitHub"],
  [/\bci cd\b/gi, "CI/CD"],
  [/\bdocker file\b/gi, "Dockerfile"],
  [/\bmicro service\b/gi, "microservice"],
  [/\bmicro services\b/gi, "microservices"],
  [/\bopen ai\b/gi, "OpenAI"],
  [/\baws\b/gi, "AWS"],
  [/\bgcp\b/gi, "GCP"],
  [/\bazure\b/gi, "Azure"],
];

/**
 * Normalizes speech-to-text transcript errors before sending to the AI.
 * Corrects common mishearings and technical term misrecognitions.
 */
function normalizeSttTranscript(text: string): string {
  if (!text?.trim()) return text;
  let result = text;
  for (const [pattern, replacement] of STT_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ── Multi-question splitter ─────────────────────────────────────────────────
// Splits a joined transcript into individual interview questions.
// Handles: digit-numbered lists (1. / 1) / 1:), word-numbered lists,
//          and '?'-terminated multi-sentence sequences.
//
// Strategy: split on newline-anchored numbered prefixes first (most reliable),
// then fall back to splitting on '?' sentence boundaries.
function splitMultiQuestions(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // ── Strategy 1: newline-anchored numbered list ──────────────────────────
  // Matches lines that START with: "1." / "1)" / "1:" / "1 ." etc.
  // Uses a plain split on the boundary before the number so we keep the
  // question text without the leading digit.
  const wordNumbers =
    "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|" +
    "thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";
  // Matches a newline followed by optional whitespace then a number/word + delimiter
  const numberedBoundary = new RegExp(
    `\\n\\s*(?:\\d{1,2}|${wordNumbers})\\s*[.):\\-]\\s+`,
    "gi",
  );

  if (numberedBoundary.test(trimmed)) {
    // Reset lastIndex after test()
    numberedBoundary.lastIndex = 0;
    // Split on the boundary, then re-attach stripped number prefix text.
    // We split on the WHOLE boundary (digit + delimiter) so the segment text
    // starts cleanly with the actual question.
    const parts = trimmed
      .split(numberedBoundary)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
    if (parts.length >= 2) return parts;
  }

  // ── Strategy 2: inline numbered list (no newlines) ──────────────────────
  // Handles "1. Question one? 2. Question two?" on a single line.
  const inlineNumbered = new RegExp(
    `(?<![\\d])(?:\\d{1,2}|${wordNumbers})\\s*[.):\\-]\\s+`,
    "gi",
  );
  const inlineMatches = [...trimmed.matchAll(inlineNumbered)];
  if (inlineMatches.length >= 2) {
    const parts: string[] = [];
    let lastEnd = 0;
    for (const match of inlineMatches) {
      const segEnd = match.index!;
      if (segEnd > lastEnd) {
        const seg = trimmed.slice(lastEnd, segEnd).trim();
        if (seg.length > 10) parts.push(seg);
      }
      lastEnd = match.index! + match[0].length;
    }
    // Last segment after the final numbered prefix
    const tail = trimmed.slice(lastEnd).trim();
    if (tail.length > 10) parts.push(tail);
    if (parts.length >= 2) return parts;
  }

  // ── Strategy 3: '?' boundary split ──────────────────────────────────────
  // Split on '?' followed by whitespace or newline. Keep segments that contain
  // a '?' so single statements without '?' don't get treated as questions.
  const questionParts = trimmed
    .split(/\?\s+/)
    .map((s, i, arr) => {
      // Re-append the '?' that was consumed by split (except the last segment
      // which may naturally end with '?' or be empty).
      const withQ = i < arr.length - 1 ? s.trim() + "?" : s.trim();
      return withQ;
    })
    .filter((s) => s.length > 10);

  if (questionParts.length >= 2) return questionParts;

  return [trimmed];
}

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
/**
 * Safely cancel a stream reader. Swallows errors (reader may already be closed).
 */
async function safelyCancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Ignore — reader may already be closed or locked
  }
}

interface ConsumeStreamResult {
  /** IDs of cards that were created and have real content. */
  activeIds: string[];
  /**
   * True when the ONLY thing the backend returned was ===NO_NEW_QUESTION===.
   * Callers should treat this as a clean "nothing to answer" signal rather
   * than an error — no fallback error card should be shown.
   */
  sentinelOnly: boolean;
}

async function consumeSegmentedStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  initialMessageId: string,
  setAiChat: React.Dispatch<React.SetStateAction<Message[]>>,
  baseTime: string,
  signal?: AbortSignal,
): Promise<ConsumeStreamResult> {
  console.log(`[useAIChat] consumeSegmentedStream started for message ID: ${initialMessageId}`);
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
    if (signal?.aborted) {
      console.log(`[useAIChat] consumeSegmentedStream flushToState aborted.`);
      return;
    }
    setAiChat((prev) => {
      const next = [...prev];
      for (let i = 0; i < segmentIds.length; i++) {
        const sid = segmentIds[i];
        // If this segment contains the sentinel at any point during streaming,
        // immediately remove its card so it never flashes on screen.
        if (NO_QUESTION_MARKER.test(segmentTexts[i])) {
          if (!midStreamDropped.has(sid)) {
            console.log(`[useAIChat] NO_NEW_QUESTION sentinel matched in segment index ${i} (ID: ${sid}). Dropping segment.`);
            midStreamDropped.add(sid);
          }
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
          console.log(`[useAIChat] consumeSegmentedStream spawning new card in UI:`, { id: sid, time: baseTime });
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
    if (signal?.aborted) {
      console.log(`[useAIChat] consumeSegmentedStream reader loop: Abort detected.`);
      break;
    }
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await reader.read();
    } catch (readErr: any) {
      // AbortError from reader.cancel() — treat as clean abort
      if (readErr?.name === "AbortError" || signal?.aborted) {
        console.log(`[useAIChat] consumeSegmentedStream: reader.read() threw on abort.`);
      } else {
        console.error(`[useAIChat] consumeSegmentedStream: reader.read() threw unexpectedly:`, readErr);
      }
      break;
    }
    if (signal?.aborted) {
      console.log(`[useAIChat] consumeSegmentedStream reader loop: Abort detected after read.`);
      await safelyCancelReader(reader);
      break;
    }
    const { done, value } = readResult;
    if (done) {
      console.log(`[useAIChat] consumeSegmentedStream reader loop: Stream complete.`);
      break;
    }

    const chunkStr = decoder.decode(value, { stream: true });
    buffer += chunkStr;
    console.log(`[useAIChat] consumeSegmentedStream: Read stream chunk (${value.length} bytes). Buffer length: ${buffer.length} chars.`);

    const parts = buffer.split(SEGMENT_MARKER);

    // Decide preamble status as soon as we see at least one separator
    // (meaning parts[0] is finalised — no more text will be appended to it).
    if (!preambleDecided && parts.length >= 2) {
      preambleDecided = true;
      const first = parts[0].trim();
      if (!QUESTION_MARKER.test(first)) {
        // Preamble. Drop the placeholder card and shift everything by one.
        console.log(`[useAIChat] consumeSegmentedStream: Preamble detected ("${first.slice(0, 100)}..."). Dropping initial placeholder card.`);
        leadingSkip = 1;
        if (!signal?.aborted) {
          setAiChat((prev) => prev.filter((m) => m.id !== initialMessageId));
        }
        // Re-anchor: the first RENDERED card is now parts[1]. Reuse a fresh
        // id so the existing initialMessageId is fully forgotten.
        segmentIds[0] = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        segmentTexts[0] = "";
      } else {
        console.log("[useAIChat] consumeSegmentedStream: No preamble detected. parts[0] starts with QUESTION marker.");
      }
    }

    const renderable = parts.length - leadingSkip;
    if (parts.length > 1) {
      console.log(`[useAIChat] consumeSegmentedStream: Split detected. Parts: ${parts.length}, LeadingSkip: ${leadingSkip}, Renderable segments: ${renderable}`);
    }
    while (segmentIds.length < renderable) {
      const nextId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      console.log(`[useAIChat] consumeSegmentedStream: Creating new segment ID: ${nextId} for segment index ${segmentIds.length}`);
      segmentIds.push(nextId);
      segmentTexts.push("");
    }

    for (let i = 0; i < renderable; i++) {
      segmentTexts[i] = parts[i + leadingSkip].trim();
    }

    flushToState();
  }

  if (signal?.aborted) {
    console.log(`[useAIChat] consumeSegmentedStream: Stream loop finished but aborted flag is active.`);
    await safelyCancelReader(reader);
    return { activeIds: [], sentinelOnly: false };
  }

  // Final flush — also catches the case where the stream ended WITHOUT any
  // separator AND the single segment happened to be preamble-only (rare).
  if (!preambleDecided) {
    console.log(`[useAIChat] consumeSegmentedStream: Stream ended without any segment separators.`);
  }

  flushToState();

  // Final cleanup: ensure any sentinel cards detected mid-stream OR only at
  // the very end (no separators, stream ended) are removed from state.
  const allDropped = new Set<string>(midStreamDropped);
  let sentinelDetected = false;
  for (let i = 0; i < segmentTexts.length; i++) {
    if (NO_QUESTION_MARKER.test(segmentTexts[i])) {
      console.log(`[useAIChat] Final cleanup: NO_NEW_QUESTION sentinel found in final text for ID ${segmentIds[i]}. Dropping.`);
      allDropped.add(segmentIds[i]);
      sentinelDetected = true;
    }
  }
  // Also count mid-stream sentinel drops towards the sentinelDetected flag.
  if (midStreamDropped.size > 0) sentinelDetected = true;

  if (allDropped.size && !signal?.aborted) {
    console.log(`[useAIChat] Final cleanup: Removing ${allDropped.size} dropped cards from UI state.`);
    setAiChat((prev) => prev.filter((m) => !allDropped.has(m.id)));
  }

  const activeIds = segmentIds.filter((sid) => !allDropped.has(sid));
  // sentinelOnly = backend returned ONLY the sentinel and no real answer cards.
  const sentinelOnly = sentinelDetected && activeIds.length === 0;

  console.log(`[useAIChat] consumeSegmentedStream: Completed. Returning ${activeIds.length} active cards. sentinelOnly=${sentinelOnly}`);
  return { activeIds, sentinelOnly };
}

export const useAIChat = () => {
  const [aiChat, setAiChat] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);

  // Stream isolation management
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  // Track all loading-state setters for the current request so we can always
  // reset them even when a new request supersedes the old one.
  const pendingLoadingResetRef = useRef<(() => void) | null>(null);

  const aiChatRef = useRef<Message[]>([]);
  const questionHistoryRef = useRef<{ key: string; t: number }[]>([]);

  useEffect(() => {
    aiChatRef.current = aiChat;
  }, [aiChat]);

  // Recent-question dedup: prevents the same exact question from being
  // re-issued within 4 s (e.g. transcript echo, double-click, debounced
  // multi-question splitter firing twice).
  const recentQuestionsRef = useRef<{ q: string; t: number }[]>([]);

  // Stable ref so handleAiAnswer can call handleAiAnswerSingle without a
  // forward-reference ordering issue (handleAiAnswerSingle is defined after).
  const handleAiAnswerSingleRef = useRef<
    (sessionId: string, question: string, aiModel: string) => Promise<void>
  >(() => Promise.resolve());

  const startNewRequest = useCallback(() => {
    // Abort previous active request and immediately execute its pending loading reset
    // so isAnswering/isAnalyzing never get stuck when a new request fires before
    // the previous one's finally block runs.
    if (activeAbortControllerRef.current) {
      console.log(`[useAIChat] startNewRequest: Aborting active request ID: ${activeRequestIdRef.current}`);
      activeAbortControllerRef.current.abort();
    }
    if (pendingLoadingResetRef.current) {
      pendingLoadingResetRef.current();
      pendingLoadingResetRef.current = null;
    }

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeRequestIdRef.current = reqId;

    console.log(`[useAIChat] startNewRequest: Initialized new request ID: ${reqId}`);
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
      console.log(`[useAIChat] handleAnalyzeScreen triggered. sessionId: ${sessionId}, model: ${aiModel}`);
      if (!screenshotBlob) {
        console.log("[useAIChat] handleAnalyzeScreen: No screenshot blob provided. Aborting.");
        return;
      }

      const { controller, reqId } = startNewRequest();
      console.log(`[useAIChat] handleAnalyzeScreen: Assigned request ID: ${reqId}`);
      setIsAnalyzing(true);
      setIsAnswering(false);
      // Register loading reset so startNewRequest can fire it if superseded
      pendingLoadingResetRef.current = () => setIsAnalyzing(false);

      const currentUsage = parseInt(localStorage.getItem(`aiUsage_${sessionId}`) || "0", 10);
      localStorage.setItem(`aiUsage_${sessionId}`, (currentUsage + 1).toString());
      console.log(`[useAIChat] handleAnalyzeScreen: Incremented local aiUsage to ${currentUsage + 1}`);

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

      console.log(`[useAIChat] handleAnalyzeScreen: Spawning temporary card messageId: ${messageId}`);
      setAiChat((prev) => [...prev, newAiMessage]);

      try {
        const formData = new FormData();
        formData.append("screenshot", screenshotBlob, "screenshot.jpg");
        if (aiModel) {
          formData.append("aiModel", aiModel);
        }

        const targetUrl = `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/analyze-screen`;
        console.log(`[useAIChat] handleAnalyzeScreen: Dispatching POST to ${targetUrl}`);
        const response = await fetch(
          targetUrl,
          {
            method: "POST",
            body: formData,
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          console.error(`[useAIChat] handleAnalyzeScreen: Server returned status ${response.status}`);
          throw new Error(`Analysis failed: ${response.status}`);
        }

        console.log("[useAIChat] handleAnalyzeScreen: Server responded OK. Obtaining stream reader.");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        console.log("[useAIChat] handleAnalyzeScreen: Commencing consumeSegmentedStream.");
        const { activeIds: renderedIds, sentinelOnly: analyzeSentinel } = await consumeSegmentedStream(
          reader,
          messageId,
          setAiChat,
          baseTime,
          controller.signal,
        );

        if (analyzeSentinel) {
          // Screen had no detectable interview question — remove placeholder silently.
          console.log(`[useAIChat] handleAnalyzeScreen: Sentinel-only response. Removing placeholder card ${messageId}.`);
          setAiChat((prev) => prev.filter((m) => m.id !== messageId));
          return;
        }

        if (controller.signal.aborted) {
          console.log(`[useAIChat] handleAnalyzeScreen: Signal aborted during stream consumption for request: ${reqId}`);
          return;
        }

        console.log("[useAIChat] handleAnalyzeScreen: Stream consumption completed. Rendered IDs:", renderedIds);

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

          console.log(`[useAIChat] handleAnalyzeScreen: Stream ended with no content/unrendered cards. Showing fallback text on card ID: ${emptyCardId}`);
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
        console.error("[useAIChat] AI Streaming error (screen analysis):", error);

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
        // Always clean up — both for the active request and superseded ones.
        // The pendingLoadingResetRef guard prevents double-reset if startNewRequest
        // already fired the reset before this finally runs.
        if (activeRequestIdRef.current === reqId) {
          console.log(`[useAIChat] handleAnalyzeScreen: finally block for request ID: ${reqId}. Resetting isAnalyzing.`);
          pendingLoadingResetRef.current = null;
          setIsAnalyzing(false);
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        } else {
          console.log(`[useAIChat] handleAnalyzeScreen: request ID mismatch in finally block (already superseded). Active: ${activeRequestIdRef.current}, Current: ${reqId}`);
          // Loading was already reset by startNewRequest — just clean empty cards.
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        }
      }
    },
    [startNewRequest],
  );

  const handleAiAnswer = useCallback(
    async (sessionId: string, question: string, aiModel: string) => {
      // Normalize STT transcript errors before anything else
      const normalizedQuestion = normalizeSttTranscript(question);
      console.log(`[useAIChat] handleAiAnswer triggered. sessionId: ${sessionId}, question: "${normalizedQuestion.slice(0, 100)}...", model: ${aiModel}`);
      if (!normalizedQuestion.trim()) {
        console.log("[useAIChat] handleAiAnswer: Question is empty. Aborting.");
        return;
      }

      // Same-question dedup window (4 s).
      const now = Date.now();
      const dedupeKey = normalizedQuestion.trim().toLowerCase();
      const recent = recentQuestionsRef.current.filter((r) => now - r.t < 4000);
      if (recent.some((r) => r.q === dedupeKey)) {
        console.log("[useAIChat] handleAiAnswer: Suppressed duplicate question (within 4s dedup window):", normalizedQuestion.slice(0, 60));
        return;
      }
      recentQuestionsRef.current = [...recent, { q: dedupeKey, t: now }].slice(-10);

      // Multi-question detection: log how many questions were found, then send
      // the FULL normalized transcript to handleAiAnswerSingle as one call.
      // The backend processes all questions in one AI request and returns each
      // answer separated by ===NEXT_QUESTION===. consumeSegmentedStream then
      // creates one answer card per question automatically.
      // We do NOT fire multiple separate calls because each call to
      // startNewRequest() aborts the previous stream — the first question
      // would always get cancelled before completing.
      const parts = splitMultiQuestions(normalizedQuestion);
      if (parts.length > 1) {
        console.log(`[useAIChat] handleAiAnswer: Multi-question detected (${parts.length} parts). Sending as single request — backend will segment answers.`);
      }

      await handleAiAnswerSingleRef.current(sessionId, normalizedQuestion, aiModel);
    },
    [startNewRequest],
  );

  // Inner single-question implementation — called by handleAiAnswer via ref after splitting.
  const handleAiAnswerSingle = useCallback(
    async (sessionId: string, question: string, aiModel: string) => {
      if (!question.trim()) return;

      const { controller, reqId } = startNewRequest();
      console.log(`[useAIChat] handleAiAnswerSingle: Assigned request ID: ${reqId}`);
      setIsAnswering(true);
      setIsAnalyzing(false);
      pendingLoadingResetRef.current = () => setIsAnswering(false);

      const currentUsage = parseInt(localStorage.getItem(`aiUsage_${sessionId}`) || "0", 10);
      localStorage.setItem(`aiUsage_${sessionId}`, (currentUsage + 1).toString());
      console.log(`[useAIChat] handleAiAnswer: Incremented local aiUsage to ${currentUsage + 1}`);

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

      console.log(`[useAIChat] handleAiAnswer: Spawning temporary card messageId: ${messageId}`);
      setAiChat((prev) => [...prev, newAiMessage]);

      try {
        const targetUrl = `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`;
        console.log(`[useAIChat] handleAiAnswer: Dispatching POST to ${targetUrl} with body:`, { transcript: question, aiModel });
        const response = await fetch(
          targetUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ transcript: question, aiModel }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          console.error(`[useAIChat] handleAiAnswer: Server returned status ${response.status}`);
          throw new Error("AI request failed");
        }

        console.log("[useAIChat] handleAiAnswer: Server responded OK. Obtaining stream reader.");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        console.log("[useAIChat] handleAiAnswer: Commencing consumeSegmentedStream.");
        const { sentinelOnly } = await consumeSegmentedStream(
          reader,
          messageId,
          setAiChat,
          baseTime,
          controller.signal,
        );

        if (controller.signal.aborted) {
          console.log(`[useAIChat] handleAiAnswer: Signal aborted during stream consumption for request: ${reqId}`);
          return;
        }

        console.log("[useAIChat] handleAiAnswer: Stream consumption completed. sentinelOnly:", sentinelOnly);

        if (sentinelOnly) {
          // Backend cleanly said there was no interview question in the input.
          // Remove the temporary placeholder card silently — no error message.
          console.log(`[useAIChat] handleAiAnswer: Sentinel-only response. Removing placeholder card ${messageId}.`);
          setAiChat((prev) => prev.filter((m) => m.id !== messageId));
          return;
        }

        // Genuine empty response (model returned nothing useful) — show fallback.
        setAiChat((prev) => {
          const target = prev.find((msg) => msg.id === messageId);
          if (target?.text?.trim()) return prev;
          console.log(`[useAIChat] handleAiAnswer: Stream finished but card ID: ${messageId} is empty. Showing fallback.`);
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
        console.error("[useAIChat] AI Answering error:", error);

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
          console.log(`[useAIChat] handleAiAnswerSingle: finally block for request ID: ${reqId}. Resetting isAnswering.`);
          pendingLoadingResetRef.current = null;
          setIsAnswering(false);
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        } else {
          console.log(`[useAIChat] handleAiAnswerSingle: request ID mismatch (already superseded). Active: ${activeRequestIdRef.current}, Current: ${reqId}`);
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        }
      }
    },
    [startNewRequest],
  );
  // Keep the ref in sync so handleAiAnswer always calls the latest callback.
  handleAiAnswerSingleRef.current = handleAiAnswerSingle;

  const handleCustomQuery = useCallback(
    async (sessionId: string, query: string, aiModel: string) => {
      const normalizedQuery = normalizeSttTranscript(query);
      console.log(`[useAIChat] handleCustomQuery triggered. sessionId: ${sessionId}, query: "${normalizedQuery}", model: ${aiModel}`);
      if (!normalizedQuery.trim()) {
        console.log("[useAIChat] handleCustomQuery: Query is empty. Aborting.");
        return;
      }

      const { controller, reqId } = startNewRequest();
      console.log(`[useAIChat] handleCustomQuery: Assigned request ID: ${reqId}`);
      setIsAnswering(true);
      setIsAnalyzing(false);
      pendingLoadingResetRef.current = () => setIsAnswering(false);

      const currentUsage = parseInt(
        localStorage.getItem(`aiUsage_${sessionId}`) || "0",
        10,
      );
      localStorage.setItem(
        `aiUsage_${sessionId}`,
        (currentUsage + 1).toString(),
      );
      console.log(`[useAIChat] handleCustomQuery: Incremented local aiUsage to ${currentUsage + 1}`);

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

      console.log(`[useAIChat] handleCustomQuery: Spawning user message card in chat ID: ${messageId}-user`);
      setAiChat((prev) => [...prev, userMessage]);
      setInputMessage("");

      // Save user query to backend history
      const saveMessageUrl = `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/save-message`;
      console.log(`[useAIChat] handleCustomQuery: Saving user message to backend via POST to ${saveMessageUrl}`);
      fetch(saveMessageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "USER",
          question: query,
          answer: "",
          time: userMessage.time,
        }),
        signal: controller.signal,
      })
        .then(() => console.log("[useAIChat] handleCustomQuery: Successfully saved user message to backend history."))
        .catch((err) => console.error("[useAIChat] Failed to save user query to backend:", err));

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

      console.log(`[useAIChat] handleCustomQuery: Spawning temporary AI card messageId: ${aiMessageId}`);
      setAiChat((prev) => [...prev, newAiMessage]);

      // Build a context preamble from the last 5 AI-answered messages in the current
      // UI session (aiChatRef). This is the authoritative in-memory follow-up context
      // — the backend also injects DB history, so together they form a full picture.
      const recentAiAnswers = aiChatRef.current
         .filter((m) => m.sender === "AI" && m.text?.trim())
         .slice(-5);
      const contextPreamble =
        recentAiAnswers.length > 0
          ? recentAiAnswers
              .map((m, i) => {
                const q = m.question?.trim() || extractQuestionFromAiText(m.text ?? "");
                const a = m.text?.trim() ?? "";
                return q
                  ? `[Prior answer ${i + 1}]\nQ: ${q}\nA: ${a.slice(0, 500)}${a.length > 500 ? "..." : ""}`
                  : `[Prior answer ${i + 1}]\n${a.slice(0, 500)}${a.length > 500 ? "..." : ""}`;
              })
              .join("\n\n")
          : "";
      const enrichedQuery = contextPreamble
        ? `${contextPreamble}\n\n[New question / follow-up]\n${normalizedQuery}`
        : normalizedQuery;

      console.log("[useAIChat] handleCustomQuery: Context preamble built. Enriched query content:", enrichedQuery);

      try {
        const targetUrl = `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`;
        console.log(`[useAIChat] handleCustomQuery: Dispatching POST to ${targetUrl} for streaming custom answer.`);
        const response = await fetch(
          targetUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ transcript: enrichedQuery, isCustomQuery: true, aiModel }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          console.error(`[useAIChat] handleCustomQuery: Server returned status ${response.status}`);
          throw new Error("AI request failed");
        }

        console.log("[useAIChat] handleCustomQuery: Server responded OK. Obtaining stream reader.");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let streamedText = "";

        console.log("[useAIChat] handleCustomQuery: Starting stream read loop.");
        try {
          while (true) {
            if (controller.signal.aborted) {
              console.log(`[useAIChat] handleCustomQuery: Signal aborted during stream read for request: ${reqId}`);
              await safelyCancelReader(reader);
              break;
            }
            let readResult: ReadableStreamReadResult<Uint8Array>;
            try {
              readResult = await reader.read();
            } catch (readErr: any) {
              if (readErr?.name === "AbortError" || controller.signal.aborted) break;
              throw readErr;
            }
            if (controller.signal.aborted) {
              await safelyCancelReader(reader);
              break;
            }
            const { done, value } = readResult;
            if (done) {
              console.log("[useAIChat] handleCustomQuery: Stream read finished.");
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            streamedText += chunk;

            setAiChat((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId ? { ...msg, text: streamedText } : msg,
              ),
            );
          }
        } finally {
          await safelyCancelReader(reader);
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("[useAIChat] Custom query aborted:", reqId);
          return;
        }
        console.error("[useAIChat] AI Custom Query error:", error);

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
          console.log(`[useAIChat] handleCustomQuery: finally block for request ID: ${reqId}. Resetting isAnswering.`);
          pendingLoadingResetRef.current = null;
          setIsAnswering(false);
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        } else {
          console.log(`[useAIChat] handleCustomQuery: request ID mismatch (already superseded). Active: ${activeRequestIdRef.current}, Current: ${reqId}`);
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        }
      }
    },
    [startNewRequest],
  );

  const handleRegenerate = useCallback(
    async (sessionId: string, messageId: string, aiModel: string) => {
      console.log(`[useAIChat] handleRegenerate triggered. sessionId: ${sessionId}, messageId: ${messageId}, model: ${aiModel}`);
      const targetMessage = aiChatRef.current.find((m) => m.id === messageId);
      if (!targetMessage) {
        console.warn(`[useAIChat] handleRegenerate: Message ID ${messageId} not found in current chat list. Aborting.`);
        return;
      }

      const extractedQ = extractQuestionFromAiText(targetMessage.text ?? "");
      const question = extractedQ || targetMessage.question?.trim() || "";

      console.log(`[useAIChat] handleRegenerate: Extracted question for regeneration: "${question}"`);
      if (!question) {
        console.warn("[useAIChat] handleRegenerate: No question could be resolved for this message. Aborting.");
        return;
      }

      const { controller, reqId } = startNewRequest();
      console.log(`[useAIChat] handleRegenerate: Assigned request ID: ${reqId}`);
      setIsAnswering(true);
      setIsAnalyzing(false);

      // Clear the existing text so the card streams from scratch in-place.
      console.log(`[useAIChat] handleRegenerate: Clearing text for messageId: ${messageId} to prepare for fresh stream.`);
      setAiChat((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, text: "" } : msg)),
      );

      try {
        const targetUrl = `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/ai-answer`;
        console.log(`[useAIChat] handleRegenerate: Dispatching POST to ${targetUrl} with body:`, { transcript: question, isRegenerate: true, aiModel });
        const response = await fetch(
          targetUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: question, isRegenerate: true, aiModel }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          console.error(`[useAIChat] handleRegenerate: Server returned status ${response.status}`);
          throw new Error("AI request failed");
        }

        console.log("[useAIChat] handleRegenerate: Server responded OK. Obtaining stream reader.");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let streamedText = "";

        console.log("[useAIChat] handleRegenerate: Starting stream read loop.");
        try {
          while (true) {
            if (controller.signal.aborted) {
              console.log(`[useAIChat] handleRegenerate: Signal aborted during stream read for request: ${reqId}`);
              await safelyCancelReader(reader);
              break;
            }
            let readResult: ReadableStreamReadResult<Uint8Array>;
            try {
              readResult = await reader.read();
            } catch (readErr: any) {
              if (readErr?.name === "AbortError" || controller.signal.aborted) break;
              throw readErr;
            }
            if (controller.signal.aborted) {
              await safelyCancelReader(reader);
              break;
            }
            const { done, value } = readResult;
            if (done) {
              console.log("[useAIChat] handleRegenerate: Stream read finished.");
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            streamedText += chunk;

            const renderText = streamedText.replace(NO_QUESTION_MARKER, "");
            setAiChat((prev) =>
              prev.map((msg) =>
                msg.id === messageId ? { ...msg, text: renderText } : msg,
              ),
            );
          }
        } finally {
          await safelyCancelReader(reader);
        }

        if (controller.signal.aborted) return;

        const finalCleanText = streamedText.replace(NO_QUESTION_MARKER, "").trim();
        if (!finalCleanText) {
          console.log("[useAIChat] handleRegenerate: Stream ended empty. Showing failure message.");
          setAiChat((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, text: "I couldn't regenerate the answer. Please try again." }
                : msg,
            ),
          );
        } else if (finalCleanText !== streamedText) {
          console.log("[useAIChat] handleRegenerate: Applying final clean text without sentinels.");
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
        console.error("[useAIChat] AI Regenerate error:", error);

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
          console.log(`[useAIChat] handleRegenerate: finally block for request ID: ${reqId}. Resetting isAnswering.`);
          pendingLoadingResetRef.current = null;
          setIsAnswering(false);
          setAiChat((prev) => prev.filter((m) => m.sender !== "AI" || m.text.trim() !== ""));
        } else {
          console.log(`[useAIChat] handleRegenerate: request ID mismatch (already superseded). Active: ${activeRequestIdRef.current}, Current: ${reqId}`);
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
    normalizeSttTranscript,
  };
};
