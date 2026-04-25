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
  Power,
  LogOut,
  User,
  Loader2,
} from "lucide-react";
import { ChatActionButtons } from "./components/ChatActionButtons";
import { SessionTimer } from "./components/SessionTimer";
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
      {responses.map((resp) => (
        <div
          key={resp.messageId}
          className="animate-in fade-in slide-in-from-bottom-1 duration-300"
        >
          {/* Message Label */}
          <div className="flex items-center gap-1.5 mb-2">
            <div className={cn(
              "h-5 w-5 rounded-md flex items-center justify-center",
              resp.sender === "User" ? "bg-slate-500/20" : "bg-blue-500/20"
            )}>
              {resp.sender === "User" ? (
                <User className="h-3 w-3 text-slate-400" />
              ) : (
                <Sparkles className="h-3 w-3 text-blue-400" />
              )}
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {resp.sender === "User" ? "You" : "AI Assistant"}
            </span>
          </div>

          {/* Markdown Content */}
          <div
            className={[
              "pl-6 text-[13px] leading-relaxed font-medium text-white/90 break-words",
              "[&_p]:mb-3 [&_p:last-child]:mb-0",
              "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3",
              "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3",
              "[&_li]:mb-1 [&_strong]:font-bold [&_strong]:text-white",
              "[&_a]:text-blue-400 [&_a]:underline",
              "[&_h1]:text-white [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2",
              "[&_h2]:text-white [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-2",
              "[&_h3]:text-white/90 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1",
              "[&_code]:text-blue-300 [&_code]:bg-white/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_code]:font-mono",
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
                  return <CodeBlock language={language}>{children}</CodeBlock>;
                },
                code: ({ node, inline, children, ...props }: any) => {
                  if (inline) {
                    return (
                      <code
                        className="px-1 py-0.5 rounded text-[16px] font-medium bg-white/10 text-white"
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
              {resp.text}
            </ReactMarkdown>
            {resp.isStreaming && (
              <span className="ml-1 inline-block h-3.5 w-0.5 bg-blue-400 animate-pulse" />
            )}
          </div>
        </div>
      ))}
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
  });

  const [responses, setResponses] = useState<AIResponse[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResponsesExpanded, setIsResponsesExpanded] = useState(true);
  const [expandedHeight, setExpandedHeight] = useState(540);
  const [isEnding, setIsEnding] = useState(false);
  const prevResponsesCount = useRef(0);
  const isResizingInternallyRef = useRef(false);
  const resizeTimeoutRef = useRef<any>(null);

  // Dynamically update window size based on content state
  useEffect(() => {
    if (isCollapsed) return;

    const updateSize = async () => {
      if (isResizingInternallyRef.current) return;
      isResizingInternallyRef.current = true;

      try {
        const win = getCurrentWindow();
        if (responses.length === 0) {
          await win.setSize(new LogicalSize(520, 185));
        } else if (!isResponsesExpanded) {
          await win.setSize(new LogicalSize(520, 245));
        } else {
          await win.setSize(new LogicalSize(520, expandedHeight));
        }
      } catch (err) {
        console.error("Failed to resize window:", err);
      } finally {
        // Delay unlocking slightly to allow the OS to process the resize event
        setTimeout(() => {
          isResizingInternallyRef.current = false;
        }, 150);
      }
    };

    updateSize();
  }, [responses.length, isResponsesExpanded, isCollapsed, expandedHeight]);

  // Track manual window resizes when expanded to save user preference
  useEffect(() => {
    let unlisten: () => void;
    const setup = async () => {
      unlisten = await getCurrentWindow().onResized(({ payload }) => {
        // Ignore resizes that we triggered programmatically
        if (isResizingInternallyRef.current) return;

        if (!isCollapsed && isResponsesExpanded && responses.length > 0) {
          // Debounce the height update
          if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
          resizeTimeoutRef.current = setTimeout(() => {
            currentMonitor().then((monitor) => {
              const scaleFactor = monitor?.scaleFactor || 1;
              const logicalHeight = payload.height / scaleFactor;
              if (logicalHeight > 300) {
                setExpandedHeight(logicalHeight);
              }
            });
          }, 200);
        }
      });
    };
    setup();
    return () => {
      if (unlisten) unlisten();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [isCollapsed, isResponsesExpanded, responses.length]);

  // Auto-expand responses when a new response arrives for the first time
  useEffect(() => {
    if (responses.length > 0 && prevResponsesCount.current === 0) {
      setIsResponsesExpanded(true);
    }
    prevResponsesCount.current = responses.length;
  }, [responses.length]);

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
                ? { ...r, text: payload.text, isStreaming: payload.isStreaming, sender: payload.sender }
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

  const toggleCollapse = async () => {
    try {
      const window = getCurrentWindow();
      const monitor = await currentMonitor();

      if (!isCollapsed) {
        // Collapse to Eye icon
        const width = 80;
        const height = 80;

        await window.setResizable(true);
        await window.setSize(new LogicalSize(width, height));

        if (monitor) {
          const scaleFactor = monitor.scaleFactor || 1;
          const screenWidth = monitor.size.width / scaleFactor;
          const x = (screenWidth - width) / 2;
          const y = 20; // Top offset
          await window.setPosition(new LogicalPosition(x, y));
        }

        await window.setResizable(false);
        setIsCollapsed(true);
      } else {
        // Expand back to App
        const width = 520;
        let height = 185;
        if (responses.length > 0) {
          height = isResponsesExpanded ? expandedHeight : 245;
        }

        await window.setResizable(true);
        await window.setSize(new LogicalSize(width, height));

        if (monitor) {
          const scaleFactor = monitor.scaleFactor || 1;
          const screenWidth = monitor.size.width / scaleFactor;
          const x = (screenWidth - width) / 2;
          const y = 20; // Keep same top offset
          await window.setPosition(new LogicalPosition(x, y));
        }

        setIsCollapsed(false);
      }
    } catch (err) {
      console.error("Toggle error:", err);
      setIsCollapsed(!isCollapsed);
    }
  };

  if (isCollapsed) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-transparent group drag">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              onClick={toggleCollapse}
              className="w-12 h-12 rounded-full bg-zinc-900/90 backdrop-blur-2xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-110 transition-all active:scale-95 no-drag"
            >
              <Eye size={24} className="text-blue-400 animate-pulse" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
          >
            Expand ScribeShade
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col gap-3 outline-none">
      {/* ─── Top Card: Controls ─── */}
      <div className="bg-zinc-900/90 backdrop-blur-2xl rounded-xl overflow-hidden shadow-2xl shrink-0">
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
              </Tooltip>

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
      {responses.length > 0 && (
        <div
          className={cn(
            "flex flex-col bg-zinc-900/90 backdrop-blur-2xl rounded-xl overflow-hidden shadow-2xl shrink-0",
            isResponsesExpanded ? "flex-1" : "h-12",
          )}
        >
          {/* Response Header/Toggle */}
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsResponsesExpanded(!isResponsesExpanded)}
                className="w-full px-4 h-12 flex items-center justify-between hover:bg-white/5 transition-colors group/resp no-drag shrink-0"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-blue-400" />
                  <span className="text-[11px] font-bold text-white/70 uppercase tracking-widest">
                    AI Analysis{" "}
                    {responses.length > 0 && `(${responses.length})`}
                  </span>
                </div>
                <div className="p-1 rounded bg-white/5 text-white/40 group-hover/resp:text-white transition-all">
                  {isResponsesExpanded ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronUp size={16} />
                  )}
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="bg-slate-900 border-white/10 text-white font-medium text-[11px]"
            >
              {isResponsesExpanded ? "Collapse Responses" : "Expand Responses"}
            </TooltipContent>
          </Tooltip>

          {/* Response Content */}
          <div
            className={cn(
              "flex-1 flex flex-col min-h-0 overflow-hidden",
              isResponsesExpanded
                ? "opacity-100"
                : "opacity-0 pointer-events-none",
            )}
          >
            <div className="flex-1 overflow-hidden border-t border-white/5 flex flex-col">
              <AnswerArea
                responses={responses}
                isStreaming={isAnswering || isAnalyzing}
              />
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
