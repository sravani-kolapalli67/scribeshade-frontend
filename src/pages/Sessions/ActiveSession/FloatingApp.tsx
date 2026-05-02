import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Send,
  Copy,
  Check,
  Mic,
  MicOff,
  Trash2,
  Clock,
  GripHorizontal,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Star,
  LogOut,
  Loader2,
  AlignJustify,
} from "lucide-react";
import { ChatActionButtons } from "./components/ChatActionButtons";
import { ModelSelector } from "./components/ModelSelector";
import { useFreeSessionTimer } from "@/hooks/useFreeSessionTimer";
import { useDeepgram } from "@/hooks/useDeepgram";
import { useNativeTabTranscription } from "@/hooks/useNativeTabTranscription";
import { useAIChat } from "@/hooks/useAIChat";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import "@/App.css";
import { toast, Toaster } from "sonner";

const KEYWORD_CONFIGS = [
  { color: "text-blue-400" },
  { color: "text-purple-400" },
  { color: "text-emerald-400" },
  { color: "text-orange-400" },
  { color: "text-rose-400" },
  { color: "text-indigo-400" },
];

const getKeywordConfig = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return KEYWORD_CONFIGS[Math.abs(hash) % KEYWORD_CONFIGS.length];
};

// â”€â”€â”€ Types
interface SessionInitData {
  sessionId: string;
  isFree: boolean;
  aiModel: string;
  language: string;
  companyName: string;
  startedAt: string | null;
  maxAllowedMinutes: number | null;
}

interface TranscriptMessage {
  id: string;
  sender: "User" | "Interviewer";
  text: string;
  timestamp: number;
}

interface AIDisplayResponse {
  text: string;
  isStreaming: boolean;
  messageId: string;
}

const getLanguageCode = (lang: string): string => {
  const mapping: Record<string, string> = {
    English: "en",
    Spanish: "es",
    French: "fr",
    German: "de",
    Hindi: "hi",
    Arabic: "ar",
    Chinese: "zh",
    Portuguese: "pt",
    Japanese: "ja",
  };
  return mapping[lang] || "en";
};

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

