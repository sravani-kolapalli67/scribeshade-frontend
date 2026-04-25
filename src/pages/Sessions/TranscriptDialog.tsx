"use client";

import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

// Standard Message Interface for ScribeShade
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
}

interface TranscriptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onDelete: (id: string) => void;
}

export function TranscriptDialog({
  isOpen,
  onClose,
  sessionId,
  onDelete,
}: TranscriptDialogProps) {
  const [activeTab, setActiveTab] = useState("transcript");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch session details from backend
  useEffect(() => {
    if (isOpen && sessionId) {
      const fetchDetails = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(
            `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}`,
          );
          if (res.ok) {
            const data = await res.json();
            setMessages(data.messages || []);
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

  // Removed unused interactions memo

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyInteraction = (interaction: Interaction) => {
    const text = `Question: ${interaction.question}\n\nAnswer: ${interaction.answer}`;
    handleCopy(interaction.id + "-card", text);
  };

  const downloadTranscript = () => {
    const content = messages
      .map((m) => {
        const time = m.timestamp
          ? new Date(m.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "00:00";

        const isAI = m.role === "AI" || m.role === "AI_ASSISTANT";

        if (isAI) {
          const { question, answer } = extractQA(m);
          return `### 💡 Question: ${question}\n\n**⭐ AI Answer:**\n${answer}\n\n*Time: ${time}*`;
        } else {
          const roleName = m.role === "USER" ? "You" : "Interviewer";
          return `> **${roleName}** [${time}]: ${m.content || m.question || ""}`;
        }
      })
      .join("\n\n---\n\n");

    const header = `# Session Transcript\nSession ID: ${sessionId}\nDate: ${new Date().toLocaleDateString()}\n\n`;
    const fullContent = header + content;

    const blob = new Blob([fullContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-transcript-${sessionId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to format timestamp
  const formatTime = (ts?: string) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Extract Q&A from a single AI message
  const extractQA = (msg: Message) => {
    // Priority 1: Structured fields
    if (msg.question || msg.answer) {
      return {
        question: msg.question || "Screen Analysis / Manual Trigger",
        answer: msg.answer || "",
      };
    }

    // Priority 2: Regex parsing of content
    const text = msg.content || "";
    const qRegex = /(?:\*\*|###)?\s*Extracted Question\s*:\s*/i;
    const aRegex = /(?:\*\*|###)?\s*Suggested Answer\s*:\s*/i;

    const qMatch = qRegex.exec(text);
    const aMatch = aRegex.exec(text);

    let extractedQ = null;
    let suggestedA = text;

    if (qMatch) {
      const qStart = qMatch.index + qMatch[0].length;
      const qEnd = aMatch ? aMatch.index : text.indexOf("\n", qStart);
      extractedQ = text
        .slice(qStart, qEnd === -1 ? text.length : qEnd)
        .replace(/[*#_]+$|^[*#_]+/g, "")
        .trim();
    }

    if (aMatch) {
      suggestedA = text.slice(aMatch.index + aMatch[0].length).trim();
    }

    return {
      question: extractedQ || "Screen Analysis / Manual Trigger",
      answer: suggestedA,
    };
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl w-[calc(100%-2rem)] max-h-[90vh] flex flex-col p-10 gap-0 overflow-y-auto border-none shadow-2xl bg-white rounded-3xl focus-visible:outline-none custom-scrollbar">
        {/* HEADER: Reference-Matched Layout */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <DialogTitle className="text-3xl font-bold text-slate-800 tracking-tight">
              Transcript
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(sessionId)}
              className="h-10 w-10 bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-sm transition-all p-0 flex items-center justify-center shrink-0"
            >
              <Trash2 className="size-5" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-10 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all"
          >
            {/* <X className="size-6" /> */}
          </Button>
        </div>

        {/* TABS: Pill-Shaped Dashboard Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-gray-100 p-1 rounded-xl h-12 w-full grid grid-cols-3 border border-gray-200 mb-6">
            <TabsTrigger
              value="ai-notes"
              className="rounded-lg text-sm font-medium gap-2 flex items-center justify-center
      text-gray-500
      data-[state=active]:bg-white
      data-[state=active]:text-gray-900
      data-[state=active]:shadow-sm
      transition-all"
            >
              <FileText className="w-4 h-4" />
              AI Notes
            </TabsTrigger>

            <TabsTrigger
              value="transcript"
              className="rounded-lg text-sm font-medium gap-2 flex items-center justify-center
      text-gray-500
      data-[state=active]:bg-white
      data-[state=active]:text-gray-900
      data-[state=active]:shadow-sm
      transition-all"
            >
              <FileText className="w-4 h-4" />
              Transcript
            </TabsTrigger>

            <TabsTrigger
              value="ask-ai"
              className="rounded-lg text-sm font-medium gap-2 flex items-center justify-center
      text-gray-500
      data-[state=active]:bg-white
      data-[state=active]:text-gray-900
      data-[state=active]:shadow-sm
      transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Ask AI
            </TabsTrigger>
          </TabsList>

          {/* ACTION BAR: Integrated utility */}
          <div className="flex items-center justify-between mb-8 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTranscript}
              className="h-11 px-8 rounded-full border-slate-200 hover:bg-slate-50 font-bold gap-3 text-[13px] shadow-sm transition-all"
            >
              <Download className="size-4 text-brand" />
              Download Transcript
            </Button>
          </div>

          {/* SCROLLABLE BODY */}
          <div className="relative">
            <div ref={scrollRef} className="pb-10 scroll-smooth">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-6 py-32">
                  <div className="size-12 border-[3px] border-slate-100 border-t-brand rounded-full animate-spin" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">
                    Loading context...
                  </p>
                </div>
              ) : (
                <TabsContent value="transcript" className="mt-0 outline-none">
                  <div className="space-y-8 max-w-4xl mx-auto px-4">
                    {messages.map((msg, idx) => {
                      const isAI =
                        msg.role === "AI" || msg.role === "AI_ASSISTANT";
                      const isUser = msg.role === "USER";
                      const isInterviewer = msg.role === "INTERVIEWER";

                      if (isAI) {
                        const { question, answer } = extractQA(msg);
                        const hasAnswer = (answer || "").trim().length > 0;
                        const interactionId = msg.id || `ai-${idx}`;

                        return (
                          <div
                            key={interactionId}
                            className="bg-white border border-slate-100 rounded-[2rem] p-8 md:p-10 shadow-xl shadow-slate-200/40 transition-all relative overflow-hidden group"
                          >
                            {/* Card Copy Button */}
                            <div className="absolute top-6 right-6 z-10 opacity-0 group-hover:opacity-100 transition-all">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleCopyInteraction({
                                    id: interactionId,
                                    question,
                                    answer,
                                    timestamp: msg.timestamp || "",
                                  })
                                }
                                className="h-9 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200/50 shadow-sm transition-all gap-2"
                              >
                                {copiedId === interactionId + "-card" ? (
                                  <>
                                    <Check className="size-4 text-emerald-500" />
                                    <span className="text-xs font-bold text-emerald-600">
                                      Copied Card
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-4" />
                                    <span className="text-xs font-bold">
                                      Copy Q&A
                                    </span>
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Segment: Question */}
                            <div className="flex items-start gap-5 mb-8 relative">
                              <div className="size-6 flex items-center justify-center shrink-0 mt-1">
                                <Lightbulb className="size-5 text-indigo-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-sm font-bold text-slate-800">
                                    Question:
                                  </span>
                                  <span className="text-[15px] text-slate-600 font-medium">
                                    {question}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Segment: Answer */}
                            {hasAnswer && (
                              <div className="flex items-start gap-5">
                                <div className="size-6 flex items-center justify-center shrink-0 mt-1">
                                  <Star className="size-5 text-amber-500 fill-amber-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-4">
                                    <span className="text-sm font-bold text-slate-800">
                                      Answer:
                                    </span>
                                  </div>
                                  <div
                                    className="text-[15px] leading-relaxed text-slate-700 font-medium prose prose-slate max-w-none 
                                        prose-p:mb-5 last:prose-p:mb-0 prose-strong:text-brand prose-strong:font-bold 
                                        prose-ul:list-disc prose-ul:pl-6 prose-li:mb-2 
                                        prose-code:text-brand prose-code:font-bold
                                        prose-pre:bg-transparent prose-pre:p-0 prose-pre:rounded-none prose-pre:border-none overflow-x-hidden"
                                  >
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        code({
                                          node,
                                          inline,
                                          className,
                                          children,
                                          ...props
                                        }: any) {
                                          const match = /language-(\w+)/.exec(
                                            className || "",
                                          );
                                          const codeContent = String(
                                            children,
                                          ).replace(/\n$/, "");

                                          if (!inline && match) {
                                            return (
                                              <div className="relative group/code my-6">
                                                <div className="absolute right-4 top-4 z-20 opacity-0 group-hover/code:opacity-100 transition-all">
                                                  <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    onClick={() =>
                                                      handleCopy(
                                                        codeContent,
                                                        codeContent,
                                                      )
                                                    }
                                                    className="size-8 rounded-lg bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-sm backdrop-blur-sm transition-all"
                                                  >
                                                    {copiedId ===
                                                    codeContent ? (
                                                      <Check className="size-4 text-emerald-400" />
                                                    ) : (
                                                      <Copy className="size-4" />
                                                    )}
                                                  </Button>
                                                </div>
                                                <SyntaxHighlighter
                                                  style={oneLight}
                                                  language={match[1]}
                                                  PreTag="div"
                                                  customStyle={{
                                                    margin: 0,
                                                    padding: "2rem",
                                                    borderRadius: "1.5rem",
                                                    fontSize: "14px",
                                                    lineHeight: "1.6",
                                                    backgroundColor: "#F8FAFC",
                                                    border: "1px solid #E2E8F0",
                                                  }}
                                                  {...props}
                                                >
                                                  {codeContent}
                                                </SyntaxHighlighter>
                                              </div>
                                            );
                                          }

                                          return (
                                            <code
                                              className="bg-slate-100 text-slate-900 px-1.5 py-0.5 rounded-md font-mono text-[13px]"
                                              {...props}
                                            >
                                              {children}
                                            </code>
                                          );
                                        },
                                      }}
                                    >
                                      {answer}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Render Transcript Message (User or Interviewer)
                      return (
                        <div
                          key={msg.id || `msg-${idx}`}
                          className={`flex flex-col ${isUser ? "items-end" : "items-start"} gap-2`}
                        >
                          <div
                            className={`max-w-[85%] px-6 py-4 rounded-3xl text-[15px] font-medium leading-relaxed shadow-sm
                              ${
                                isUser
                                  ? "bg-brand text-white rounded-tr-none"
                                  : "bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none"
                              }`}
                          >
                            {msg.content || msg.question}
                          </div>
                          <div
                            className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400
                              ${isUser ? "flex-row-reverse" : "flex-row"}`}
                          >
                            <span>{isUser ? "You" : "Interviewer"}</span>
                            <span className="opacity-40">•</span>
                            <span>{formatTime(msg.timestamp)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              )}

              {/* Place-holder for inactive tabs to match dashboard look */}
              <TabsContent
                value="ai-notes"
                className="py-20 flex flex-col items-center justify-center opacity-30"
              >
                <FileText className="size-16 mb-4 text-slate-300" />
                <p className="font-black uppercase tracking-widest text-slate-500 text-sm">
                  Notes generating...
                </p>
              </TabsContent>

              <TabsContent
                value="ask-ai"
                className="py-20 flex flex-col items-center justify-center opacity-30"
              >
                <Sparkles className="size-16 mb-4 text-slate-300" />
                <p className="font-black uppercase tracking-widest text-slate-500 text-sm">
                  Historical Chat
                </p>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
