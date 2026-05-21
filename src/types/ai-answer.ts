export type AIAnswerSpeakerType =
  | "interviewer"
  | "candidate"
  | "assistant"
  | "system";

export interface AIAnswerSpeakerEntry {
  speakerType: AIAnswerSpeakerType;
  content: string;
  timestamp?: number;
}

export interface AIAnswerRequestPayload {
  transcript: string;
  currentQuestion?: string;
  patchedTranscript?: string;
  recentTranscriptWindow?: string[];
  speakerSeparatedTranscript?: AIAnswerSpeakerEntry[];
  previousAiAnswer?: string;
  previousCodeBlocks?: string[];
  answerMode?:
    | "auto"
    | "theory_only"
    | "minimal_code"
    | "code_required"
    | "explain_existing_code"
    | "system_design";
  sourcePlatform?: "web" | "tauri";
}

export const AI_ANSWER_LIMITS = {
  recentTranscriptWindowMax: 15,
  previousAiAnswerMaxChars: 1000,
  previousCodeBlocksMax: 2,
  previousCodeBlockMaxChars: 1500,
} as const;

export function normalizeSpeakerType(input: string): AIAnswerSpeakerType {
  const key = (input || "").toLowerCase().trim();
  if (key === "interviewer") return "interviewer";
  if (key === "candidate" || key === "user") return "candidate";
  if (key === "assistant" || key === "ai") return "assistant";
  return "system";
}

export function extractCodeBlocks(text: string): string[] {
  if (!text?.trim()) return [];
  const matches = text.match(/```[\s\S]*?```/g) || [];
  return matches;
}

export function sanitizeAIAnswerPayload(
  payload: AIAnswerRequestPayload,
): AIAnswerRequestPayload {
  const transcript = (payload.transcript || "").trim();
  const currentQuestion = payload.currentQuestion?.trim() || undefined;
  const patchedTranscript = payload.patchedTranscript?.trim() || undefined;
  const previousAiAnswer = payload.previousAiAnswer
    ? payload.previousAiAnswer.slice(0, AI_ANSWER_LIMITS.previousAiAnswerMaxChars)
    : undefined;
  const previousCodeBlocks = (payload.previousCodeBlocks || [])
    .slice(0, AI_ANSWER_LIMITS.previousCodeBlocksMax)
    .map((block) => block.slice(0, AI_ANSWER_LIMITS.previousCodeBlockMaxChars))
    .filter((block) => block.trim().length > 0);
  const recentTranscriptWindow = (payload.recentTranscriptWindow || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(-AI_ANSWER_LIMITS.recentTranscriptWindowMax);
  const speakerSeparatedTranscript = (payload.speakerSeparatedTranscript || [])
    .map((entry) => ({
      speakerType: normalizeSpeakerType(entry.speakerType),
      content: (entry.content || "").trim(),
      ...(typeof entry.timestamp === "number" ? { timestamp: entry.timestamp } : {}),
    }))
    .filter((entry) => entry.content.length > 0)
    .slice(-AI_ANSWER_LIMITS.recentTranscriptWindowMax);

  return {
    transcript,
    ...(currentQuestion ? { currentQuestion } : {}),
    ...(patchedTranscript ? { patchedTranscript } : {}),
    ...(recentTranscriptWindow.length > 0 ? { recentTranscriptWindow } : {}),
    ...(speakerSeparatedTranscript.length > 0
      ? { speakerSeparatedTranscript }
      : {}),
    ...(previousAiAnswer ? { previousAiAnswer } : {}),
    ...(previousCodeBlocks.length > 0 ? { previousCodeBlocks } : {}),
    ...(payload.answerMode ? { answerMode: payload.answerMode } : {}),
    ...(payload.sourcePlatform ? { sourcePlatform: payload.sourcePlatform } : {}),
  };
}

export function resolveQueryFromAIAnswerPayload(
  payload: AIAnswerRequestPayload,
): string {
  return (
    payload.patchedTranscript?.trim() ||
    payload.currentQuestion?.trim() ||
    payload.transcript.trim()
  );
}
