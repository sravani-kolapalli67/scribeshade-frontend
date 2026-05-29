"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Download,
  Copy,
  Check,
  Star,
  FileText,
  Sparkles,
  Lightbulb,
  X,
  Clock,
  MoreHorizontal,
  ChevronRight,
  Code2,
  Brain,
  MessageSquare,
  AlertCircle,
  RotateCcw,
  Bookmark,
  Share2,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { AskAIWorkspace } from "./components/AskAI/AskAIWorkspace";

const highlightKeywords = (text: string) => {
  return text
    .replace(
      /\b(API|React|MongoDB|Redis|WebSocket|Node\.js|JWT|OAuth|Kafka|Docker|Kubernetes)\b/g,
      '<span class="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">$1</span>'
    )
    .replace(
      /\b(IMPORTANT|CRITICAL|WARNING)\b/g,
      '<span class="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold">$1</span>'
    );
};

const AI_TRANSCRIPT_MARKDOWN_COMPONENTS = {
  p: ({ children }: any) => <p className="my-0 text-[15px] leading-7 text-slate-900">{children}</p>,
  ul: ({ children }: any) => <ul className="my-2 list-disc space-y-1.5 pl-5 text-slate-900">{children}</ul>,
  ol: ({ children }: any) => <ol className="my-2 list-decimal space-y-1.5 pl-5 text-slate-900">{children}</ol>,
  li: ({ children }: any) => <li className="text-[15px] leading-7">{children}</li>,
  strong: ({ children }: any) => <strong className="font-extrabold text-black">{children}</strong>,
  code({ inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    if (!inline && match) {
      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            marginTop: "0.5rem",
            marginBottom: "0.5rem",
            borderRadius: "0.5rem",
            padding: "0.85rem",
            fontSize: "12px",
            lineHeight: "1.6",
          }}
          {...props}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      );
    }
    return (
      <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px] text-slate-800" {...props}>
        {children}
      </code>
    );
  },
};


// --- Types ---

export interface Message {
  id?: string;
  role: string; // AI_ASSISTANT | USER | INTERVIEWER
  content?: string;
  question?: string;
  answer?: string;
  timestamp?: string; // ISO string
}

interface Interaction {
  id: string;
  question: string;
  answer: string;
  timestamp: string;
  index: number;
}

interface TranscriptEntry {
  id: string;
  role: "USER" | "INTERVIEWER" | "AI_ASSISTANT";
  label: string;
  text: string;
  time: string;
  timestampMs: number;
  aiQuestion?: string;
  aiAnswer?: string;
}

interface SessionNotes {
  id: string;
  sessionId: string;
  companyName: string;
  jobDescription: string;
  summary: string;
  questions: string[];
  updatedAt: string;
}

interface TranscriptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onDelete: (id: string) => void;
}

// --- Sub-Components ---

/**
 * Premium AI Answer Card
 */
