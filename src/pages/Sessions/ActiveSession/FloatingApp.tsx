import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";
import {
  currentMonitor,
  LogicalPosition,
  LogicalSize,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Sparkles,
  Send,
  Copy,
  Check,
  X,
  Mic,
  MicOff,
  Trash2,
  Maximize2,
  EyeOff,
  Clock,
  Eye,
  GripHorizontal,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Star,
  Power,
  LogOut,
  User,
  Loader2,
} from "lucide-react";
import { ChatActionButtons } from "./components/ChatActionButtons";
import { SessionTimer } from "./components/SessionTimer";
import { ModelSelector } from "./components/ModelSelector";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import "@/App.css";
import { toast } from "sonner";

// ─── Types
interface OverlayData {
  transcript: string;
  interimTranscript?: string;
  status: string;
  isMicActive: boolean;
  isMicConnecting: boolean;
  timerText: string | null;
  sessionId: string | null;
  selectedModel?: string;
}

interface AIResponse {
  text: string;
  isStreaming: boolean;
  messageId: string;
  sender?: "User" | "AI" | "Interviewer";
}

// ─── CodeBlock (for markdown rendering)
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

// ─── Response Parser ────────────────────────────────────────────────
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

// ─── Answer Area ─────────────────────────────────────────────────────
const AnswerArea: React.FC<{
  responses: AIResponse[];
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
              <div className="flex items-start gap-2 mb-3 text-[13px] leading-relaxed text-white">
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-white/80" />
                <div className="flex-1 break-words">
                  <span className="font-bold">Summarized question:</span>{" "}
                  <span className="font-medium text-white/90">
                    {parsed.question}
                  </span>
                </div>
              </div>
            )}

            {/* Answer Header */}
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="text-[13px] font-bold text-white">Answer:</span>
            </div>

            {/* Markdown Content */}
            <div
              className={[
                "text-[13px] leading-relaxed font-medium text-white break-words",
                "[&_p]:mb-3 [&_p:last-child]:mb-0",
                "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1",
                "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1",
                "[&_li]:mb-0 [&_li]:marker:text-white/60",
                "[&_strong]:font-bold [&_strong]:text-white",
                "[&_em]:text-amber-200 [&_em]:not-italic [&_em]:font-semibold",
                "[&_a]:text-blue-300 [&_a]:underline",
                "[&_h1]:text-white [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-2",
                "[&_h2]:text-white [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-2",
                "[&_h3]:text-white [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-1",
                "[&_blockquote]:border-l-2 [&_blockquote]:border-blue-400/50 [&_blockquote]:pl-3 [&_blockquote]:text-white/80 [&_blockquote]:italic",
                "[&_table]:w-full [&_table]:my-3 [&_table]:text-[12px] [&_table]:border-collapse",
                "[&_th]:border [&_th]:border-white/10 [&_th]:bg-white/5 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-bold",
                "[&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1",
              ].join(" ")}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
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
                        <code
                          className="px-1.5 py-0.5 rounded text-[12px] font-mono font-semibold bg-blue-500/15 text-blue-200 border border-blue-400/20"
                          {...props}
                        >
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

