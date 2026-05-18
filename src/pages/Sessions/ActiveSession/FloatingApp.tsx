import React, { useEffect, useState, useRef, useCallback, memo } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { ClerkProvider } from "@clerk/clerk-react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { clampToScreen } from "@/lib/clampToScreen";
import { useOverlayShortcuts } from "@/hooks/useOverlayShortcuts";
import { useSafeZoom } from "@/hooks/useSafeZoom";
import { useCursorPassthrough } from "@/features/launcher/hooks/useCursorPassthrough";
import {
  getOpacity, saveOpacity,
  getZoom, saveZoom,
  getPrivateMode, savePrivateMode,
} from "@/lib/overlaySettings";
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
  Star,
  LogOut,
  Loader2,
  AlignJustify,
  HelpCircle,
  RotateCcw,
} from "lucide-react";
import { ChatActionButtons } from "./components/ChatActionButtons";
import { ModelSelector } from "./components/ModelSelector";
import { SessionMenu } from "@/features/session/components/SessionMenu";
import { FloatingSurface } from "@/features/session/components/FloatingSurface";
import { SessionTranscript } from "@/features/session/components/SessionTranscript";
import { useFloatingSession } from "@/features/session/hooks/useFloatingSession";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import "@/App.css";
import { Toaster } from "sonner";
import { store } from "@/store/store";

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
  //   **QUESTION:** ...\n**ANSWER:** ...
  //   Question: ... \n Answer: ...
  //   Summarized question: ...\nAnswer: ...
  // Tolerates extra `**`, missing colons, no newlines.
  const re =
    /^\s*(?:\*+\s*)?(?:summarized\s+question|question)\s*:?\s*(?:\*+)?\s*([\s\S]*?)\s*(?:\*+\s*)?(?:answer)\s*:?\s*(?:\*+)?\s*([\s\S]*)$/i;
  const m = text.match(re);
  if (m) {
    const cleanInline = (s: string) =>
      s.replace(/^\s*\*{1,3}\s*/, "").replace(/\s*\*{1,3}\s*$/, "").trim();
    return { question: cleanInline(m[1]), answer: cleanInline(m[2]) };
  }

  // Answer-only marker
  const ansOnly = text.match(
    /^\s*(?:\*+)?\s*answer\s*:?\s*(?:\*+)?\s*([\s\S]*)$/i,
  );
  if (ansOnly) return { answer: ansOnly[1].trim() };

  return { answer: text };
};

// Small inline copy button used within the answer area
const InlineCopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title={label || "Copy"}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ml-1.5 text-[9px] font-bold bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all active:scale-95 shrink-0"
    >
      {copied ? (
        <><Check className="h-2.5 w-2.5 text-emerald-400" /><span className="text-emerald-400">OK</span></>
      ) : (
        <><Copy className="h-2.5 w-2.5" />{label && <span>{label}</span>}</>
      )}
    </button>
  );
};

/**
 * sanitizeStreamingMarkdown — removes unterminated markdown syntax characters
 * that appear mid-stream before the closing marker arrives. Prevents raw `**`,
 * `*`, `__`, `_` from flickering in the UI during progressive rendering.
 * Safe to apply to fully-completed text too (no-op on valid markdown).
 */