function InteractionCard({
  interaction,
  onCopy,
  copiedId,
}: {
  interaction: Interaction;
  onCopy: (id: string, text: string) => void;
  copiedId: string | null;
}) {
  return (
    <div className="relative group rounded-xl border border-border/60 bg-card p-7 space-y-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all">
      {/* Header section: Label and Question */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {interaction.timestamp}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-black text-indigo-600 uppercase tracking-widest">
                QUESTION {String(interaction.index + 1).padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopy(interaction.id, `Q: ${interaction.question}\n\nA: ${interaction.answer}`)}
              className="h-8 px-3 rounded-lg text-muted-foreground hover:text-foreground transition-all gap-2"
            >
              {copiedId === interaction.id ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span className="text-[12px] font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span className="text-[12px] font-semibold">Copy</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <h3 className="text-xl font-bold text-foreground leading-snug tracking-tight">
          {interaction.question}
        </h3>
      </div>

      <div className="h-px bg-border/60 w-full" />

      {/* Body section: AI Answer with optimized formatting */}
      <div className="space-y-5 relative">
        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg bg-background/80 backdrop-blur-sm"
            onClick={() => onCopy(interaction.id, interaction.answer)}
          >
            {copiedId === interaction.id ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="size-5 rounded-md bg-indigo-600 flex items-center justify-center shadow-sm">
            <Zap className="size-3 text-white fill-white" />
          </div>
          <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-[0.15em]">AI Response</span>
        </div>

        <div className="
          text-[15px]
          leading-7
          text-muted-foreground
          font-normal
          prose
          prose-slate
          max-w-none

          prose-p:leading-8
          prose-p:mb-5
          prose-p:text-[15px]

          prose-strong:font-semibold
          prose-strong:text-foreground

          prose-ul:my-6
          prose-ul:space-y-4
          prose-ul:pl-7

          prose-ol:my-6
          prose-ol:space-y-4
          prose-ol:pl-7

          prose-li:pl-2
          prose-li:leading-8

          prose-li:marker:text-indigo-500
          prose-li:marker:font-bold

          prose-code:text-indigo-600
          prose-code:bg-indigo-50
          prose-code:px-1.5
          prose-code:py-0.5
          prose-code:rounded

          prose-pre:rounded-xl
          prose-pre:border
          prose-pre:border-zinc-800

          prose-headings:text-foreground
          prose-headings:font-bold
          ">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              ul({ children }) {
                return (
                  <ul className="space-y-4 my-6">
                    {children}
                  </ul>
                );
              },
              li({ children }) {
                return (
                  <li className="
                    rounded-lg
                    border
                    border-border/40
                    bg-muted/20
                    px-4
                    py-3
                    leading-7
                    transition-all
                    hover:bg-muted/30
                  ">
                    {children}
                  </li>
                );
              },
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const codeContent = String(children).replace(/\n$/, "");

                if (!inline && match) {
                  return (
                    <div className="my-6 rounded-xl border border-border/50 bg-zinc-950 overflow-hidden group/code relative shadow-sm">
                      <div className="absolute right-3 top-3 opacity-0 group-hover/code:opacity-100 transition-opacity z-10">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="size-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 shadow-sm"
                          onClick={() => onCopy(interaction.id + '-code', codeContent)}
                        >
                          {copiedId === interaction.id + '-code' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                        </Button>
                      </div>
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          padding: "1.5rem",
                          fontSize: "13px",
                          lineHeight: "1.6",
                          backgroundColor: "transparent",
                        }}
                        {...props}
                      >
                        {codeContent}
                      </SyntaxHighlighter>
                    </div>
                  );
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {highlightKeywords(interaction.answer)}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact SaaS Header
 */
function TranscriptHeader({
  title,
  subtitle,
  onClose,
  onDelete,
  onDownload,
  isEphemeral,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  onDelete: () => void;
  onDownload: () => void;
  isEphemeral: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex flex-col gap-0.5">
        <DialogTitle className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
          {title}
          <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </DialogTitle>
        <span className="text-[12px] text-muted-foreground font-medium flex items-center gap-2">
          {subtitle}
          {isEphemeral && (
            <span className="text-[10px] bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded text-amber-600 font-bold uppercase tracking-wider">
              Ephemeral
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {!isEphemeral && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownload}
            className="h-9 text-[12px] font-bold text-muted-foreground hover:text-foreground gap-2 px-3 hover:bg-muted"
          >
            <Download className="size-3.5" />
            Export
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="size-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-all"
        >
          <Trash2 className="size-4" />
        </Button>
        <div className="w-px h-5 bg-border/50 mx-1.5" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-9 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
        >
          <X className="size-4.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Minimal Empty State
 */
function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: any;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="size-12 rounded-2xl bg-muted/30 flex items-center justify-center mb-5">
        <Icon className="size-6 text-muted-foreground/40" />
      </div>
      <h3 className="text-base font-bold text-foreground mb-1.5">{title}</h3>
      <p className="text-[13px] text-muted-foreground max-w-[280px] leading-relaxed mb-8">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          size="sm"
          className="h-10 px-6 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold text-xs gap-2 shadow-sm"
        >
          <Sparkles className="size-3.5" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

// --- Main Dialog ---

export function TranscriptDialog({
  isOpen,
  onClose,
  sessionId,
  onDelete,
}: TranscriptDialogProps) {
  const [activeTab, setActiveTab] = useState("transcript");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [notes, setNotes] = useState<SessionNotes | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isEphemeral, setIsEphemeral] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const interactionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const resolveRole = (value: unknown): "USER" | "INTERVIEWER" | "AI_ASSISTANT" => {
    if (value === "USER") return "USER";
    if (value === "INTERVIEWER") return "INTERVIEWER";
    return "AI_ASSISTANT";
  };

  const resolveRoleLabel = (role: TranscriptEntry["role"]): string => {
    if (role === "USER") return "You";
    if (role === "INTERVIEWER") return "Interviewer";
    return "AI Assistant";
  };

  const resolveTime = (message: any, index: number): { time: string; timestampMs: number } => {
    const rawTimestamp = message?.timestamp || message?.createdAt;
    if (rawTimestamp) {
      const parsed = new Date(rawTimestamp);
      if (!Number.isNaN(parsed.getTime())) {
        return {
          time: parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          timestampMs: parsed.getTime(),
        };
      }
    }

    const fallbackTime = typeof message?.time === "string" && message.time.trim()
      ? message.time
      : "00:00";

    return { time: fallbackTime, timestampMs: index };
  };

  const resolveTranscriptText = (message: any, role: TranscriptEntry["role"]): string => {
    if (role === "AI_ASSISTANT") {
      const aiAnswer = typeof message?.answer === "string" ? message.answer.trim() : "";
      const aiContent = typeof message?.content === "string" ? message.content.trim() : "";
      const aiQuestion = typeof message?.question === "string" ? message.question.trim() : "";
      return aiAnswer || aiContent || aiQuestion;
    }

    const patchedText = typeof message?.patchedText === "string" ? message.patchedText.trim() : "";
    const questionText = typeof message?.question === "string" ? message.question.trim() : "";
    const contentText = typeof message?.content === "string" ? message.content.trim() : "";
    const answerText = typeof message?.answer === "string" ? message.answer.trim() : "";
    return patchedText || questionText || contentText || answerText;
  };

  const parseAiQuestionAnswer = (message: any): { question: string; answer: string } => {
    const directQuestion = typeof message?.question === "string" ? message.question.trim() : "";
    const rawBody = resolveTranscriptText(message, "AI_ASSISTANT");
    if (!rawBody) {
      return { question: directQuestion || "Generated response", answer: "" };
    }

    const questionMatch = rawBody.match(/\*\*QUESTION:\*\*\s*([\s\S]*?)(?=\*\*ANSWER:\*\*|ANSWER:)/i);
    const answerMatch = rawBody.match(/\*\*ANSWER:\*\*\s*([\s\S]*)/i);

    const parsedQuestion = questionMatch?.[1]?.replace(/\*\*/g, "").trim() || "";
    const parsedAnswer = answerMatch?.[1]?.trim() || "";

    if (parsedAnswer) {
      return {
        question: parsedQuestion || directQuestion || "Generated response",
        answer: parsedAnswer,
      };
    }

    const firstSegment = rawBody.split(/===NEXT_QUESTION===/gi)[0]?.trim() || rawBody;
    return {
      question: directQuestion || "Generated response",
      answer: firstSegment,
    };
  };


  useEffect(() => {
    if (isOpen && sessionId) {
      const fetchDetails = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}`);
          if (res.ok) {
            const data = await res.json();
            const sessionData = data.data ?? data;
            const storedMessages = Array.isArray(sessionData.messages) ? sessionData.messages : [];
            const storedTranscript = Array.isArray(sessionData.transcript) ? sessionData.transcript : [];
            setMessages(storedMessages.length > 0 ? storedMessages : storedTranscript);
            setUserId(sessionData.userId || "");
            setIsEphemeral(sessionData.saveTranscription === false);

          }

          const notesRes = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session-notes/${sessionId}`);
          if (notesRes.ok) {
            const notesData = await notesRes.json();
            setNotes(notesData.data);
          } else {
            setNotes(null);
          }
        } catch (error) {
          console.error("Error fetching session details:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchDetails();
    }
  }, [isOpen, sessionId]);

  const generateNotes = async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session-notes/${sessionId}/generate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.data);
        setActiveTab("ai-notes");
      }
    } catch (error) {
      console.error("Error generating notes:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleNavigateToTimeline = (interactionId: string) => {
    setActiveTab("transcript");
    // Wait for tab switch and then scroll
    setTimeout(() => {
      const element = interactionRefs.current[interactionId];
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        // Add a temporary highlight effect
        element.classList.add("ring-2", "ring-indigo-500", "ring-offset-4");
        setTimeout(() => {
          element.classList.remove("ring-2", "ring-indigo-500", "ring-offset-4");
        }, 2000);
      }
    }, 100);
  };


  /**
   * Build a chronological transcript stream from persisted session messages.
   */
  const parsedTranscript = useMemo<TranscriptEntry[]>(() => {
    const transcriptRows: TranscriptEntry[] = [];

    messages.forEach((msg: Message, index: number) => {
      const role = resolveRole((msg as any).role);
      const { time, timestampMs } = resolveTime(msg, index);
      if (role === "AI_ASSISTANT") {
        const ai = parseAiQuestionAnswer(msg);
        if (!ai.answer) return;
        transcriptRows.push({
          id: (msg.id || (msg as any).messageId || `msg-${index}`) as string,
          role,
          label: resolveRoleLabel(role),
          text: ai.answer,
          aiQuestion: ai.question,
          aiAnswer: ai.answer,
          time,
          timestampMs,
        });
        return;
      }

      const text = resolveTranscriptText(msg, role);
      if (!text) return;

      transcriptRows.push({
        id: (msg.id || (msg as any).messageId || `msg-${index}`) as string,
        role,
        label: resolveRoleLabel(role),
        text,
        time,
        timestampMs,
      });
    });

    return transcriptRows.sort((a, b) => a.timestampMs - b.timestampMs);
  }, [messages]);

  const downloadTranscript = () => {
    const content = parsedTranscript
      .map((entry) => `[${entry.time}] ${entry.label}: ${entry.text}`)
      .join("\n\n");

    const blob = new Blob([`# Session Transcript\nSession ID: ${sessionId}\n\n` + content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${sessionId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl w-[calc(100%-2rem)] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl rounded-2xl focus-visible:outline-none">

        <TranscriptHeader
          title="Interview Intelligence"
          subtitle={notes?.jobDescription || "AI-powered Session Workspace"}
          onClose={onClose}
          onDelete={() => onDelete(sessionId)}
          onDownload={downloadTranscript}
          isEphemeral={isEphemeral}
        />

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 px-6 py-3 border-b border-border/40 bg-background/50">
              <TabsList className="h-10 p-1 rounded-xl bg-muted/40 grid grid-cols-3 w-full max-w-[440px]">
                <TabsTrigger
                  value="transcript"
                  className="rounded-lg text-[12px] font-bold gap-2.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <FileText className="size-4" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger
                  value="ai-notes"
                  className="rounded-lg text-[12px] font-bold gap-2.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <Sparkles className="size-4" />
                  Insights
                </TabsTrigger>
                <TabsTrigger
                  value="ask-ai"
                  className="rounded-lg text-[12px] font-bold gap-2.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <MessageSquare className="size-4" />
                  Ask AI
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 bg-slate-50/30">
              <div className="max-w-4xl mx-auto">
                <TabsContent value="transcript" className="mt-0 outline-none">
                  {isLoading ? (
                    <div className="py-24 flex flex-col items-center justify-center gap-5 text-center">
                      <div className="relative">
                        <div className="size-10 border-2 border-muted border-t-indigo-500 rounded-full animate-spin" />
                        <Brain className="size-4 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <p className="text-[12px] text-muted-foreground font-black uppercase tracking-[0.2em]">
                        Loading Transcript...
                      </p>
                    </div>
                  ) : parsedTranscript.length === 0 ? (
                    <EmptyState
                      title="No transcript available"
                      description="Transcript messages will appear here after interviewer and user conversation is captured."
                      icon={AlertCircle}
                    />
                  ) : (
                    <div ref={scrollContainerRef} className="space-y-2 py-1">
                      {parsedTranscript.map((entry) => (
                        <div key={entry.id} ref={el => { interactionRefs.current[entry.id] = el; }}>
                          {entry.role === "AI_ASSISTANT" ? (
                            <div className="scroll-mt-20 rounded-xl border border-amber-200/70 bg-white px-4 py-3 shadow-sm">
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(
                                    entry.id,
                                    `Question: ${entry.aiQuestion || ""}\n\nAnswer:\n${entry.aiAnswer || ""}`,
                                  )
                                }
                                className="float-right mt-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                                aria-label="Copy AI answer"
                                title="Copy"
                              >
                                {copiedId === entry.id ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                              </button>

                              <p className="m-0 pr-7 text-[18px] leading-[1.45] text-slate-900">
                                <span className="font-extrabold">Question:</span>{" "}
                                {entry.aiQuestion || "Generated response"}
                              </p>

                              <div className="my-3 h-px bg-slate-200" />

                              <p className="m-0 text-[18px] font-extrabold leading-none text-slate-900">Answer:</p>
                              <div className="mt-2 prose prose-slate max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={AI_TRANSCRIPT_MARKDOWN_COMPONENTS as any}>
                                  {entry.aiAnswer || ""}
                                </ReactMarkdown>
                              </div>
                              <div className="mt-3 text-[10px] font-semibold text-slate-500">
                                AI Answer · {entry.time}
                              </div>
                            </div>
                          ) : (
                            <div
                              className={cn(
                                "scroll-mt-20 transition-all duration-300 flex flex-col gap-1",
                                entry.role === "USER" ? "items-end" : "items-start",
                              )}
                            >
                              <div
                                className={cn(
                                  "max-w-[82%] rounded-xl bg-slate-100/80 px-3.5 py-2 text-[18px] leading-[1.45] text-slate-900",
                                  entry.role === "USER" ? "rounded-tr-md" : "rounded-tl-md",
                                )}
                              >
                                <p className="m-0 whitespace-pre-wrap">{entry.text}</p>
                              </div>
                              <div
                                className={cn(
                                  "text-[10px] font-semibold text-slate-500",
                                  entry.role === "USER" ? "text-right" : "text-left",
                                )}
                              >
                                {entry.label} · {entry.time}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                </TabsContent>

                <TabsContent value="ai-notes" className="mt-0 outline-none">
                  {isGenerating ? (
                    <div className="py-24 flex flex-col items-center justify-center gap-5 text-center">
                      <div className="size-10 border-2 border-muted border-t-indigo-500 rounded-full animate-spin" />
                      <p className="text-[12px] text-muted-foreground font-black uppercase tracking-[0.2em]">
                        Analyzing Session...
                      </p>
                    </div>
                  ) : !notes ? (
                    <EmptyState
                      title="No insights generated"
                      description="Synthesize your session performance with deep AI evaluation, technical scores, and summaries."
                      actionLabel={!isEphemeral ? "Generate Analytics" : undefined}
                      onAction={generateNotes}
                      icon={Sparkles}
                    />
                  ) : (
                    <div className="space-y-8 pb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <section className="bg-white border border-border/50 rounded-2xl p-6 space-y-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="size-4 text-indigo-500" />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Executive Summary</h3>
                          </div>
                          <p className="text-[14px] leading-relaxed text-muted-foreground font-medium whitespace-pre-wrap">
                            {notes.summary}
                          </p>
                        </section>

                        <section className="bg-white border border-border/50 rounded-2xl p-6 space-y-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <Lightbulb className="size-4 text-amber-500" />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Questions Identified</h3>
                          </div>
                          <div className="space-y-3">
                            {notes.questions.map((q, idx) => (
                              <div key={idx} className="flex gap-3 items-start group">
                                <div className="size-5 rounded-md bg-muted/40 flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0 mt-0.5">
                                  {String(idx + 1).padStart(2, '0')}
                                </div>
                                <p className="text-[13px] text-muted-foreground font-medium leading-relaxed group-hover:text-foreground transition-colors">
                                  {q}
                                </p>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>

                      <section className="p-6 rounded-2xl border border-border/40 bg-muted/10">
                        <div className="flex items-center gap-2 mb-4">
                          <Clock className="size-4 text-muted-foreground" />
                          <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em]">Metadata Workspace</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-60">Company</p>
                            <p className="text-[14px] font-bold text-foreground">{notes.companyName}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-60">Session Date</p>
                            <p className="text-[14px] font-bold text-foreground">{new Date(notes.updatedAt).toLocaleDateString()}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-60">Status</p>
                            <p className="text-[14px] font-bold text-emerald-600 flex items-center gap-1.5">
                              <div className="size-1.5 rounded-full bg-emerald-500" />
                              Completed
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-60">AI Model</p>
                            <p className="text-[14px] font-bold text-indigo-600">Premium-v3</p>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ask-ai" className="mt-0 outline-none h-full flex flex-col">
                  <AskAIWorkspace 
                    sessionId={sessionId} 
                    internalUserId={userId}

                    onNavigateToTimeline={handleNavigateToTimeline}
                  />
                </TabsContent>


              </div>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