// ─── Main FloatingApp ────────────────────────────────────────────────
const FloatingApp: React.FC = () => {
  const [data, setData] = useState<OverlayData>({
    transcript: "",
    status: "Initializing",
    isMicActive: false,
    isMicConnecting: false,
    timerText: null,
    sessionId: null,
    selectedModel: "google/gemma-4-26b-a4b-it",
  });

  const [responses, setResponses] = useState<AIResponse[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isResponsesExpanded, setIsResponsesExpanded] = useState(false);
  const [currentResponseIndex, setCurrentResponseIndex] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [isWindowCollapsed, setIsWindowCollapsed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Auto-advance to latest response and show panel when new responses arrive
  useEffect(() => {
    if (responses.length > 0) {
      setCurrentResponseIndex(responses.length - 1);
      setIsResponsesExpanded(true);
    }
  }, [responses.length]);

  // Show panel immediately when generation starts
  useEffect(() => {
    if (isAnswering || isAnalyzing) {
      setIsResponsesExpanded(true);
    }
  }, [isAnswering, isAnalyzing]);

  const lastSentHeightRef = useRef<number>(185);
  const heightDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Derived state machine — single source of truth for the OS window
  type MiniState = "badge" | "bar" | "expanded";
  const miniState: MiniState = isWindowCollapsed
    ? "badge"
    : isAnswering ||
        isAnalyzing ||
        (responses.length > 0 && isResponsesExpanded)
      ? "expanded"
      : "bar";

  // Push discrete state transitions to Rust. Rust owns the eased animation.
  useEffect(() => {
    if (miniState === "expanded") return; // expanded height is sent by the observer below
    invoke("set_mini_state", { state: miniState }).catch(() => {});
  }, [miniState]);

  // While expanded, watch real DOM height and forward changes to Rust
  // (debounced — one IPC call per ~60 ms of stable size).
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
    // Send initial height immediately so Rust animates to it without waiting
    send(Math.ceil(rootRef.current.getBoundingClientRect().height));

    return () => {
      observer.disconnect();
      if (heightDebounceRef.current) clearTimeout(heightDebounceRef.current);
    };
  }, [miniState]);

  // Listen for overlay-update from main window
  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const fn = await listen("overlay-update", (event) => {
        if (active) setData(event.payload as OverlayData);
      });
      if (!active) {
        fn();
        return;
      }
      unlisteners.push(fn);
    };

    setup();
    return () => {
      active = false;
      unlisteners.forEach((u) => u());
    };
  }, []);

  // Listen for AI response chunks from main window
  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const fn = await listen("overlay-ai-response", (event) => {
        if (!active) return;
        const payload = event.payload as AIResponse;

        setResponses((prev) => {
          const existing = prev.find((r) => r.messageId === payload.messageId);
          if (existing) {
            return prev.map((r) =>
              r.messageId === payload.messageId
                ? {
                    ...r,
                    text: payload.text,
                    isStreaming: payload.isStreaming,
                    sender: payload.sender,
                  }
                : r,
            );
          }
          return [...prev, payload];
        });

        // Update loading states based on streaming status
        if (!payload.isStreaming) {
          setIsAnswering(false);
          setIsAnalyzing(false);
        }
      });

      if (!active) {
        fn();
        return;
      }
      unlisteners.push(fn);
    };

    setup();
    return () => {
      active = false;
      unlisteners.forEach((u) => u());
    };
  }, []);

  const isEmittingRef = useRef(false);

  const handleAiAnswer = async () => {
    if (isEmittingRef.current || isAnswering || !data.sessionId) return;
    isEmittingRef.current = true;
    try {
      setResponses([]);
      setCurrentResponseIndex(0);
      setIsAnswering(true);
      await emit("overlay-ai-answer", { sessionId: data.sessionId });
    } finally {
      // Debounce emission
      setTimeout(() => {
        isEmittingRef.current = false;
      }, 800);
    }
  };

  const handleAnalyzeScreen = async () => {
    if (isEmittingRef.current || isAnalyzing || !data.sessionId) return;
    isEmittingRef.current = true;
    try {
      setResponses([]);
      setCurrentResponseIndex(0);
      setIsAnalyzing(true);
      // Capture the screen the floating app is currently on via Rust command
      const screenshotData = await invoke<string>("capture_screen");
      await emit("overlay-analyze-screen", {
        sessionId: data.sessionId,
        screenshotData,
      });
    } catch (err) {
      console.error("Failed to capture screen:", err);
      toast.error("Failed to capture screen");
      setIsAnalyzing(false);
    } finally {
      // Debounce emission
      setTimeout(() => {
        isEmittingRef.current = false;
      }, 800);
    }
  };

  const handleClose = async () => {
    await emit("overlay-restore", {});
    setTimeout(async () => {
      await getCurrentWindow().close();
    }, 100);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !data.sessionId) return;
    const query = inputValue.trim();
    setInputValue("");
    setIsAnswering(true);
    await emit("overlay-ai-query", { query, sessionId: data.sessionId });
  };

  const handleToggleMic = async () => {
    await emit("overlay-toggle-mic", {});
  };

  const handleClearTranscript = async () => {
    await emit("overlay-clear-transcript", {});
  };

  const handleRestore = async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const mainWindow = await WebviewWindow.getByLabel("main");
      if (mainWindow) {
        await mainWindow.show();
        await mainWindow.unminimize();
        await mainWindow.setFocus();
      }
    } catch (err) {
      console.error("Failed to restore main window:", err);
    }
    await getCurrentWindow().close();
  };

  const handleHideMain = async () => {
    await emit("overlay-hide-main", {});
  };

  const handleExit = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      await emit("overlay-end-session-direct", {});
      // Close the mini-screen after a short delay to ensure the event is sent
      setTimeout(async () => {
        const win = getCurrentWindow();
        await win.close();
      }, 300);
    } catch (err) {
      console.error("Failed to end session:", err);
      setIsEnding(false);
    }
  };

  // ── Badge state: entire window collapsed to a tiny pill ──────────────────
  if (isWindowCollapsed) {
    return (
      <div ref={rootRef} className="w-full h-full flex items-center">
        <button
          onClick={() => setIsWindowCollapsed(false)}
          className="w-full h-full flex items-center justify-center gap-2 px-3 bg-zinc-900/95 backdrop-blur-2xl rounded-xl border border-white/10 hover:border-blue-500/40 hover:bg-zinc-800/90 transition-all active:scale-95 group"
          title="Expand ScribeShade"
        >
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-white/60 group-hover:text-white uppercase tracking-widest transition-colors leading-none">
            ScribeShade
          </span>
          {responses.length > 0 && (
            <span className="ml-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500/30 border border-blue-500/50">
              <span className="text-[8px] font-bold text-blue-300">
                {responses.length}
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
      {/* ─── Top Card: Controls ─── */}
      <div className="shrink-0">
        {/* Header Area */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-white/5 relative group/header cursor-default no-drag">
          {/* Left: Title & Drag Handle */}
          <div className="flex items-center gap-3 data-tauri-drag-region">
            <div className="flex items-center gap-2 drag">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
              <h1 className="text-xs font-bold text-white uppercase tracking-widest leading-none pointer-events-none">
                ScribeShade
              </h1>
            </div>
            {/* Dedicated Drag Handle */}
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

          {/* Center Area: Eye Logo (Collapse Button) */}
          {/* <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            <button
              onClick={toggleCollapse}
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shadow-[inset_0_0_10px_rgba(255,255,255,0.02)] backdrop-blur-sm hover:bg-blue-500/10 transition-all active:scale-95 group"
              title="Collapse to Icon"
            >
              <Eye
                size={14}
                className="text-blue-400/60 group-hover:text-blue-400 transition-colors"
              />
            </button>
          </div> */}

          {/* Right: Actions Area */}
          <div className="flex items-center gap-2">
            <div className="scale-90 origin-right">
              <ModelSelector
                value={data.selectedModel || "google/gemma-4-26b-a4b-it"}
                onChange={(val) => {
                  setData((prev) => ({ ...prev, selectedModel: val }));
                  emit("overlay-model-change", { model: val });
                }}
                isFullscreen={true}
              />
            </div>

            {/* Custom Timer Pill */}
            <div className="flex items-center gap-2 bg-white/5 px-3 h-9 rounded-xl border border-white/10 shadow-inner transition-all hover:bg-white/10 group">
              <Clock className="h-3.5 w-3.5 text-blue-400 group-hover:animate-pulse" />
              <span className="text-[13px] font-mono font-bold text-white/90 tabular-nums tracking-tight">
                {data.timerText || "00:00"}
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

              {/* <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleHideMain}
                    className="p-2 hover:bg-white/10 rounded-lg transition-all text-zinc-300 hover:text-amber-400 active:scale-95 flex items-center justify-center"
                  >
                    <EyeOff size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
                >
                  Hide Main App from Taskbar
                </TooltipContent>
              </Tooltip> */}

              <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
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
        <div className="px-4 py-2 flex items-center justify-between bg-white/[0.02] border-b border-white/5">
          <div className="flex-1 flex items-center gap-2 overflow-hidden mr-4">
            <div
              className={cn(
                "shrink-0 w-1.5 h-1.5 rounded-full transition-all duration-300",
                data.isMicConnecting
                  ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                  : data.isMicActive
                    ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    : "bg-white/20",
              )}
            />
            <div className="flex-1 truncate text-[12px] font-medium text-white italic">
              {isEnding ? (
                <span className="text-rose-400 font-bold animate-pulse">
                  Ending Session...
                </span>
              ) : data.transcript || data.interimTranscript ? (
                <>
                  {data.transcript.split("\n").slice(-1)[0]}
                  {data.interimTranscript && (
                    <span className="text-white/30 ml-1">
                      {data.interimTranscript}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-white/20">
                  {data.isMicActive
                    ? "Listening for speech..."
                    : "Waiting for audio..."}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleToggleMic}
                  className={cn(
                    "p-2 rounded-xl transition-all active:scale-95 border",
                    data.isMicActive
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : "bg-white/10 text-zinc-300 border-white/10 hover:bg-white/20 hover:text-white",
                  )}
                >
                  {data.isMicConnecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : data.isMicActive ? (
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
                {data.isMicActive ? "Disable Mic" : "Enable Mic"}
              </TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClearTranscript}
                  className="p-2 rounded-xl bg-white/10 text-zinc-300 border border-white/10 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30 transition-all active:scale-95 flex items-center justify-center"
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

        {/* Action Bar */}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <ChatActionButtons
            onAiAnswer={handleAiAnswer}
            onAnalyzeScreen={handleAnalyzeScreen}
            isAnswering={isAnswering}
            isAnalyzing={isAnalyzing}
            canAnswer={!!data.sessionId}
            canAnalyze={!!data.sessionId}
            isFullscreen={true}
          />
          <div className="relative group">
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
                  disabled={!inputValue.trim()}
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

      {/* ─── Bottom Card: AI Responses ─── */}
      {/* Kept in DOM while there is content; CSS grid-template-rows transition
          drives the open/close animation so ResizeObserver + window follows
          every CSS frame — no JS animation loop needed. */}
      {(isAnswering || isAnalyzing || responses.length > 0) && (
        <div className="flex flex-col border-t border-white/10">
          {/* Nav Row — always visible so user can see/re-expand after collapsing */}
          <div className="px-3 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setCurrentResponseIndex((i) => Math.max(0, i - 1))
                }
                disabled={currentResponseIndex === 0 || responses.length === 0}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition-all active:scale-95"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() =>
                  setCurrentResponseIndex((i) =>
                    Math.min(responses.length - 1, i + 1),
                  )
                }
                disabled={currentResponseIndex >= responses.length - 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition-all active:scale-95"
              >
                <ChevronRight size={14} />
              </button>
              {responses.length > 1 && (
                <span className="text-[11px] text-white/40 ml-1 font-mono">
                  {currentResponseIndex + 1}/{responses.length}
                </span>
              )}
              {(isAnswering || isAnalyzing) && responses.length === 0 && (
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
                {isResponsesExpanded ? "Collapse panel" : "Expand panel"}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Animated content — slides open/closed while nav row stays pinned */}
          <div
            style={{
              display: "grid",
              gridTemplateRows: isResponsesExpanded ? "1fr" : "0fr",
              transition: "grid-template-rows 220ms cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            <div style={{ overflow: "hidden", minHeight: 0 }}>
              {responses.length > 0 && (
                <div className="border-t border-white/10 max-h-[480px] overflow-y-auto overflow-x-hidden no-scrollbar">
                  <AnswerArea
                    responses={[responses[currentResponseIndex]].filter(
                      Boolean,
                    )}
                    isStreaming={
                      (isAnswering || isAnalyzing) &&
                      currentResponseIndex === responses.length - 1
                    }
                  />
                </div>
              )}
            </div>
          </div>
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
