"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Sparkles, Trash2, Loader2, Link2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "./types";
import { useAuth } from "@clerk/clerk-react";

interface AskAIWorkspaceProps {
  sessionId: string;
  internalUserId?: string;
  onNavigateToTimeline: (questionId: string) => void;
}

export function AskAIWorkspace({ sessionId, internalUserId, onNavigateToTimeline }: AskAIWorkspaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { getToken, userId: clerkUserId } = useAuth();


  const SUGGESTED_PROMPTS = [
    "Summarize weak answers",
    "Extracted technologies?",
    "Next interview prep",
  ];

  useEffect(() => {
    fetchHistory();
  }, [sessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const fetchHistory = async () => {
    try {
      const token = await getToken();
      const uId = internalUserId || clerkUserId;
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ask-ai/${sessionId}/history?userId=${uId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });


      if (res.ok) {
        const data = await res.json();
        setMessages(data.data.map((m: any, idx: number) => ({
          ...m,
          id: m.id || `hist-${idx}`,
          timestamp: new Date().toISOString()
        })));
      }
    } catch (err) {
      console.error("Failed to fetch chat history", err);
    }
  };

  const handleSend = async (queryText?: string) => {
    const text = queryText || input;
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setIsTyping(true);

    try {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ask-ai/${sessionId}/query`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ query: text, userId: internalUserId || clerkUserId })
      });



      if (!response.ok) throw new Error("Failed to query AI");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      
      const assistantMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString()
      }]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assistantContent += data.content;
                setMessages(prev => prev.map(m => 
                  m.id === assistantMsgId ? { ...m, content: assistantContent } : m
                ));
              }
              if (data.done) break;
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }
      
      fetchHistory();
    } catch (err) {
      console.error("Chat error:", err);
      setMessages(prev => [...prev, {
        id: "err-" + Date.now(),
        role: "assistant",
        content: "Error: Failed to connect to AI service.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const clearHistory = async () => {
    if (!confirm("Clear chat?")) return;
    try {
      const token = await getToken();
      const uId = internalUserId || clerkUserId;
      await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ask-ai/${sessionId}/history?userId=${uId}`, { 
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });


      setMessages([]);
    } catch (err) {
      console.error("Failed to clear history", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-12 py-8 space-y-10 pb-36"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
            <h3 className="text-sm font-bold text-zinc-900 mb-6 tracking-tight">How can I help with this session?</h3>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="px-3 py-1.5 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 text-[12px] font-medium text-zinc-600 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id}
              className={cn(
                "group flex gap-4 max-w-3xl mx-auto w-full animate-in fade-in duration-300",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "flex flex-col gap-2",
                msg.role === "user" ? "items-end max-w-[85%]" : "items-start max-w-full"
              )}>
                <div className={cn(
                  "px-4 py-2.5 text-[14px] leading-7 font-normal",
                  msg.role === "user" 
                    ? "bg-zinc-100 text-zinc-900 rounded-2xl rounded-tr-sm" 
                    : "text-zinc-800"
                )}>
                  <div className="prose prose-sm max-w-none prose-p:leading-7 prose-headings:text-zinc-900 prose-strong:text-zinc-900 prose-code:text-zinc-900 prose-pre:bg-zinc-50 prose-pre:border-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>

                {msg.citations && msg.citations.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {msg.citations.map((cite, idx) => (
                      <button
                        key={cite.id}
                        onClick={() => onNavigateToTimeline(cite.id)}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-100 text-[10px] font-bold text-zinc-400 hover:text-zinc-900 hover:border-zinc-300 transition-all"
                      >
                        <Link2 className="size-3" />
                        Ref {idx + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        {isTyping && (
          <div className="flex items-center gap-3 ml-2 max-w-3xl mx-auto w-full">
            <Loader2 className="size-3.5 animate-spin text-zinc-300" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-300">AI Thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="absolute bottom-6 left-0 right-0 px-6 sm:px-12 bg-gradient-to-t from-white via-white/90 to-transparent pt-10">
        <div className="max-w-3xl mx-auto relative">
          <div className="p-1.5 rounded-xl border border-zinc-200 bg-white shadow-sm focus-within:border-zinc-400 transition-all flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message..."
              className="flex-1 bg-transparent border-none outline-none text-[14px] font-medium placeholder:text-zinc-400 resize-none py-2 px-3 h-10 custom-scrollbar"
              rows={1}
            />
            
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearHistory}
                  className="size-8 text-zinc-300 hover:text-zinc-500 rounded-lg"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="size-8 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-20 transition-opacity"
              >
                {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              </Button>
            </div>
          </div>
          
          <div className="mt-2 text-center">
            <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-[0.2em]">Interview Copilot v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
