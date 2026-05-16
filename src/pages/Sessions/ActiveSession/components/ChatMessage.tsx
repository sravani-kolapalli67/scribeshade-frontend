import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "../Transcript";
import { cn } from "@/lib/utils";
import { Copy, Check, MessageSquare, Star, Terminal, RefreshCw } from "lucide-react";
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

  const sanitize = (raw: string): string => {
    if (!raw) return raw;
    let out = raw;
    out = out.replace(/\*{1,2}\s*$/g, "");
    out = out.replace(/^\s*\*{1,3}\s*$/gm, "");
    out = out.replace(/(\*\*(?:QUESTION|ANSWER):\*\*)\s*\*{1,3}\s*/gi, "$1 ");
    out = out.replace(/\s*\*{1,3}\s*$/gm, "");
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
    out = out.replace(/^\s+/, "");
    return out;
  };

  const cleanText = sanitize(message.text);
  const currentText = cleanText.replace(/\n?={3,}NEXT_QUESTION={3,}\n?/g, "\n");

  const questionMatch = currentText.match(
    /\*\*\s*QUESTION\s*:?\s*\*?\*?\s*([\s\S]*?)\s*(?=\*\*\s*ANSWER\s*:|$)/i,
  );
  const answerMatch = currentText.match(/\*\*\s*ANSWER\s*:?\s*\*?\*?\s*([\s\S]*)/i);

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
      {displayQuestion && (
        <div className="group/ques relative mb-4">
          <div className="flex items-start gap-2 text-slate-800">
            <div className="mt-1 shrink-0 text-slate-400">
              <MessageSquare className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 pr-10">
              <span className="font-bold text-[15px] mr-1.5">Question:</span>
              <span className="text-[15px] leading-relaxed font-medium">
                {displayQuestion}
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(displayQuestion);
              }}
              className="absolute top-0.5 right-0 opacity-0 group-hover/ques:opacity-100 transition-opacity p-1 hover:bg-slate-100 rounded text-slate-400"
              title="Copy question"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 mb-2">
        <div className="mt-1 shrink-0">
          <Star className="h-4.5 w-4.5 fill-amber-400 text-amber-400" />
        </div>
        <div className="flex-1">
          <div className="group/ansheader relative flex items-center justify-between mb-2">
            <div className="font-bold text-[15px] text-slate-900">
              Answer:
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover/ansheader:opacity-100 transition-opacity">
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
              "text-[15px] leading-relaxed text-slate-800",
              isFullscreen ? "text-slate-100" : "text-slate-800",
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="mb-4 last:mb-0 leading-relaxed text-slate-700">{children}</p>
                ),
                ol: ({ children }) => (
                  <ol className="mb-6 space-y-6 list-none">{children}</ol>
                ),
                ul: ({ children }) => (
                  <ul className="mb-4 mt-2 space-y-2 list-none">{children}</ul>
                ),
                li: ({ children, ordered }: any) => {
                  const [copied, setCopied] = useState(false);
                  const textContent = Array.isArray(children)
                    ? children.map(c => typeof c === 'string' ? c : (c as any)?.props?.children || '').join('')
                    : String(children);

                  const handleCopy = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(textContent);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  };

                  if (ordered) {
                    return (
                      <li className="group/li relative -ml-8 pl-8 mb-4 last:mb-0">
                        <div className="absolute left-0 top-0.5 opacity-0 group-hover/li:opacity-100 transition-opacity">
                          <button
                            onClick={handleCopy}
                            className="p-1 hover:bg-slate-100 rounded border border-slate-200 bg-white shadow-sm transition-all active:scale-95"
                          >
                            {copied ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3 text-slate-400" />
                            )}
                          </button>
                        </div>
                        <div className="font-bold text-slate-900 leading-snug text-[15.5px]">
                          {children}
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li className="flex items-start gap-3 group/bul mb-2 last:mb-0">
                      <div className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <div className="flex-1 text-[14px] leading-relaxed text-slate-700">{children}</div>
                      <button
                        onClick={handleCopy}
                        className="opacity-0 group-hover/bul:opacity-100 transition-opacity p-0.5 hover:bg-slate-100 rounded text-slate-400"
                      >
                        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
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