function sanitizeStreamingMarkdown(text: string): string {
  return (
    normalizeBulletParagraphs(
      text
        // Strip trailing lone ***/** / * or ___ / __ / _
        .replace(/(\*{1,3}|_{1,3})$/, "")
        // Strip trailing backtick sequences
        .replace(/`{1,3}$/, "")
        // Strip lone ** or * that appear on their own line (orphaned bold/italic markers)
        .replace(/^\s*\*{1,3}\s*$/gm, "")
        // Strip orphaned ** at the very beginning of the string before any word char
        .replace(/^\*{1,3}(?=\s|\n|$)/, "")
        // Collapse `**QUESTION:** ** Foo` → `**QUESTION:** Foo`
        .replace(/(\*\*\s*(?:QUESTION|ANSWER)\s*:?\s*\*\*)\s*\*{1,3}\s*/gi, "$1 ")
        // Drop the ===NEXT_QUESTION=== marker if it leaks through to the renderer
        .replace(/\n?={3,}NEXT_QUESTION={3,}\n?/g, "\n")
        .trimStart(),
    )
  );
}

/**
 * Converts paragraphs that mash multiple bullets together with `•` separators
 * into proper markdown list syntax (one `-` item per line).
 *
 * Handles both:
 *   "• a • b • c"            → "- a\n- b\n- c"
 *   "Some intro. • a • b"     → "Some intro.\n\n- a\n- b"
 *
 * Without this transform, `•`-separated bullets render as one long paragraph
 * with no spacing and no per-bullet copy buttons (the `<li>` renderer never
 * fires). With it, the existing list/li renderer + per-bullet copy buttons
 * work as designed.
 */
function normalizeBulletParagraphs(text: string): string {
  if (!text || !text.includes("•")) return text;
  return text
    .split(/\n{2,}/)
    .map((para) => {
      // Skip if this paragraph already contains real markdown list lines.
      if (/^\s*[-*]\s/m.test(para)) return para;
      if (!para.includes("•")) return para;

      // Split on ` • ` boundaries; first segment may be intro prose.
      const parts = para.split(/\s*•\s+/);
      if (parts.length < 2) return para;

      const intro = parts[0].trim();
      const items = parts.slice(1).map((s) => `- ${s.trim()}`).join("\n");
      return intro ? `${intro}\n\n${items}` : items;
    })
    .join("\n\n");
}

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
        // Apply streaming sanitizer to prevent raw markdown syntax during generation
        const displayText = resp.isStreaming
          ? sanitizeStreamingMarkdown(resp.text)
          : resp.text;
        const parsed = parseAIResponse(displayText);

        // Universal "Copy All" payload — always includes the question (when
        // present) followed by the answer, so users can paste a self-contained
        // Q&A snippet into notes / Slack / docs in one click.
        const copyAllPayload = parsed.question
          ? `Question:\n${parsed.question}\n\nAnswer:\n${parsed.answer}`
          : parsed.answer;

        return (
          <div
            key={resp.messageId}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            {/*
              Question section — rendered whenever the AI response contains a
              parsed question (always for AI Answer; sometimes for Analyze
              Screen). Hovering reveals an inline copy button that copies just
              the question text.  The transcript panel shows raw transcripts;
              this block shows the AI's *summarized* version so the user can
              copy the cleaned-up phrasing the AI is actually answering.
            */}
            {parsed.question && (
              <div className="mb-4 group/question">
                <div className="flex items-center gap-2 mb-1.5">
                  <HelpCircle className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-300">
                    Question
                  </span>
                  <span className="opacity-0 group-hover/question:opacity-100 transition-opacity">
                    <InlineCopyButton text={parsed.question} />
                  </span>
                </div>
                <div className="text-[15px] leading-snug font-bold text-white wrap-break-word">
                  {parsed.question}
                </div>
                {/* Horizontal divider separating Question from Answer */}
                <div className="mt-3 h-px w-full bg-white/15" />
              </div>
            )}

            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 fill-amber-400/20 text-amber-400 shrink-0" />
              <span className="text-[13.5px] font-bold text-white">
                Answer:
              </span>
              {!resp.isStreaming && parsed.answer && (
                <InlineCopyButton text={copyAllPayload} label="COPY ALL" />
              )}
            </div>

            {/* Markdown Content */}
            <div
              className={[
                "text-[13px] leading-relaxed font-medium text-white wrap-break-word",
                "[&_p]:mb-3 [&_p:last-child]:mb-0",
                "[&_ul]:pl-1 [&_ul]:mb-3 [&_ul]:space-y-2 [&_ul]:list-none",
                "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-2",
                "[&_li]:mb-0 [&_li]:marker:text-white/60",
                "[&_em]:text-amber-200 [&_em]:not-italic [&_em]:font-semibold",
                "[&_a]:text-blue-300 [&_a]:underline",
                "[&_blockquote]:border-l-2 [&_blockquote]:border-blue-400/50 [&_blockquote]:pl-3 [&_blockquote]:text-white/80 [&_blockquote]:italic",
                "[&_table]:w-full [&_table]:my-3 [&_table]:text-[12px] [&_table]:border-collapse",
                "[&_th]:border [&_th]:border-white/10 [&_th]:bg-white/5 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-bold",
                "[&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1",
              ].join(" ")}
            >
              {resp.isStreaming && !displayText.trim() ? (
                <div className="space-y-2 animate-pulse mt-2 py-1">
                  <div className="h-3.5 bg-white/10 rounded w-11/12" />
                  <div className="h-3.5 bg-white/10 rounded w-3/4" />
                  <div className="h-3.5 bg-white/10 rounded w-5/6" />
                </div>
              ) : (
                <>
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
                      li: ({ children }) => {
                        const text = (() => {
                          const extract = (node: any): string => {
                            if (typeof node === "string") return node;
                            if (Array.isArray(node)) return node.map(extract).join("");
                            if (node?.props?.children) return extract(node.props.children);
                            return "";
                          };
                          return extract(children);
                        })();
                        return (
                          <li className="mb-0 flex items-start gap-2 group/li">
                            <span
                              aria-hidden="true"
                              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300/80"
                            />
                            <span className="flex-1 min-w-0">{children}</span>
                            {text && (
                              <span className="opacity-0 group-hover/li:opacity-100 transition-opacity shrink-0 mt-0.5">
                                <InlineCopyButton text={text} />
                              </span>
                            )}
                          </li>
                        );
                      },
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
                    <span className="ml-1 inline-block h-3.5 w-0.5 bg-blue-400 animate-pulse align-middle" />
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// â”€â”€â”€ Main FloatingApp 

// Compresses the raw PNG data-URL from capture_screen (typically 5-15 MB) to a
// JPEG Blob of <= 1280 px wide at 65% quality (~200-400 KB) using the Canvas API.
// Drastically reduces upload payload and backend recompression overhead.
function compressScreenshotToBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX_WIDTH = 1280;
      const scale = Math.min(1, MAX_WIDTH / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2d context unavailable")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob returned null"))),
        "image/jpeg",
        0.65,
      );
    };
    img.onerror = () => reject(new Error("Failed to load screenshot image"));
    img.src = dataUrl;
  });
}

const FloatingApp: React.FC = () => {
  // ── Overlay settings (opacity / zoom / private mode) — stays local ────────
  // These have their own persistence via overlaySettings and are not Redux state.
  const [overlayOpacity, setOverlayOpacityState] = useState(() => getOpacity());
  const [overlayZoom, setOverlayZoomState] = useState(() => getZoom());
  const [overlayPrivate, setOverlayPrivateState] = useState(() => getPrivateMode());

  const setOverlayOpacity = useCallback((v: number) => { setOverlayOpacityState(v); saveOpacity(v); }, []);
  const setOverlayZoom    = useCallback((v: number) => { setOverlayZoomState(v);    saveZoom(v);    }, []);
  const setOverlayPrivate = useCallback((v: boolean) => {
    setOverlayPrivateState(v);
    savePrivateMode(v);
    invoke("toggle_content_protection", { protected: v }).catch(console.error);
  }, []);

  // Ref for safe zoom measurement (points to the FloatingSurface root).
  const floatRootRef = useRef<HTMLDivElement>(null);
  const isPrivateLockedRef = useRef(false);

  const { safeMin: floatSafeMin, safeMax: floatSafeMax } = useSafeZoom(
    floatRootRef,
    overlayZoom,
    setOverlayZoom,
    true,
  );

  useOverlayShortcuts({
    opacity: overlayOpacity, setOpacity: setOverlayOpacity,
    zoom: overlayZoom,       setZoom: setOverlayZoom,
    privateMode: overlayPrivate, setPrivateMode: setOverlayPrivate,
    safeZoomMin: floatSafeMin,
    safeZoomMax: floatSafeMax,
    isPrivateLocked: isPrivateLockedRef.current,
  });

  // ── Session business logic — delegated to Redux-backed hook ───────────────
  const session = useFloatingSession();

  // Keep private-mode lock in sync with whether a session is active
  isPrivateLockedRef.current = !!session.sessionInfo;

  // ── Click-through passthrough (Layer 1 = fullscreen, Layer 2 = widget) ────
  // Identical pattern to the launcher window. Polls cursor position at ~30fps
  // and calls setIgnoreCursorEvents based on [data-interactive] hit-testing.
  // The mini overlay never uses custom mouse drag, so isDraggingRef is always false.
  const isDraggingRef = useRef(false);
  useCursorPassthrough({ isDraggingRef });

  // ── CSS-based widget drag (fullscreen window stays fixed; widget moves inside it)
  const [widgetPos, setWidgetPos] = useState<{ top: number; left: number } | null>(null);
  const layer2Ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startMouseX: number; startMouseY: number;
    startLeft: number;  startTop: number;
    widgetW: number;    widgetH: number;
  } | null>(null);

  // Re-clamp position if the monitor layout changes while the app is open.
  useEffect(() => {
    const onResize = () => {
      setWidgetPos((prev) => {
        if (!prev) return prev;
        const rect = layer2Ref.current?.getBoundingClientRect();
        const w = rect?.width ?? 0;
        const h = rect?.height ?? 0;
        const { x, y } = clampToScreen(prev.left, prev.top, w, h, false);
        return x === prev.left && y === prev.top ? prev : { left: x, top: y };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleGripMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const rect = layer2Ref.current?.getBoundingClientRect();
    if (!rect) { isDraggingRef.current = false; return; }
    dragRef.current = {
      startMouseX: e.clientX, startMouseY: e.clientY,
      startLeft: rect.left,   startTop: rect.top,
      widgetW: rect.width,    widgetH: rect.height,
    };
    const onMouseMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const rawLeft = d.startLeft + (ev.clientX - d.startMouseX);
      const rawTop  = d.startTop  + (ev.clientY - d.startMouseY);
      // Clamp on every frame — widget stays reachable even near screen edges.
      const { x, y } = clampToScreen(rawLeft, rawTop, d.widgetW, d.widgetH);
      setWidgetPos({ left: x, top: y });
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      dragRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
  }, []);


  // ── Keyboard shortcuts (must live here so they fire with no element focused)
  // Cmd/Ctrl+G → AI Answer  |  Cmd/Ctrl+K → Analyze Screen
  const handleAiAnswerClickRef = useRef(session.handleAiAnswerClick);
  const handleAnalyzeScreenCaptureRef = useRef<() => void>(() => {});
  handleAiAnswerClickRef.current = session.handleAiAnswerClick;

  // Local "is the screen-capture phase running" flag.  The hook's `isCapturing`
  // only flips AFTER the screenshot has already been captured + compressed —
  // those steps can take 1-3 seconds, during which the user sees no feedback
  // on the Analyze Screen button.  We flip this immediately on click so the
  // button shows the spinner the moment it is pressed.
  const [isCapturePhase, setIsCapturePhase] = useState(false);

  // Capture + compress screenshot, then delegate to hook
  const handleAnalyzeScreenCapture = useCallback(async () => {
    if (session.isAnalyzing || session.isAnswering || isCapturePhase) return;
    setIsCapturePhase(true);
    // Open the responses panel immediately so the "Capturing screen…" loader
    // is visible from the very first click.
    session.expandResponses();
    try {
      const screenshotData = await invoke<string>("capture_screen");
      const blob = await compressScreenshotToBlob(screenshotData);
      await session.handleAnalyzeScreenClick(blob);
    } catch (err) {
      console.error("Failed to capture screen:", err);
      const { toast } = await import("sonner");
      toast.error("Failed to capture screen");
    } finally {
      setIsCapturePhase(false);
    }
  }, [session, isCapturePhase]);
  handleAnalyzeScreenCaptureRef.current = handleAnalyzeScreenCapture;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleAiAnswerClickRef.current();
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        void handleAnalyzeScreenCaptureRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Layer 1 + Layer 2 layout ──────────────────────────────────────────────
  //
  // Layer 1: fullscreen transparent overlay div (pointer-events: none).
  //          Spans the entire native window (which show_mini_top_center now
  //          sizes to the full monitor). Empty areas are click-through.
  //
  return (
    <TooltipProvider delayDuration={0}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background: "transparent",
          overflow: "visible",
          userSelect: "none",
        }}
      >
        {/* ── Layer 2: widget shell — sized to content, draggable ─────────── */}
        <div
          ref={layer2Ref}
          data-interactive
          style={{
            position: "absolute",
            // Use stored position after drag; fall back to centered at top.
            top:       widgetPos?.top ?? 10,
            left:      widgetPos ? widgetPos.left : "50%",
            transform: widgetPos ? "none" : "translateX(-50%)",
            pointerEvents: "auto",
            // Width tracks badge vs full widget so useCursorPassthrough
            // hit-tests the correct region and transparent gaps stay click-through.
            width: session.isWindowCollapsed ? 180 : 700,
          }}
        >
          {/* ── Collapsed badge view ─────────────────────────────────────── */}
          {session.isWindowCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={session.expandWindow}
                  style={{ height: 36 }}
                  className="w-full flex items-center justify-center gap-2.5 px-3 bg-zinc-950/90 backdrop-blur-2xl rounded-xl border border-white/8 hover:border-blue-500/30 hover:bg-zinc-900/95 transition-all active:scale-95 group"
                >
                  <div className="shrink-0 w-5 h-5 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.4)]">
                    <span className="text-[10px] font-black text-white leading-none">S</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full transition-colors",
                      session.isMicActive || session.isTabActive
                        ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse"
                        : "bg-blue-400/60 animate-pulse",
                    )} />
                  </div>
                  <span className="text-[11px] font-semibold text-white/60 group-hover:text-white/90 transition-colors tracking-tight">
                    ScribeShade
                  </span>
                  {session.aiResponses.length > 0 && (
                    <span className="shrink-0 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500/25 border border-blue-500/40 text-[9px] font-bold text-blue-300">
                      {session.aiResponses.length}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Expand ScribeShade</TooltipContent>
            </Tooltip>
          ) : (
            /* ── Expanded widget view ──────────────────────────────────────── */
            <FloatingSurface
              opacity={overlayOpacity}
              zoom={overlayZoom}
              divRef={floatRootRef}
            >
              <Toaster
                position="top-center"
                theme="dark"
                toastOptions={{ style: { fontSize: "12px" } }}
              />

      {/* Top Card: Controls */}
      <div className="shrink-0">
        {/* Header */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-white/5 relative group/header cursor-default no-drag">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 drag">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                  ScribeShade
                </TooltipContent>
              </Tooltip>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="p-1 rounded bg-white/25 text-white/20 group-hover/header:text-white/40 cursor-grab active:cursor-grabbing transition-colors select-none"
                  onMouseDown={handleGripMouseDown}
                >
                  <GripHorizontal size={14} className="pointer-events-none" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                Drag to move
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <div className="scale-90 origin-right">
              <ModelSelector
                value={session.selectedModel}
                onChange={session.onModelChange}
                isFullscreen={true}
              />
            </div>

            <div className="flex items-center gap-2 bg-white/5 px-3 h-9 rounded-xl border border-white/10 shadow-inner transition-all hover:bg-white/10 group">
              <Clock className="h-3.5 w-3.5 text-blue-400 group-hover:animate-pulse" />
              <span className="text-[13px] font-mono font-bold text-white/90 tabular-nums tracking-tight">
                {session.formattedTime || "00:00"}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 h-9">
              <SessionMenu
                opacity={overlayOpacity}
                setOpacity={setOverlayOpacity}
                zoom={overlayZoom}
                setZoom={setOverlayZoom}
                privateMode={overlayPrivate}
                setPrivateMode={setOverlayPrivate}
                safeMin={floatSafeMin}
                safeMax={floatSafeMax}
                onEndSession={session.endSession}
                sessionActive={!!session.sessionInfo}
              />

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={session.collapseWindow}
                    className="p-2 hover:bg-white/10 rounded-lg transition-all text-zinc-300 hover:text-blue-400 active:scale-95 flex items-center justify-center"
                  >
                    <ChevronDown size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                  Collapse to Icon
                </TooltipContent>
              </Tooltip>

              <div className="w-px h-4 bg-white/10 mx-0.5" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={session.endSession}
                    disabled={session.isEnding}
                    className={cn(
                      "p-2 rounded-lg transition-all flex items-center justify-center",
                      session.isEnding
                        ? "bg-rose-500/20 text-rose-400 cursor-not-allowed"
                        : "text-zinc-300 hover:bg-rose-500/10 hover:text-rose-400 active:scale-95",
                    )}
                  >
                    <LogOut size={16} className={session.isEnding ? "animate-pulse" : ""} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                  End Session
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Live Monitor Row */}
        <div className="px-4 py-2 flex items-center justify-between bg-white/2 border-b border-white/5">
          <div className="flex-1 flex items-center gap-2 overflow-hidden mr-3">
            <div className="flex gap-1 shrink-0">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                session.isMicConnecting
                  ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                  : session.isMicActive
                    ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    : "bg-white/20",
              )} />
              <div className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                session.isTabConnecting
                  ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                  : session.isTabActive
                    ? "bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                    : "bg-white/20",
              )} />
            </div>

            <div className="flex-1 truncate text-[12px] font-medium text-white italic">
              {session.isEnding ? (
                <span className="text-rose-400 font-bold animate-pulse">Ending Session...</span>
              ) : !session.sessionInfo ? (
                <span className="text-white/20 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin shrink-0" />
                  Waiting for session...
                </span>
              ) : session.lastTranscriptLine || session.interimTranscript ? (
                <>
                  {session.lastTranscriptLine && (
                    <span className={cn(
                      "font-bold mr-1.5 text-[9px] uppercase tracking-wider not-italic",
                      session.lastTranscriptSender === "User" ? "text-blue-400" : "text-purple-400",
                    )}>
                      {session.lastTranscriptSender === "User" ? "You •" : "System •"}
                    </span>
                  )}
                  {session.lastTranscriptLine}
                  {session.interimTranscript && (
                    <span className="text-white/30 ml-1">{session.interimTranscript}</span>
                  )}
                </>
              ) : session.tabStatus === "error" ? (
                <span className="flex items-center gap-2 text-rose-300/90">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[11px] font-semibold truncate max-w-[260px] cursor-default">
                        {session.tabError ?? "System audio unavailable"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px]">
                      {session.tabError ?? "System audio unavailable"}
                    </TooltipContent>
                  </Tooltip>
                  <button
                    type="button"
                    onClick={() => { void session.startSystemAudio(); }}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => { invoke("open_screen_recording_settings").catch(() => {}); }}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors"
                  >
                    Open Settings
                  </button>
                </span>
              ) : (
                <span className="text-white/20">
                  {session.isMicActive ? "Listening for speech..." : "Waiting for audio..."}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={session.toggleTranscriptExpanded}
                  disabled={!session.sessionInfo || session.messages.length === 0}
                  className={cn(
                    "p-2 rounded-xl transition-all active:scale-95 border",
                    session.isTranscriptExpanded
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : "bg-white/10 text-zinc-300 border-white/10 hover:bg-blue-500/10 hover:text-blue-400",
                    (!session.sessionInfo || session.messages.length === 0) && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <AlignJustify size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                {session.isTranscriptExpanded ? "Hide Transcript" : "Show Transcript"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={session.handleToggleMic}
                  disabled={!session.sessionInfo}
                  className={cn(
                    "p-2 rounded-xl transition-all active:scale-95 border",
                    session.isMicActive
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : "bg-white/10 text-zinc-300 border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400",
                    !session.sessionInfo && "opacity-40 cursor-not-allowed",
                  )}
                >
                  {session.isMicConnecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : session.isMicActive ? (
                    <Mic size={14} />
                  ) : (
                    <MicOff size={14} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                {session.isMicActive ? "Disable Mic" : "Enable Mic (optional)"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={session.handleClearTranscript}
                  disabled={!session.sessionInfo}
                  className={cn(
                    "p-2 rounded-xl bg-white/10 text-zinc-300 border border-white/10 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30 transition-all active:scale-95 flex items-center justify-center",
                    !session.sessionInfo && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <Trash2 size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                Clear Transcript
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Collapsible Transcript Panel */}
        {session.isTranscriptExpanded && (
          <SessionTranscript
            messages={session.messages}
            micInterim={session.micInterimTranscript}
            tabInterim={session.tabInterimTranscript}
          />
        )}

        {/* Action Bar */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <ChatActionButtons
            onAiAnswer={session.handleAiAnswerClick}
            onAnalyzeScreen={() => { void handleAnalyzeScreenCapture(); }}
            isAnswering={session.isAnswering}
            isAnalyzing={session.isAnalyzing || session.isCapturing || isCapturePhase}
            canAnswer={!!session.sessionInfo && session.messages.length > 0}
            canAnalyze={!!session.sessionInfo}
            isFullscreen={true}
          />
          <div className="relative flex-1">
            <input
              className="w-full h-10 rounded-xl pl-4 pr-12 text-sm font-medium bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
              placeholder="Ask AI anything..."
              value={session.inputValue}
              onChange={(e) => session.setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void session.handleSend();
                }
              }}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { void session.handleSend(); }}
                  disabled={!session.inputValue.trim() || !session.sessionInfo}
                  className="absolute right-1 top-1 h-8 w-10 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 flex items-center justify-center text-white transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                >
                  <Send size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                Send Message
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* AI Responses Panel */}
      {(session.isAnswering || session.isAnalyzing || isCapturePhase || session.aiResponses.length > 0) && (
        <div className="flex flex-col border-t border-white/10">
          {(() => {
            // Clamp the Redux index to the current React array length so we
            // never access aiResponses[undefined] when Redux races ahead of
            // the React state update (root cause of blank panel / wrong counter).
            const safeIndex = session.aiResponses.length > 0
              ? Math.min(session.currentResponseIndex, session.aiResponses.length - 1)
              : 0;
            const currentResponse = session.aiResponses[safeIndex];

            return (
              <>
                <div className="px-3 py-2 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={session.goToPrevResponse}
                      disabled={safeIndex === 0 || session.aiResponses.length === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition-all active:scale-95"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={session.goToNextResponse}
                      disabled={safeIndex >= session.aiResponses.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition-all active:scale-95"
                    >
                      <ChevronRight size={14} />
                    </button>
                    {session.aiResponses.length > 1 && (
                      <span className="text-[11px] text-white/40 ml-1 font-mono">
                        {safeIndex + 1}/{session.aiResponses.length}
                      </span>
                    )}
                    {(session.isAnswering || session.isAnalyzing || isCapturePhase) && session.aiResponses.length === 0 && (
                      <span className="flex items-center gap-1.5 ml-1 text-[11px] text-blue-400/80">
                        <Loader2 size={11} className="animate-spin" />
                        {isCapturePhase ? "Capturing screen..." : "Generating..."}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() =>
                            void session.handleRegenerateResponse(
                              currentResponse?.id ?? "",
                            )
                          }
                          disabled={
                            !currentResponse?.id ||
                            session.isAnswering ||
                            session.isAnalyzing ||
                            isCapturePhase
                          }
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed text-white transition-all active:scale-95"
                        >
                          <RotateCcw size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                        Regenerate answer
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={session.toggleResponsesExpanded}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-blue-400 text-white/50 transition-all active:scale-95"
                        >
                          {session.isResponsesExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="bg-slate-900 border-white/10 text-white font-medium text-[11px]">
                        {session.isResponsesExpanded ? "Collapse" : "Expand"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {session.isResponsesExpanded && session.aiResponses.length > 0 && (
                  <div className="border-t border-white/10 max-h-120 overflow-y-auto overflow-x-hidden no-scrollbar">
                    <AnswerArea
                      responses={[
                        {
                          messageId: currentResponse?.id ?? "",
                          text: currentResponse?.text ?? "",
                          isStreaming:
                            safeIndex === session.aiResponses.length - 1 &&
                            (session.isAnswering || session.isAnalyzing),
                        },
                      ].filter((r) => r.messageId)}
                      isStreaming={session.isAnswering || session.isAnalyzing}
                    />
                  </div>
                )}
              </>
            );
          })()}

          {session.isResponsesExpanded &&
            (session.isAnswering || session.isAnalyzing || isCapturePhase) &&
            session.aiResponses.length === 0 && (
              <div className="flex items-center justify-center py-8 gap-2 text-blue-400/70">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[13px] font-medium">
                  {isCapturePhase
                    ? "Capturing screen..."
                    : session.isAnalyzing
                      ? "Analyzing screen..."
                      : "Generating response..."}
                </span>
              </div>
            )}
        </div>
      )}
        </FloatingSurface>
        )}
      </div>
    </div>
  </TooltipProvider>
  );
};

// Mount the app — Provider required for useFloatingSession (Redux)
const rootElement = document.getElementById("mini-app-root");
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <Provider store={store}>
        {PUBLISHABLE_KEY ? (
          <ClerkProvider
            publishableKey={PUBLISHABLE_KEY}
            allowedRedirectProtocols={["tauri:", "http:", "https:"]}
          >
            <TooltipProvider delayDuration={0}>
              <FloatingApp />
            </TooltipProvider>
          </ClerkProvider>
        ) : (
          <TooltipProvider delayDuration={0}>
            <FloatingApp />
          </TooltipProvider>
        )}
      </Provider>
    </React.StrictMode>,
  );
}
