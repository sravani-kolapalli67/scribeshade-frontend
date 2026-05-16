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
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { AskAIWorkspace } from "./components/AskAI/AskAIWorkspace";


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
    <div className="relative group rounded-2xl border border-border/50 bg-background/80 backdrop-blur-sm p-6 space-y-5 shadow-sm hover:shadow-md hover:border-border transition-all">
      {/* Header section: Label and Question */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 flex items-center gap-1.5">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                Question {String(interaction.index + 1).padStart(2, '0')}
              </span>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {interaction.timestamp}
            </span>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCopy(interaction.id, `Q: ${interaction.question}\n\nA: ${interaction.answer}`)}
              className="h-8 px-2.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all gap-2"
            >
              {copiedId === interaction.id ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span className="text-[11px] font-bold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span className="text-[11px] font-bold">Copy</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <h4 className="text-base font-semibold text-foreground leading-snug tracking-tight">
          {interaction.question}
        </h4>
      </div>

      <div className="h-px bg-border/40 w-full" />

      {/* Body section: AI Answer with optimized formatting */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-full bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200">
            <Zap className="size-3 text-white fill-white" />
          </div>
          <span className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em]">AI Response</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="size-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase">High Confidence</span>
          </div>
        </div>

        <div className="text-[14px] leading-7 text-muted-foreground font-medium prose prose-slate max-w-none 
          prose-p:mb-4 last:prose-p:mb-0 
          prose-strong:text-indigo-900 prose-strong:font-bold prose-strong:bg-indigo-50/80 prose-strong:px-1.5 prose-strong:py-0.5 prose-strong:rounded-md
          prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6
          prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6
          prose-li:mb-2 prose-li:pl-1
          prose-code:text-indigo-600 prose-code:bg-indigo-50/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md
          marker:text-indigo-400/80">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const codeContent = String(children).replace(/\n$/, "");

                if (!inline && match) {
                  return (
                    <div className="my-5 rounded-xl border border-border/40 bg-muted/20 overflow-hidden group/code relative">
                      <div className="absolute right-3 top-3 opacity-0 group-hover/code:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="size-7 rounded-lg bg-white/80 backdrop-blur-sm shadow-sm"
                          onClick={() => onCopy(interaction.id + '-code', codeContent)}
                        >
                          {copiedId === interaction.id + '-code' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                        </Button>
                      </div>
                      <SyntaxHighlighter
                        style={oneLight}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          padding: "1.25rem",
                          fontSize: "12px",
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
                  <code className="bg-muted/50 px-1.5 py-0.5 rounded text-[12px] font-mono" {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {interaction.answer}
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


  useEffect(() => {
    if (isOpen && sessionId) {
      const fetchDetails = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}`);
          if (res.ok) {
            const data = await res.json();
            const sessionData = data.data ?? data;
            setMessages(sessionData.messages || []);
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
   * Enhanced Parsing Architecture
   * Splits merged AI responses into individual structured interactions.
   */
  const parseInteractions = useMemo(() => {
    const allInteractions: Interaction[] = [];
    let questionCounter = 0;

    messages.forEach((msg, msgIdx) => {
      const isAI = msg.role === "AI" || msg.role === "AI_ASSISTANT";
      if (!isAI) return;

      if (msg.question || msg.answer) {
        allInteractions.push({
          id: msg.id || `direct-${msgIdx}`,
          question: msg.question || "Contextual Analysis",
          answer: msg.answer || "",
          timestamp: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'AI Analyzed',
          index: questionCounter++
        });
        return;
      }

      const text = msg.content || "";
      // Match various patterns of Q&A blocks and split markers
      const splitRegex = /(?:\n|^)(?:===NEXT_QUESTION===|\*\*?Extracted Question:|\*\*?QUESTION:|\*\*?Question \d+:)/i;

      const segments = text.split(splitRegex);

      segments.forEach((seg, segIdx) => {
        const cleanSeg = seg.replace(/===NEXT_QUESTION===/g, "").trim();
        if (!cleanSeg) return;

        let question = "";
        let answer = cleanSeg;

        // Strip QUESTION: and ANSWER: labels if they exist in the segment
        const qLabelRegex = /^(?:\*\*|###)?\s*(?:Extracted Question|QUESTION|Question \d+)\s*:\s*/i;
        const aLabelRegex = /(?:\n|^)(?:\*\*|###)?\s*(?:Suggested Answer|ANSWER|Answer \d+)\s*:\s*/i;

        const qMatch = qLabelRegex.exec(cleanSeg);
        if (qMatch) {
          const qStart = qMatch.index + qMatch[0].length;
          const aMatch = aLabelRegex.exec(cleanSeg);

          if (aMatch) {
            question = cleanSeg.slice(qStart, aMatch.index).trim();
            answer = cleanSeg.slice(aMatch.index + aMatch[0].length).trim();
          } else {
            // No answer marker, try to find a newline or just take the rest
            const firstNewline = cleanSeg.indexOf("\n", qStart);
            if (firstNewline !== -1) {
              question = cleanSeg.slice(qStart, firstNewline).trim();
              answer = cleanSeg.slice(firstNewline).trim();
            } else {
              question = cleanSeg.slice(qStart).trim();
              answer = "";
            }
          }
        }

        // Final clean up of markdown artifacts at the start/end of question
        question = question.replace(/[*#_]+$|^[*#_]+/g, "").trim();

        if (question || answer) {
          allInteractions.push({
            id: `${msgIdx}-${segIdx}`,
            question: question || "Contextual Analysis",
            answer: answer,
            timestamp: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00',
            index: questionCounter++
          });
        }
      });
    });

    return allInteractions;
  }, [messages]);

  const downloadTranscript = () => {
    const content = parseInteractions.map(inter => {
      return `### Question ${inter.index + 1}: ${inter.question}\n\n**AI Answer:**\n${inter.answer}\n\n*Time: ${inter.timestamp}*`;
    }).join("\n\n---\n\n");

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
                  Timeline
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
                        Parsing Timeline...
                      </p>
                    </div>
                  ) : parseInteractions.length === 0 ? (
                    <EmptyState
                      title="No interactions recorded"
                      description="AI-generated answers and extracted questions will appear here once the session starts."
                      icon={AlertCircle}
                    />
                  ) : (
                    <div 
                      ref={scrollContainerRef}
                      className="space-y-10 py-4"
                    >
                      {parseInteractions.map((inter, idx) => (
                        <div 
                          key={inter.id} 
                          ref={el => { interactionRefs.current[inter.id] = el; }}
                          className="scroll-mt-20 transition-all duration-500 rounded-2xl"
                        >
                          <InteractionCard
                            interaction={inter}
                            onCopy={handleCopy}
                            copiedId={copiedId}
                          />
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
