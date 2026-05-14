import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "../Transcript";
import { cn } from "@/lib/utils";
import { Copy, Check, MessageSquare, Sparkles, Terminal, RefreshCw } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  prism,
} from "react-syntax-highlighter/dist/esm/styles/prism";

const CopyButton = ({
  text,
  label,
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof text === "string") {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center justify-center p-1.5 rounded-md transition-all active:scale-95",
        "bg-white hover:bg-slate-50 text-slate-400 border border-slate-200 shadow-sm",
        className,
      )}
      title={label ? `Copy ${label}` : "Copy"}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
};

const CodeBlock = ({
  children,
  isFullscreen,
  language,
}: {
  children: any;
  isFullscreen: boolean;
  language?: string;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text =
      children?.[0]?.props?.children || children?.props?.children || children;
    const finalContent = Array.isArray(text) ? text.join("") : text;

    if (typeof finalContent === "string") {
      navigator.clipboard.writeText(finalContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden my-4 border",
        isFullscreen
          ? "bg-black/40 border-white/10"
          : "bg-slate-50/50 border-slate-200",
      )}
    >
      <div
        className={cn(
          "px-3 py-1.5 flex items-center justify-between border-b",
          isFullscreen
            ? "bg-white/5 border-white/10"
            : "bg-slate-100/50 border-slate-200",
        )}
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            {language || "code"}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="p-1 hover:bg-slate-200 rounded transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>
      </div>
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
};

export const ChatMessage = ({
  message,
  isStreaming,
  isFullscreen = false,
  onRegenerate,
}: ChatMessageProps) => {
  const isAI = message.sender !== "User";

  // ── Sanitization: strip stray markdown artifacts ─────────────────────────
  // The model emits `**QUESTION:** ... **ANSWER:** ...` blocks. During and
  // after streaming we may see leftover `**` artifacts:
  //   - lone trailing `*` / `**` while the closing marker hasn't arrived
  //   - orphan `**` lines (e.g. `**\nQUESTION:` → renders as literal `**`)
  //   - duplicated `**` inside the question text (`**QUESTION:** ** Foo? **`)
  //   - leading `**` line at the start of a segment
  //   - bullet runs collapsed to inline `• a • b • c` paragraphs
  const sanitize = (raw: string): string => {
    if (!raw) return raw;
    let out = raw;
    // Drop a lone trailing `**` or `*` left over from in-flight streaming
    out = out.replace(/\*{1,2}\s*$/g, "");
    // Strip lines that are JUST `**` or `*` (orphaned bold markers on their own line)
    out = out.replace(/^\s*\*{1,3}\s*$/gm, "");
    // Strip `**` immediately after `**QUESTION:**` / `**ANSWER:**` markers
    // (catches `**QUESTION:** ** Foo?` patterns)
    out = out.replace(/(\*\*(?:QUESTION|ANSWER):\*\*)\s*\*{1,3}\s*/gi, "$1 ");
    // Strip trailing `**` immediately before EOL on a question/answer line
    out = out.replace(/\s*\*{1,3}\s*$/gm, "");
    // Remove orphaned `**` (odd count on a single line) — drop the LAST one
    out = out
      .split("\n")
      .map((line) => {
        const count = (line.match(/\*\*/g) || []).length;
        if (count % 2 === 1) {
          const idx = line.lastIndexOf("**");
          return line.slice(0, idx) + line.slice(idx + 2);
        }
        return line;
      })
      .join("\n");
    // Convert inline `• a • b • c` paragraphs into proper markdown lists so
    // the existing <ul>/<li> renderer (with per-bullet copy buttons) fires.
    if (out.includes("•")) {
      out = out
        .split(/\n{2,}/)
        .map((para) => {
          if (/^\s*[-*]\s/m.test(para)) return para;
          if (!para.includes("•")) return para;
          const parts = para.split(/\s*•\s+/);
          if (parts.length < 2) return para;
          const intro = parts[0].trim();
          const items = parts.slice(1).map((s) => `- ${s.trim()}`).join("\n");
          return intro ? `${intro}\n\n${items}` : items;
        })
        .join("\n\n");
    }
    // Collapse leading whitespace/blank lines so the QUESTION block is the
    // visual anchor of the card.
    out = out.replace(/^\s+/, "");
    return out;
  };

  const cleanText = sanitize(message.text);

  // ── Multi-question handling ──────────────────────────────────────────────
  // Server-stream splitting now happens upstream in useAIChat: when the model
  // emits `===NEXT_QUESTION===`, the consumer spawns a NEW Message record per
  // segment instead of producing one giant pager. So at this layer we just
  // strip any leftover separator (defensive — should never appear) and treat
  // each Message as exactly one Q/A.
  const currentText = cleanText.replace(/\n?={3,}NEXT_QUESTION={3,}\n?/g, "\n");

  // Parse Question and Answer if markers exist. Question matcher tolerates a
  // missing closing `**` while streaming; answer matcher consumes the rest.
  const questionMatch = currentText.match(
    /\*\*\s*QUESTION\s*:?\s*\*?\*?\s*([\s\S]*?)\s*(?=\*\*\s*ANSWER\s*:|$)/i,
  );
  const answerMatch = currentText.match(/\*\*\s*ANSWER\s*:?\s*\*?\*?\s*([\s\S]*)/i);

  // Strip residual `**`/`*` and surrounding punctuation noise from extracted
  // question text (e.g. `** Difference between... ?**` → `Difference between...?`).
  const cleanInline = (s: string) =>
    s
      .replace(/^\s*\*{1,3}\s*/, "")
      .replace(/\s*\*{1,3}\s*$/, "")
      .trim();

  const displayQuestion = questionMatch ? cleanInline(questionMatch[1]) : "";
  const displayAnswer = answerMatch
    ? answerMatch[1].trim()
    : questionMatch
      ? ""
      : currentText;

  if (!isAI) {
    return (
      <div className="mb-6 flex justify-end">
        <div className="bg-slate-100 rounded-2xl px-4 py-2 max-w-[80%] text-[14px] text-slate-700 shadow-sm border border-slate-200/50">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 animate-in fade-in slide-in-from-bottom-2">
      {/* Question Section — large, bold, with horizontal divider beneath */}
      {displayQuestion && (
        <div className="group/ques relative mb-5">
          <div className="flex items-start gap-3">
            <div className="mt-1 shrink-0 text-brand">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="flex-1 pr-10 min-w-0">
              <div
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.12em] mb-1",
                  isFullscreen ? "text-brand/80" : "text-brand",
                )}
              >
                Question
              </div>
              <div
                className={cn(
                  "text-[17px] leading-snug font-bold break-words",
                  isFullscreen ? "text-white" : "text-slate-900",
                )}
              >
                {displayQuestion}
              </div>
            </div>
            <CopyButton
              text={displayQuestion}
              label="Question"
              className="absolute top-1 right-0 opacity-0 group-hover/ques:opacity-100"
            />
          </div>
          {/* Horizontal divider visually separating Question from Answer */}
          <div
            className={cn(
              "mt-4 h-px w-full",
              isFullscreen ? "bg-white/15" : "bg-slate-200",
            )}
          />
        </div>
      )}

      {/* Answer Section */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 text-brand">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1">
          <div className="group/ansheader relative flex items-center justify-between mb-3">
            <div className={cn(
              "text-[14.5px] font-bold",
              isFullscreen ? "text-white" : "text-slate-900"
            )}>
              Answer:
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover/ansheader:opacity-100">
              {onRegenerate && !isStreaming && (
                <button
                  onClick={onRegenerate}
                  className={cn(
                    "flex items-center justify-center p-1.5 rounded-md transition-all active:scale-95",
                    isFullscreen
                      ? "bg-white/10 hover:bg-white/20 text-white/60 border border-white/20"
                      : "bg-white hover:bg-slate-50 text-slate-400 border border-slate-200 shadow-sm"
                  )}
                  title="Regenerate answer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
              <CopyButton
                text={displayAnswer}
                label="Full Answer"
              />
            </div>
          </div>

          <div
            className={cn(
              "text-[14.5px] leading-relaxed font-normal tracking-tight",
              isFullscreen ? "text-slate-100" : "text-slate-700",
              "selection:bg-brand/10",
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => {
                  const textContent = String(children);
                  return (
                    <div className={cn(
                      "group/p relative flex items-start gap-3 mb-4 last:mb-0 -ml-8 px-2 rounded-md transition-colors",
                      isFullscreen ? "hover:bg-white/5" : "hover:bg-slate-50/50"
                    )}>
                      <div className="w-8 shrink-0 flex items-center justify-center h-6 relative">
                        <CopyButton
                          text={textContent}
                          className="absolute inset-0 m-auto h-6 w-6 opacity-0 group-hover/p:opacity-100"
                        />
                      </div>
                      <p className="flex-1">{children}</p>
                    </div>
                  );
                },
                ul: ({ children }) => (
                  <ul className="mb-4 space-y-4 list-none">{children}</ul>
                ),
                li: ({ children }) => {
                  const [copied, setCopied] = useState(false);
                  const textContent = Array.isArray(children)
                    ? children
                        .map((c) =>
                          typeof c === "string"
                            ? c
                            : (c as any)?.props?.children || "",
                        )
                        .join("")
                    : typeof children === "string"
                      ? children
                      : "";

                  const handleCopy = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(textContent);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  };

                  return (
                    <li className={cn(
                      "group/li flex items-start gap-2 py-1 relative -ml-8 px-2 rounded-md transition-colors",
                      isFullscreen ? "hover:bg-white/5" : "hover:bg-slate-50/50"
                    )}>
                      <div className="w-8 shrink-0 flex items-center justify-center h-6 relative">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover/li:opacity-0 transition-opacity" />
                        <button
                          onClick={handleCopy}
                          className={cn(
                            "absolute inset-0 m-auto flex items-center justify-center h-6 w-6 border rounded-md shadow-sm opacity-0 group-hover/li:opacity-100 transition-all",
                            isFullscreen
                              ? "bg-white/10 border-white/20 hover:bg-white/20"
                              : "bg-white border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          {copied ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className={cn("h-3 w-3", isFullscreen ? "text-white/60" : "text-slate-400")} />
                          )}
                        </button>
                      </div>
                      <div className={cn(
                        "flex-1 leading-relaxed pt-0.5",
                        isFullscreen ? "text-slate-100" : "text-slate-700"
                      )}>
                        {children}
                      </div>
                    </li>
                  );
                },
                strong: ({ children }) => (
                  <strong className={cn(
                    "font-bold",
                    isFullscreen ? "text-white" : "text-slate-900"
                  )}>
                    {children}
                  </strong>
                ),
                code(props) {
                  const { children, className, node, ...rest } = props as any;
                  const match = /language-(\w+)/.exec(className || "");

                  if (!match) {
                    return (
                      <code
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[13px] font-mono font-medium bg-slate-100 text-slate-800",
                          isFullscreen && "bg-white/10 text-slate-200",
                        )}
                      >
                        {children}
                      </code>
                    );
                  }

                  return (
                    <CodeBlock isFullscreen={isFullscreen} language={match[1]}>
                      <SyntaxHighlighter
                        {...rest}
                        PreTag="div"
                        children={String(children).replace(/\n$/, "")}
                        language={match[1]}
                        style={isFullscreen ? vscDarkPlus : prism}
                        customStyle={{
                          margin: 0,
                          background: "transparent",
                          padding: "1.25rem",
                          fontSize: "13px",
                          lineHeight: "1.6",
                          borderRadius: "0",
                        }}
                      />
                    </CodeBlock>
                  );
                },
              }}
            >
              {displayAnswer}
            </ReactMarkdown>
            {isStreaming && (
              <span className="ml-1 inline-block h-4 w-1.5 bg-brand/60 animate-pulse rounded-full align-middle" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ChatMessageProps {
  message: Message;
  isStreaming: boolean;
  isFullscreen?: boolean;
  onRegenerate?: () => void;
}
