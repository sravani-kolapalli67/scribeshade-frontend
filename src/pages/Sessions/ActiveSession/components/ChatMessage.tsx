import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "../Transcript";
import { cn } from "@/lib/utils";
import { Copy, Check, User } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, prism } from "react-syntax-highlighter/dist/esm/styles/prism";


interface ChatMessageProps {
  message: Message;
  isStreaming: boolean;
  isFullscreen?: boolean;
}

function Bot(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

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
    // Extract text from children
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
        "rounded-xl overflow-hidden mb-6 border shadow-md",
        isFullscreen
          ? "bg-black/60 border-white/10"
          : "bg-[#FAFAFA] border-slate-200",
      )}
    >
      {/* Code Header */}
      <div
        className={cn(
          "px-4 py-2 flex items-center justify-between border-b",
          isFullscreen
            ? "bg-white/5 border-white/10"
            : "bg-slate-100 border-slate-200",
        )}
      >
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-widest",
            isFullscreen ? "text-slate-400" : "text-slate-500"
          )}
        >
          {language || "Code"}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all active:scale-95",
            isFullscreen
              ? "bg-white/10 hover:bg-white/20 text-white shadow-sm border border-white/5"
              : "bg-white hover:bg-slate-50 text-slate-600 shadow-sm border border-slate-200",
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span>COPIED!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>COPY CODE</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div
        className={cn(
          "m-0 overflow-x-auto text-[13px] font-mono leading-relaxed",
          isFullscreen ? "text-slate-200" : "text-slate-800"
        )}
      >
        {children}
      </div>
    </div>
  );
};

export const ChatMessage = ({
  message,
  isStreaming,
  isFullscreen = false,
}: ChatMessageProps) => {
  return (
    <div className="mb-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn(
          "h-6 w-6 rounded-md flex items-center justify-center",
          message.sender === "User" ? "bg-slate-500/10" : "bg-brand/10"
        )}>
          {message.sender === "User" ? (
            <User className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <Bot className="h-3.5 w-3.5 text-brand" />
          )}
        </div>
        <span
          className={cn(
            "text-xs font-bold",
            isFullscreen ? "text-slate-300" : "text-slate-400",
          )}
        >
          {message.sender === "User" ? "You" : "AI Assistant"}
        </span>
      </div>
      <div
        className={cn(
          "pl-8 text-[14.5px] leading-relaxed font-medium tracking-wide",
          isFullscreen
            ? "text-slate-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            : "text-slate-700",
          "[&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1.5 [&_strong]:font-bold [&_strong]:text-blue-500 dark:[&_strong]:text-blue-400",
          isFullscreen
            ? "[&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:m-0 [&_code]:text-white [&_code]:bg-transparent"
            : "[&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:m-0 [&_code]:text-slate-800 [&_code]:bg-transparent",
          "[&_a]:text-blue-500 [&_a]:underline [&_h1]:text-blue-500 dark:[&_h1]:text-blue-400 [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:text-xl [&_h2]:text-blue-500 dark:[&_h2]:text-blue-400 [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:text-lg [&_h3]:text-blue-500 dark:[&_h3]:text-blue-400 [&_h3]:font-semibold [&_h3]:mb-2",
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code(props) {
              const { children, className, node, ...rest } = props as any;
              const match = /language-(\w+)/.exec(className || "");
              
              if (!match) {
                return (
                  <code
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[13px] font-mono font-medium",
                      isFullscreen
                        ? "bg-white/10 text-slate-200"
                        : "bg-slate-100/80 text-slate-800 border border-slate-200/60 shadow-sm",
                    )}
                    {...rest}
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
                      padding: "1rem",
                      fontSize: "13px",
                      borderRadius: "0",
                    }}
                  />
                </CodeBlock>
              );
            },
          }}
        >
          {message.text}
        </ReactMarkdown>
        {isStreaming && (
          <span className="ml-1 inline-block h-4 w-1 bg-brand animate-pulse" />
        )}
      </div>
    </div>
  );
};