//  CodeBlock (for markdown rendering)
const CodeBlock = ({
  children,
  language,
}: {
  children: any;
  language?: string;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text =
      children?.[0]?.props?.children ||
      children?.props?.children ||
      String(children);
    const finalContent = Array.isArray(text) ? text.join("") : text;
    if (typeof finalContent === "string") {
      navigator.clipboard.writeText(finalContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const codeString =
    children?.[0]?.props?.children ||
    children?.props?.children ||
    String(children);
  const finalCode = Array.isArray(codeString)
    ? codeString.join("")
    : String(codeString);

  return (
    <div className="rounded-xl overflow-hidden mb-4 border bg-[#313030] border-white/10 shadow-lg">
      <div className="px-3 py-1.5 flex items-center justify-between border-b bg-white/5 border-white/10">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
            {language || "Code"}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
        >
          {copied ? (
            <>
              <Check className="h-2.5 w-2.5 text-emerald-400" />
              <span>COPIED</span>
            </>
          ) : (
            <>
              <Copy className="h-2.5 w-2.5" />
              <span>COPY</span>
            </>
          )}
        </button>
      </div>
      <div className="p-0 m-0 text-[12px] font-mono leading-relaxed overflow-hidden">
        <SyntaxHighlighter
          language={language?.toLowerCase() || "javascript"}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: "1rem",
            background: "transparent",
            fontSize: "12px",
            lineHeight: "1.6",
          }}
          codeTagProps={{
            style: {
              fontFamily: "inherit",
            },
          }}
        >
          {finalCode.replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

// Response Parser 
// Splits an AI response into optional question + answer sections so we can
// render them with ParakeetAI-style iconic headers.
interface ParsedSection {
  question?: string;
  answer: string;
}

const parseAIResponse = (raw: string): ParsedSection => {
  if (!raw) return { answer: "" };
  const text = raw.trim();

  // Match patterns like:
  //   Summarized question: ...\nAnswer: ...
  //   Question: ...\nAnswer: ...
  //   QUESTION: ...\nANSWER: ...
  const re =
    /^\s*(?:\*\*)?(?:summarized\s+question|question)(?:\*\*)?\s*[:\-]\s*([\s\S]*?)\n+\s*(?:\*\*)?answer(?:\*\*)?\s*[:\-]\s*([\s\S]*)$/i;
  const m = text.match(re);
  if (m) {
    return { question: m[1].trim(), answer: m[2].trim() };
  }

  // Answer-only marker
  const ansOnly = text.match(
    /^\s*(?:\*\*)?answer(?:\*\*)?\s*[:\-]\s*([\s\S]*)$/i,
  );
  if (ansOnly) return { answer: ansOnly[1].trim() };

  return { answer: text };
};

// Answer Area
const AnswerArea: React.FC<{
  responses: AIDisplayResponse[];
  isStreaming: boolean;
}> = ({ responses, isStreaming }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [responses]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 scroll-smooth no-scrollbar"
    >
      {responses.map((resp) => {
        const parsed = parseAIResponse(resp.text);
        return (
          <div
            key={resp.messageId}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            {/* Summarized Question Header */}
            {parsed.question && (
              <div className="flex items-start gap-2 mb-3 text-[13.5px] leading-relaxed text-white">
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-white/60" />
                <div className="flex-1 wrap-break-word">
                  <span className="font-bold">Question:</span>{" "}
                  <span className="font-medium text-white/90">
                    {parsed.question}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 fill-amber-400/20 text-amber-400 shrink-0" />
              <span className="text-[13.5px] font-bold text-white">
                Answer:
              </span>
            </div>

            {/* Markdown Content */}
            <div
              className={[
                "text-[13px] leading-relaxed font-medium text-white wrap-break-word",
                "[&_p]:mb-3 [&_p:last-child]:mb-0",
                "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1",
                "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1",
                "[&_li]:mb-0 [&_li]:marker:text-white/60",
                "[&_em]:text-amber-200 [&_em]:not-italic [&_em]:font-semibold",
                "[&_a]:text-blue-300 [&_a]:underline",
                "[&_blockquote]:border-l-2 [&_blockquote]:border-blue-400/50 [&_blockquote]:pl-3 [&_blockquote]:text-white/80 [&_blockquote]:italic",
                "[&_table]:w-full [&_table]:my-3 [&_table]:text-[12px] [&_table]:border-collapse",
                "[&_th]:border [&_th]:border-white/10 [&_th]:bg-white/5 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-bold",
                "[&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1",
              ].join(" ")}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-base font-bold mb-2 mt-2 text-white">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-bold mb-2 mt-2 text-white/90">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold mb-1 mt-1 text-white/80">
                      {children}
                    </h3>
                  ),
                  strong: ({ children }) => {
                    const text = String(children);
                    const config = getKeywordConfig(text);
                    return (
                      <strong
                        className={cn(
                          "font-bold transition-colors",
                          config.color,
                        )}
                      >
                        {children}
                      </strong>
                    );
                  },
                  pre: ({ children }) => {
                    const codeElement = children as any;
                    const language =
                      codeElement?.props?.className?.replace("language-", "") ||
                      "";
                    return (
                      <CodeBlock language={language}>{children}</CodeBlock>
                    );
                  },
                  code: ({ node, inline, children, ...props }: any) => {
                    if (inline) {
                      return (
                        <code className="px-1.5 py-0.5 rounded text-[12px] font-mono font-medium bg-white/10 text-blue-200 mx-0.5">
                          {children}
                        </code>
                      );
                    }
                    return <code {...props}>{children}</code>;
                  },
                }}
              >
                {parsed.answer}
              </ReactMarkdown>
              {resp.isStreaming && (
                <span className="ml-1 inline-block h-3.5 w-0.5 bg-blue-400 animate-pulse" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// â”€â”€â”€ Main FloatingApp 
const FloatingApp: React.FC = () => {
  // â”€â”€ Session context (received from launcher via "session-init" event) â”€â”€â”€
  const [sessionInfo, setSessionInfo] = useState<SessionInitData | null>(() => {
    try {
      const stored = sessionStorage.getItem("scribeshade.session-init");
      return stored ? (JSON.parse(stored) as SessionInitData) : null;
    } catch {
      return null;
    }
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    try {
      const stored = sessionStorage.getItem("scribeshade.session-init");
      if (stored) {
        const info = JSON.parse(stored) as SessionInitData;
        return info.aiModel || "google/gemma-4-26b-a4b-it";
      }
    } catch {}
    return "google/gemma-4-26b-a4b-it";
  });

  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isEnding, setIsEnding] = useState(false);
  const [isWindowCollapsed, setIsWindowCollapsed] = useState(false);
  const [isResponsesExpanded, setIsResponsesExpanded] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [currentResponseIndex, setCurrentResponseIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [creditWarning, setCreditWarning] = useState<number | null>(null);
  // Controls whether remote (interviewer/tab) audio transcription is active
  const [isTabEnabled, setIsTabEnabled] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const lastSentHeightRef = useRef<number>(185);
  const heightDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEmittingRef = useRef(false);

  // â”€â”€ Stable refs so event-listeners never stale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const sessionInfoRef = useRef<SessionInitData | null>(null);
  const messagesRef = useRef<TranscriptMessage[]>([]);
  const selectedModelRef = useRef(selectedModel);

  sessionInfoRef.current = sessionInfo;
  messagesRef.current = messages;
  selectedModelRef.current = selectedModel;

  // â”€â”€ AI Chat (direct backend calls) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const {
    aiChat,
    isAnalyzing,
    isAnswering,
    handleAiAnswer,
    handleAnalyzeScreen,
    handleCustomQuery,
  } = useAIChat();

  // AI messages are always sender="AI" in aiChat
  const aiResponses = aiChat;

  const endSessionNow = useCallback(async () => {
    if (isEnding) return;
    setIsEnding(true);
    const info = sessionInfoRef.current;
    if (!info) {
      await getCurrentWindow().close();
      return;
    }
    try {
      const transcript = messagesRef.current
        .map((m) => `[${m.sender}]: ${m.text}`)
        .join("\n");
      const aiUsage = parseInt(
        localStorage.getItem(`aiUsage_${info.sessionId}`) || "0",
      );

      // Calculate elapsed minutes so the backend can apply the free-zone rule
      const FREE_ZONE_MINUTES = 5;
      const durationMinutes = info.startedAt
        ? Math.ceil((Date.now() - new Date(info.startedAt).getTime()) / 60_000)
        : null;

      // Parallelize cleanup operations: call backend, reset Rust state, and notify main window
      await Promise.all([
        fetch(`${BACKEND_URL}/api/session/${info.sessionId}/deactivate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, aiUsage, durationMinutes }),
        }).catch((err) => console.error("Deactivate fetch failed:", err)),
        invoke("set_session_active", { active: false }).catch(() => {}),
        emit("overlay-end-session-direct").catch(() => {}),
      ]);

      localStorage.removeItem(`aiUsage_${info.sessionId}`);
      try { sessionStorage.removeItem("scribeshade.session-init"); } catch {}

      // Show free-zone toast if applicable (mini window ends quickly)
      if (durationMinutes !== null && durationMinutes <= FREE_ZONE_MINUTES) {
        toast.success("Session ended — no credits charged (under 5 min)");
      }
    } catch (err) {
      console.error("Error ending session:", err);
    } finally {
      await getCurrentWindow().close();
    }
  }, [isEnding]);

  const endSessionNowRef = useRef(endSessionNow);
  endSessionNowRef.current = endSessionNow;

  const onTimeUp = useCallback(() => {
    toast.info("Free session time is up!");
    endSessionNowRef.current();
  }, []);

  const { formattedTime } = useFreeSessionTimer({
    sessionId: sessionInfo?.sessionId,
    onTimeUp,
    maxAllowedMinutes: sessionInfo?.maxAllowedMinutes ?? null,
  });

  // â”€â”€ Credit callbacks (stable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleExhausted = useCallback(() => {
    toast.error("Session ended â€” credits exhausted.", { duration: 6000 });
    endSessionNowRef.current();
  }, []);

  const handleCreditWarning = useCallback((remaining: number) => {
    setCreditWarning(remaining);
    toast.warning(
      `Only ${remaining} minute${remaining === 1 ? "" : "s"} of credit remaining!`,
      { duration: 8000 },
    );
  }, []);

  // â”€â”€ Heartbeat (paid sessions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useSessionHeartbeat({
    sessionId: sessionInfo?.sessionId,
    enabled: !!(sessionInfo && !sessionInfo.isFree && sessionInfo.startedAt),
    startedAt: sessionInfo?.startedAt ?? null,
    onExhausted: handleExhausted,
    onWarning: handleCreditWarning,
  });

  // â”€â”€ SSE events (paid sessions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useSessionEvents({
    sessionId: sessionInfo?.sessionId,
    enabled: !!(sessionInfo && !sessionInfo.isFree && sessionInfo.startedAt),
    onExhausted: handleExhausted,
    onWarning: handleCreditWarning,
  });

  // â”€â”€ Stable transcript callbacks (use refs so Deepgram WS never stales) â”€â”€
  const handleUserTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      if (!isFinal || !text.trim()) return;
      const sid = sessionInfoRef.current?.sessionId;
      setMessages((prev) => {
        const now = Date.now();
        const normalized = text.toLowerCase().trim().replace(/[.!?]/g, "");
        const isDupe = prev.some((m) => {
          if (m.sender === "User") return false;
          if (now - m.timestamp > 2000) return false;
          const existing = m.text.toLowerCase().trim().replace(/[.!?]/g, "");
          return (
            existing === normalized ||
            existing.includes(normalized) ||
            normalized.includes(existing)
          );
        });
        if (isDupe) return prev;
        if (sid) {
          fetch(`${BACKEND_URL}/api/session/${sid}/save-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "USER",
              question: text,
              answer: "",
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            }),
          }).catch(console.error);
        }
        return [
          ...prev,
          {
            id: Math.random().toString(36).slice(7),
            sender: "User" as const,
            text,
            timestamp: now,
          },
        ];
      });
    },
    [], // no deps â€” reads sessionInfoRef
  );

  const handleInterviewerTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      if (!isFinal || !text.trim()) return;
      const sid = sessionInfoRef.current?.sessionId;
      setMessages((prev) => {
        const now = Date.now();
        const normalized = text.toLowerCase().trim().replace(/[.!?]/g, "");
        const isDupe = prev.some((m) => {
          if (m.sender === "Interviewer") return false;
          if (now - m.timestamp > 2000) return false;
          const existing = m.text.toLowerCase().trim().replace(/[.!?]/g, "");
          return (
            existing === normalized ||
            existing.includes(normalized) ||
            normalized.includes(existing)
          );
        });
        if (isDupe) return prev;
        if (sid) {
          fetch(`${BACKEND_URL}/api/session/${sid}/save-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "INTERVIEWER",
              question: text,
              answer: "",
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            }),
          }).catch(console.error);
        }
        return [
          ...prev,
          {
            id: Math.random().toString(36).slice(7),
            sender: "Interviewer" as const,
            text,
            timestamp: now,
          },
        ];
      });
    },
    [], // no deps â€” reads sessionInfoRef
  );

  const micTranscription = useDeepgram({
    apiKey: DEEPGRAM_KEY,
    model: "nova-3",
    language: getLanguageCode(sessionInfo?.language ?? "English"),
    onTranscript: handleUserTranscript,
  });

  // Keep ref fresh so session-init listener can call startTranscription
  const startMicRef = useRef(micTranscription.startTranscription);
  startMicRef.current = micTranscription.startTranscription;

  // â”€â”€ Tab / system audio transcription (Interviewer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const tabTranscription = useNativeTabTranscription({
    apiKey: DEEPGRAM_KEY,
    model: "nova-3",
    language: getLanguageCode(sessionInfo?.language ?? "English"),
    onTranscript: handleInterviewerTranscript,
    // enabled only when session is active AND user hasn't manually disabled remote audio
    enabled: !!sessionInfo && isTabEnabled,
  });

  // â”€â”€ Listen for session-init from launcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<SessionInitData>("session-init", (event) => {
      const info = event.payload;
      try { sessionStorage.setItem("scribeshade.session-init", JSON.stringify(info)); } catch {}
      setSessionInfo(info);
      setSelectedModel(info.aiModel || "google/gemma-4-26b-a4b-it");
      // Notify Rust that a session is now active
      invoke("set_session_active", { active: true }).catch(() => {});
      // Auto-start mic after a short delay so Deepgram hook has settled
      setTimeout(() => startMicRef.current(), 500);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);
    return () => {
      unlisten?.();
    };
  }, []);

  // Listen for structured transcript events from the main window
  // page.tsx emits overlay-transcript for every finalized message from BOTH mic and tab audio.
  // We deduplicate against messages already added by the native audio path.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ sender: "User" | "Interviewer"; text: string; timestamp: number }>(
      "overlay-transcript",
      (event) => {
        const { sender, text, timestamp } = event.payload;
        if (!text.trim()) return;
        setMessages((prev) => {
          const normalized = text.toLowerCase().trim().replace(/[.!?]/g, "");
          // Skip if already present (added by native mic/tab audio path)
          const alreadyExists = prev.some((m) => {
            if (m.sender !== sender) return false;
            if (Math.abs(m.timestamp - timestamp) > 3000) return false;
            const existing = m.text.toLowerCase().trim().replace(/[.!?]/g, "");
            return (
              existing === normalized ||
              existing.includes(normalized) ||
              normalized.includes(existing)
            );
          });
          if (alreadyExists) return prev;
          return [
            ...prev,
            {
              id: Math.random().toString(36).slice(7),
              sender,
              text,
              timestamp,
            },
          ];
        });
      },
    )
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);
    return () => {
      unlisten?.();
    };
  }, []);

  // â”€â”€ Auto-expand responses panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (aiResponses.length > 0) {
      setCurrentResponseIndex(aiResponses.length - 1);
      setIsResponsesExpanded(true);
    }
  }, [aiResponses.length]);

  useEffect(() => {
    if (isAnswering || isAnalyzing) {
      setIsResponsesExpanded(true);
    }
  }, [isAnswering, isAnalyzing]);

  // â”€â”€â”€ Derived state machine â€” single source of truth for the OS window â”€â”€â”€
  type MiniState = "badge" | "bar" | "expanded";
  const miniState: MiniState = isWindowCollapsed
    ? "badge"
    : isAnswering ||
        isAnalyzing ||
        (aiResponses.length > 0 && isResponsesExpanded)
      ? "expanded"
      : "bar";

  // Push discrete state transitions to Rust
  useEffect(() => {
    if (miniState === "expanded") return;
    invoke("set_mini_state", { state: miniState }).catch(() => {});
  }, [miniState]);

  // While expanded, forward real DOM height to Rust (debounced ~60ms)
  useEffect(() => {
    if (!rootRef.current || miniState !== "expanded") return;

    const send = (h: number) => {
      if (Math.abs(h - lastSentHeightRef.current) < 2) return;
      lastSentHeightRef.current = h;
      invoke("set_mini_state", { state: "expanded", height: h }).catch(
        () => {},
      );
    };

    const observer = new ResizeObserver((entries) => {
      const h = Math.ceil(entries[0]?.contentRect.height ?? 0);
      if (h < 10) return;
      if (heightDebounceRef.current) clearTimeout(heightDebounceRef.current);
      heightDebounceRef.current = setTimeout(() => send(h), 60);
    });

    observer.observe(rootRef.current);
    send(Math.ceil(rootRef.current.getBoundingClientRect().height));

    return () => {
      observer.disconnect();
      if (heightDebounceRef.current) clearTimeout(heightDebounceRef.current);
      // Reset the dedup guard so the next expansion always fires a Rust resize.
      // Without this, collapsing then re-expanding would see the same height as
      // last time and skip the invoke(), leaving the window stuck at bar size.
      lastSentHeightRef.current = 0;
    };
  }, [miniState]);

  // â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleAiAnswerClick = useCallback(async () => {
    if (isEmittingRef.current || isAnswering) return;
    const info = sessionInfoRef.current;
    if (!info) return;

    const msgs = messagesRef.current;
    const interimMic = micTranscription.interimTranscript;
    const interimTab = tabTranscription.interimTranscript;
    const combined = msgs
      .map((m) => `[${m.sender === "User" ? "YOU" : "Interviewer"}]: ${m.text}`)
      .join("\n");
    const fullTranscript =
      combined +
      (interimMic ? `\n[YOU]: ${interimMic}` : "") +
      (interimTab ? `\n[Interviewer]: ${interimTab}` : "");

    if (!fullTranscript.trim()) return;

    isEmittingRef.current = true;
    try {
      await handleAiAnswer(
        info.sessionId,
        fullTranscript,
        selectedModelRef.current,
      );
    } finally {
      setTimeout(() => {
        isEmittingRef.current = false;
      }, 800);
    }
  }, [
    isAnswering,
    handleAiAnswer,
    micTranscription.interimTranscript,
    tabTranscription.interimTranscript,
  ]);

  const handleAnalyzeScreenClick = useCallback(async () => {
    if (isEmittingRef.current || isAnalyzing) return;
    const info = sessionInfoRef.current;
    if (!info) return;

    isEmittingRef.current = true;
    try {
      const screenshotData = await invoke<string>("capture_screen");
      // Convert base64 to Blob
      const hasPrefix = screenshotData.includes(",");
      const base64Data = hasPrefix
        ? screenshotData.split(",")[1]
        : screenshotData;
      const contentType = hasPrefix
        ? screenshotData.split(",")[0].split(":")[1].split(";")[0]
        : "image/jpeg";
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes.buffer], { type: contentType });
      await handleAnalyzeScreen(info.sessionId, blob, selectedModelRef.current);
    } catch (err) {
      console.error("Failed to capture screen:", err);
      toast.error("Failed to capture screen");
    } finally {
      setTimeout(() => {
        isEmittingRef.current = false;
      }, 800);
    }
  }, [isAnalyzing, handleAnalyzeScreen]);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !sessionInfoRef.current) return;
    const query = inputValue.trim();
    setInputValue("");
    handleCustomQuery(
      sessionInfoRef.current.sessionId,
      query,
      selectedModelRef.current,
    );
  }, [inputValue, handleCustomQuery]);

  const handleToggleMic = useCallback(() => {
    if (micTranscription.isTranscribing) {
      micTranscription.stopTranscription();
    } else {
      micTranscription.startTranscription();
    }
  }, [micTranscription]);

  const handleClearTranscript = useCallback(() => {
    micTranscription.clearTranscript();
    tabTranscription.clearTranscript();
    setMessages([]);
  }, [micTranscription, tabTranscription]);

  const handleToggleTab = useCallback(() => {
    setIsTabEnabled((v) => !v);
  }, []);

  const handleExit = useCallback(() => {
    endSessionNowRef.current();
  }, []);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastTranscriptLine = lastMessage?.text ?? "";
  const lastTranscriptSender = lastMessage?.sender ?? null;
  const interimTranscript =
    micTranscription.interimTranscript || tabTranscription.interimTranscript;
  const isMicActive = micTranscription.isTranscribing;
  const isMicConnecting = micTranscription.isConnecting;
  const isTabActive = tabTranscription.isTranscribing;
  const isTabConnecting = tabTranscription.isConnecting;

  if (isWindowCollapsed) {
    return (
      <div ref={rootRef} className="w-full h-full flex items-center">
        <button
          onClick={() => setIsWindowCollapsed(false)}
          className="w-full h-full flex items-center justify-center gap-2 px-3 bg-zinc-900/95 backdrop-blur-2xl rounded-xl border border-white/10 hover:border-blue-500/40 hover:bg-zinc-800/90 transition-all active:scale-95 group"
          title="Expand Craft Vita"
        >
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-white/60 group-hover:text-white uppercase tracking-widest transition-colors leading-none">
            Craft Vita
          </span>
          {aiResponses.length > 0 && (
            <span className="ml-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500/30 border border-blue-500/50">
              <span className="text-[8px] font-bold text-blue-300">
                {aiResponses.length}
              </span>
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="w-full flex flex-col outline-none bg-zinc-900/95 backdrop-blur-2xl rounded-xl overflow-hidden"
    >
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{ style: { fontSize: "12px" } }}
      />

      {/* â”€â”€â”€ Top Card: Controls â”€â”€â”€ */}
      <div className="shrink-0">
        {/* Header */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-white/5 relative group/header cursor-default no-drag">
          {/* Left: Title & Drag Handle */}
          <div className="flex items-center gap-3 data-tauri-drag-region">
            <div className="flex items-center gap-2 drag">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
              <h1 className="text-xs font-bold text-white uppercase tracking-widest leading-none pointer-events-none">
                Craft Vita
              </h1>
            </div>
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <div
                  data-tauri-drag-region
                  className="p-1 rounded bg-white/25 text-white/20 group-hover/header:text-white/40 cursor-grab active:cursor-grabbing transition-colors"
                >
                  <GripHorizontal size={14} className="pointer-events-none" />
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
              >
                Drag to move
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Right: Model + Timer + Actions */}
          <div className="flex items-center gap-2">
            <div className="scale-90 origin-right">
              <ModelSelector
                value={selectedModel}
                onChange={setSelectedModel}
                isFullscreen={true}
              />
            </div>

            <div className="flex items-center gap-2 bg-white/5 px-3 h-9 rounded-xl border border-white/10 shadow-inner transition-all hover:bg-white/10 group">
              <Clock className="h-3.5 w-3.5 text-blue-400 group-hover:animate-pulse" />
              <span className="text-[13px] font-mono font-bold text-white/90 tabular-nums tracking-tight">
                {formattedTime || "00:00"}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 h-9">
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsWindowCollapsed(true)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-all text-zinc-300 hover:text-blue-400 active:scale-95 flex items-center justify-center"
                  >
                    <ChevronDown size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
                >
                  Collapse to Icon
                </TooltipContent>
              </Tooltip>

              <div className="w-px h-4 bg-white/10 mx-0.5" />

              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleExit}
                    disabled={isEnding}
                    className={cn(
                      "p-2 rounded-lg transition-all flex items-center justify-center",
                      isEnding
                        ? "bg-rose-500/20 text-rose-400 cursor-not-allowed"
                        : "text-zinc-300 hover:bg-rose-500/10 hover:text-rose-400 active:scale-95",
                    )}
                  >
                    <LogOut
                      size={16}
                      className={isEnding ? "animate-pulse" : ""}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
                >
                  End Session
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Live Monitor Row */}
        <div className="px-4 py-2 flex items-center justify-between bg-white/2 border-b border-white/5">
          <div className="flex-1 flex items-center gap-2 overflow-hidden mr-3">
            {/* Dual status dots: green = mic, purple = remote */}
            <div className="flex gap-1 shrink-0">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300",
                  isMicConnecting
                    ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    : isMicActive
                      ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                      : "bg-white/20",
                )}
              />
              {isTabEnabled && (
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-300",
                    isTabConnecting
                      ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                      : isTabActive
                        ? "bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                        : "bg-white/20",
                  )}
                />
              )}
            </div>

            <div className="flex-1 truncate text-[12px] font-medium text-white italic">
              {isEnding ? (
                <span className="text-rose-400 font-bold animate-pulse">
                  Ending Session...
                </span>
              ) : !sessionInfo ? (
                <span className="text-white/20 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin shrink-0" />
                  Waiting for session...
                </span>
              ) : lastTranscriptLine || interimTranscript ? (
                <>
                  {lastTranscriptLine && (
                    <span
                      className={cn(
                        "font-bold mr-1 text-[9px] uppercase tracking-wider not-italic",
                        lastTranscriptSender === "User"
                          ? "text-blue-400"
                          : "text-purple-400",
                      )}
                    >
                      {lastTranscriptSender === "User" ? "You:" : "Them:"}
                    </span>
                  )}
                  {lastTranscriptLine}
                  {interimTranscript && (
                    <span className="text-white/30 ml-1">
                      {interimTranscript}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-white/20">
                  {isMicActive
                    ? "Listening for speech..."
                    : "Waiting for audio..."}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Transcript expand/collapse */}
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsTranscriptExpanded((v) => !v)}
                  disabled={!sessionInfo || messages.length === 0}
                  className={cn(
                    "p-2 rounded-xl transition-all active:scale-95 border",
                    isTranscriptExpanded
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : "bg-white/10 text-zinc-300 border-white/10 hover:bg-blue-500/10 hover:text-blue-400",
                    (!sessionInfo || messages.length === 0) &&
                      "opacity-40 cursor-not-allowed",
                  )}
                >
                  <AlignJustify size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
              >
                {isTranscriptExpanded ? "Hide Transcript" : "Show Transcript"}
              </TooltipContent>
            </Tooltip>

            {/* User mic toggle */}
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleToggleMic}
                  disabled={!sessionInfo}
                  className={cn(
                    "p-2 rounded-xl transition-all active:scale-95 border",
                    isMicActive
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : "bg-white/10 text-zinc-300 border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400",
                    !sessionInfo && "opacity-40 cursor-not-allowed",
                  )}
                >
                  {isMicConnecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isMicActive ? (
                    <Mic size={14} />
                  ) : (
                    <MicOff size={14} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
              >
                {isMicActive ? "Mute My Mic" : "Unmute My Mic"}
              </TooltipContent>
            </Tooltip>

            {/* Remote (interviewer) audio toggle */}
            {/* <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleToggleTab}
                  disabled={!sessionInfo}
                  className={cn(
                    "p-2 rounded-xl transition-all active:scale-95 border",
                    isTabEnabled
                      ? "bg-purple-500/20 text-purple-400 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                      : "bg-white/10 text-zinc-300 border-white/10 hover:bg-purple-500/10 hover:text-purple-400",
                    !sessionInfo && "opacity-40 cursor-not-allowed",
                  )}
                >
                  {isTabConnecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isTabEnabled ? (
                    <Headphones size={14} />
                  ) : (
                    <HeadphoneOff size={14} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
              >
                {isTabEnabled ? "Disable Remote Audio" : "Enable Remote Audio"}
              </TooltipContent>
            </Tooltip> */}

            {/* Clear transcript */}
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClearTranscript}
                  disabled={!sessionInfo}
                  className={cn(
                    "p-2 rounded-xl bg-white/10 text-zinc-300 border border-white/10 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30 transition-all active:scale-95 flex items-center justify-center",
                    !sessionInfo && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <Trash2 size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
              >
                Clear Transcript
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Collapsible Transcript Panel — full conversation log */}
        {isTranscriptExpanded && (
          <div className="border-b border-white/10 max-h-52 overflow-y-auto no-scrollbar px-3 py-2 space-y-2">
            {messages.length === 0 ? (
              <p className="text-[11px] text-white/20 text-center py-2">
                No transcript yet...
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-2 items-start",
                    m.sender === "User" ? "flex-row" : "flex-row-reverse",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 text-[9px] font-bold uppercase tracking-wider pt-1.5",
                      m.sender === "User"
                        ? "text-blue-400"
                        : "text-purple-400",
                    )}
                  >
                    {m.sender === "User" ? "You" : "Them"}
                  </span>
                  <span
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl text-[12px] leading-snug font-medium max-w-[85%]",
                      m.sender === "User"
                        ? "bg-blue-500/10 text-blue-100 rounded-tl-none"
                        : "bg-purple-500/10 text-purple-100 rounded-tr-none",
                    )}
                  >
                    {m.text}
                  </span>
                </div>
              ))
            )}
            {/* Live interim bubble */}
            {(micTranscription.interimTranscript ||
              tabTranscription.interimTranscript) && (
              <div
                className={cn(
                  "flex gap-2 items-start opacity-50",
                  micTranscription.interimTranscript
                    ? "flex-row"
                    : "flex-row-reverse",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 text-[9px] font-bold uppercase tracking-wider pt-1.5",
                    micTranscription.interimTranscript
                      ? "text-blue-400"
                      : "text-purple-400",
                  )}
                >
                  {micTranscription.interimTranscript ? "You" : "Them"}
                </span>
                <span
                  className={cn(
                    "px-2.5 py-1.5 rounded-xl text-[12px] leading-snug font-medium italic",
                    micTranscription.interimTranscript
                      ? "bg-blue-500/10 text-blue-100 rounded-tl-none"
                      : "bg-purple-500/10 text-purple-100 rounded-tr-none",
                  )}
                >
                  {micTranscription.interimTranscript ||
                    tabTranscription.interimTranscript}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Bar */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <ChatActionButtons
            onAiAnswer={handleAiAnswerClick}
            onAnalyzeScreen={handleAnalyzeScreenClick}
            isAnswering={isAnswering}
            isAnalyzing={isAnalyzing}
            canAnswer={!!sessionInfo && messages.length > 0}
            canAnalyze={!!sessionInfo}
            isFullscreen={true}
          />
          <div className="relative flex-1">
            <input
              className="w-full h-10 rounded-xl pl-4 pr-12 text-sm font-medium bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
              placeholder="Ask AI anything..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || !sessionInfo}
                  className="absolute right-1 top-1 h-8 w-10 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 flex items-center justify-center text-white transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                >
                  <Send size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
              >
                Send Message
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* â”€â”€â”€ AI Responses Panel â”€â”€â”€ */}
      {(isAnswering || isAnalyzing || aiResponses.length > 0) && (
        <div className="flex flex-col border-t border-white/10">
          {/* Nav Row */}
          <div className="px-3 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setCurrentResponseIndex((i) => Math.max(0, i - 1))
                }
                disabled={
                  currentResponseIndex === 0 || aiResponses.length === 0
                }
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition-all active:scale-95"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() =>
                  setCurrentResponseIndex((i) =>
                    Math.min(aiResponses.length - 1, i + 1),
                  )
                }
                disabled={currentResponseIndex >= aiResponses.length - 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition-all active:scale-95"
              >
                <ChevronRight size={14} />
              </button>
              {aiResponses.length > 1 && (
                <span className="text-[11px] text-white/40 ml-1 font-mono">
                  {currentResponseIndex + 1}/{aiResponses.length}
                </span>
              )}
              {(isAnswering || isAnalyzing) && aiResponses.length === 0 && (
                <span className="flex items-center gap-1.5 ml-1 text-[11px] text-blue-400/80">
                  <Loader2 size={11} className="animate-spin" />
                  Generating...
                </span>
              )}
            </div>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsResponsesExpanded((v) => !v)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-blue-400 text-white/50 transition-all active:scale-95"
                >
                  {isResponsesExpanded ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronUp size={13} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
              >
                {isResponsesExpanded ? "Collapse" : "Expand"}
              </TooltipContent>
            </Tooltip>
          </div>

          {isResponsesExpanded && aiResponses.length > 0 && (
            <div className="border-t border-white/10 max-h-120 overflow-y-auto overflow-x-hidden no-scrollbar">
              <AnswerArea
                responses={[
                  {
                    messageId: aiResponses[currentResponseIndex]?.id ?? "",
                    text: aiResponses[currentResponseIndex]?.text ?? "",
                    isStreaming:
                      currentResponseIndex === aiResponses.length - 1 &&
                      (isAnswering || isAnalyzing),
                  },
                ].filter((r) => r.messageId)}
                isStreaming={isAnswering || isAnalyzing}
              />
            </div>
          )}

          {isResponsesExpanded &&
            (isAnswering || isAnalyzing) &&
            aiResponses.length === 0 && (
              <div className="flex items-center justify-center py-8 gap-2 text-blue-400/70">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[13px] font-medium">
                  Generating response...
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

// Mount the app
const rootElement = document.getElementById("mini-app-root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <TooltipProvider>
        <FloatingApp />
      </TooltipProvider>
    </React.StrictMode>,
  );
}
