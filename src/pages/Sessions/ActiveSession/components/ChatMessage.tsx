import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "../Transcript";
import { cn } from "@/lib/utils";
import { Copy, Check, MessageSquare, Sparkles, Terminal } from "lucide-react";
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
}: ChatMessageProps) => {
  const isAI = message.sender !== "User";

  // Parse Question and Answer if markers exist
  const questionMatch = message.text.match(
    /\*\*QUESTION:\*\*\s*([\s\S]*?)\s*(?=\*\*ANSWER:\*\*|$)/i,
  );
  const answerMatch = message.text.match(/\*\*ANSWER:\*\*\s*([\s\S]*)/i);

  const displayQuestion = questionMatch ? questionMatch[1].trim() : "";
  const displayAnswer = answerMatch
    ? answerMatch[1].trim()
    : questionMatch
      ? ""
      : message.text;

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
      {/* Question Section */}
      {displayQuestion && (
        <div className="group/ques relative mb-5 flex items-start gap-2.5">
          <div className="mt-0.5 shrink-0 text-slate-400">
            <MessageSquare className="h-4.5 w-4.5" />
          </div>
          <div className="flex-1 text-[14.5px] leading-relaxed pr-10">
            <span className="font-bold text-slate-900 mr-1.5">Question:</span>
            <span className="text-slate-700">{displayQuestion}</span>
          </div>
          <CopyButton
            text={displayQuestion}
            label="Question"
            className="absolute top-0 right-0 opacity-0 group-hover/ques:opacity-100"
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
            <div className="text-[14.5px] font-bold text-slate-900">
              Answer:
            </div>
            <CopyButton
              text={displayAnswer}
              label="Full Answer"
              className="absolute top-0 right-0 opacity-0 group-hover/ansheader:opacity-100"
            />
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
                    <div className="group/p relative flex items-start gap-3 mb-4 last:mb-0 -ml-8 px-2 rounded-md hover:bg-slate-50/50 transition-colors">
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
                    <li className="group/li flex items-start gap-2 py-1 relative -ml-8 px-2 rounded-md hover:bg-slate-50/50 transition-colors">
                      <div className="w-8 shrink-0 flex items-center justify-center h-6 relative">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover/li:opacity-0 transition-opacity" />
                        <button
                          onClick={handleCopy}
                          className="absolute inset-0 m-auto flex items-center justify-center h-6 w-6 bg-white border border-slate-200 rounded-md shadow-sm opacity-0 group-hover/li:opacity-100 hover:bg-slate-50 transition-all"
                        >
                          {copied ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-slate-400" />
                          )}
                        </button>
                      </div>
                      <div className="flex-1 text-slate-700 leading-relaxed pt-0.5">
                        {children}
                      </div>
                    </li>
                  );
                },
                strong: ({ children }) => (
                  <strong className="font-bold text-slate-900 dark:text-white">
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
}
