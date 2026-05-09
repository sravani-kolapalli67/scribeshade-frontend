"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  Activity,
  TrendingUp,
  Calendar,
  Building2,
  ThumbsUp,
  AlertCircle,
  Check,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface Message {
  id?: string;
  role: string;
  content?: string;
  question?: string;
  answer?: string;
  timestamp?: string;
}

interface SessionAnalyticsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  session: any; // The session object from the list
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card p-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-border min-w-[120px]">
        <div className="font-medium text-foreground mb-2">{label}</div>
        <div className="font-medium text-[#6366f1] flex items-center gap-2">
          Interactions : <span>{payload[0].value}</span>
        </div>
      </div>
    );
  }
  return null;
};

export function SessionAnalyticsDialog({
  isOpen,
  onClose,
  session,
}: SessionAnalyticsDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [feedback, setFeedback] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(true);

  useEffect(() => {
    if (isOpen && session?.id) {
      const load = async () => {
        setIsLoading(true);
        try {
          // Fetch full session data (messages + feedback) in parallel
          const [sessionRes, feedbackRes] = await Promise.all([
            fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session/${session.id}`),
            fetch(`${import.meta.env.VITE_BACKEND_URL}/api/session/${session.id}/analytics/existing`),
          ]);

          if (sessionRes.ok) {
            const data = await sessionRes.json();
            const sessionData = data.data ?? data;
            setMessages(sessionData.messages || []);
            // Use inline feedback from the full session response if available
            if (sessionData.feedback) setFeedback(sessionData.feedback);
          }

          // Dedicated existing-analytics fetch (returns null / 404 if none)
          if (feedbackRes.ok) {
            const existing = await feedbackRes.json();
            if (existing && existing.id) setFeedback(existing);
          }
        } catch (error) {
          console.error("Error fetching session data:", error);
        } finally {
          setIsLoading(false);
        }
      };
      load();
    }
    if (!isOpen) {
      setMessages([]);
      setFeedback(null);
    }
  }, [isOpen, session?.id]);

  const handleGenerateAnalytics = async () => {
    if (!session?.id) return;
    setIsGenerating(true);
    try {
      // 90-second timeout — AI generation can be slow
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);

      const analyticsRes = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/session/${session.id}/analytics`,
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        // GET endpoint returns the feedback object directly
        setFeedback(data);
      } else {
        const errData = await analyticsRes.json().catch(() => ({}));
        toast.error(errData.error || "Failed to generate analytics. Please try again.");
      }
    } catch (error: any) {
      console.error("Error generating analytics:", error);
      if (error?.name === "AbortError") {
        toast.error("Analytics generation timed out. Please try again.");
      } else {
        toast.error("Failed to generate analytics. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const analytics = useMemo(() => {
    if (!messages.length) return null;

    const aiMessages = messages.filter(
      (m) => m.role === "AI" || m.role === "AI_ASSISTANT",
    );
    const interviewerMessages = messages.filter(
      (m) => m.role === "INTERVIEWER" || m.role === "USER",
    );

    // Calculate duration
    const timestamps = messages
      .map((m) => (m.timestamp ? new Date(m.timestamp).getTime() : NaN))
      .filter((t) => !isNaN(t));
    
    let durationMin: string | number = "< 1";
    if (timestamps.length > 0) {
      const startTime = Math.min(...timestamps);
      const endTime = Math.max(...timestamps);
      const durationMs = endTime - startTime;
      durationMin = Math.round(durationMs / 60000) || "< 1";
    }

    // Calculate average response length
    const totalChars = aiMessages.reduce(
      (acc, m) => acc + (m.answer?.length || m.content?.length || 0),
      0,
    );
    const avgChars = aiMessages.length
      ? Math.round(totalChars / aiMessages.length)
      : 0;

    // Chart data: Interactions over time (bucketed by minute)
    const chartDataMap: Record<string, number> = {};
    messages.forEach((m) => {
      if (!m.timestamp) return;
      const date = new Date(m.timestamp);
      if (isNaN(date.getTime())) return;

      const timeKey = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      chartDataMap[timeKey] = (chartDataMap[timeKey] || 0) + 1;
    });

    const chartData = Object.entries(chartDataMap)
      .map(([time, count]) => ({
        time,
        count,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    return {
      totalMessages: messages.length,
      aiResponses: aiMessages.length,
      questions: interviewerMessages.length,
      duration: durationMin,
      avgResponseLength: avgChars,
      aiUsage: session?.aiUsage || 0,
      chartData,
    };
  }, [messages, session]);

  if (!session) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto no-scrollbar p-0 gap-0 border border-border bg-background/95 backdrop-blur-xl shadow-2xl rounded-[1rem]">
        <div className="p-8 md:p-10 space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-2xl">
                  <Activity className="size-6 text-primary" />
                </div>
                <DialogTitle className="text-3xl font-bold text-foreground tracking-tight">
                  Session Analytics
                </DialogTitle>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground font-medium">
                <div className="flex items-center gap-1.5">
                  <Building2 className="size-4" />
                  {session.company}
                </div>
                <div className="h-1 w-1 rounded-full bg-border" />
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-4" />
                  {new Date(session.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* <div className="bg-card p-4 rounded-3xl border border-border shadow-sm flex items-center gap-4 pr-6 min-w-52">
              <div className="size-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Award className="size-7" />
              </div>
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  AI Usage Score
                </div>
                <div className="text-2xl font-black text-foreground">
                  {session.aiUsage || 0}%
                </div>
              </div>
            </div> */}
          </div>

          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4">
              <div className="size-12 border-4 border-border border-t-primary rounded-full animate-spin" />
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                Analyzing session data...
              </p>
            </div>
          ) : feedback ? (
            <div className="space-y-6">
              {/* Top Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Score", value: feedback ? `${feedback.score}%` : "N/A" },
                  { label: "Confidence", value: feedback ? `${feedback.confidence}%` : "N/A" },
                  { label: "Session Quality", value: feedback?.sessionQuality || "N/A" },
                  {
                    label: "Avg. Words",
                    value: feedback?.avgResponseLen || "0",
                  },
                  {
                    label: "Answered",
                    value: feedback?.answeredCount || "0",
                  },
                  { label: "AI Assists", value: feedback?.aiAssistsCount || 0 },
                  {
                    label: "Avg. Time",
                    value: feedback?.avgResponseTime ? `${feedback.avgResponseTime}s` : "N/A",
                  },
                  { label: "Verdict", value: feedback?.verdict || "N/A" },
                ].map((stat, idx) => (
                  <Card
                    key={idx}
                    className="border border-border shadow-sm bg-card rounded-lg overflow-hidden p-5 flex flex-col justify-center transition-all hover:shadow-md"
                  >
                    <div className="text-lg font-semibold text-foreground mb-2 uppercase tracking-wide">
                      {stat.label}
                    </div>
                    <div className="text-base font-medium text-muted-foreground leading-tight">
                      {stat.value}
                    </div>
                  </Card>
                ))}
              </div>

              {/* AI Feedback Section */}
              <Card className="border border-border shadow-sm bg-card rounded-lg overflow-hidden transition-all">
                <div
                  className="flex items-center justify-between p-4 md:p-4 cursor-pointer hover:bg-accent transition-colors border-b border-border"
                  onClick={() => setIsFeedbackOpen(!isFeedbackOpen)}
                >
                  <div className="text-xl font-semibold text-foreground flex items-center gap-3">
                    AI Feedback
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="px-3 py-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-sm font-bold rounded-full">
                      {feedback ? `${feedback.score}%` : "N/A"}
                    </div>
                    {isFeedbackOpen ? (
                      <ChevronUp className="size-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {isFeedbackOpen && (
                  <div className="p-6 md:p-8 bg-card">
                    {/* Pills */}
                    <div className="flex flex-wrap items-center gap-3 mb-10">
                      <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm font-semibold flex items-center gap-2 border border-emerald-500/20">
                        Communication <span className="font-bold">{feedback?.communication || 0}%</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 text-sm font-semibold flex items-center gap-2 border border-blue-500/20">
                        Interactivity <span className="font-bold">{feedback?.interactivity || 0}%</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm font-semibold flex items-center gap-2 border border-emerald-500/20">
                        Confidence <span className="font-bold">{feedback?.confidence || 0}%</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 text-sm font-semibold flex items-center gap-2 border border-slate-500/20">
                        Technical Depth <span className="font-bold">{feedback?.technicalDepth || 0}%</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm font-semibold flex items-center gap-2 border border-amber-500/20">
                        Conciseness <span className="font-bold">{feedback?.conciseness || 0}%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
                      {/* Strengths */}
                      <div>
                        <div className="flex items-center gap-2 mb-6">
                          <ThumbsUp className="size-5 text-emerald-600 dark:text-emerald-500" />
                          <h4 className="font-bold text-emerald-700 dark:text-emerald-400">
                            Strengths
                          </h4>
                        </div>
                        <ul className="space-y-4">
                          {feedback?.strengths && feedback.strengths.length > 0 ? (
                            feedback.strengths.map((item: string, i: number) => (
                              <li key={i} className="flex items-start gap-4">
                                <Check className="size-5 text-emerald-500 mt-0.5 shrink-0" />
                                <span className="text-[15px] font-medium text-muted-foreground leading-relaxed">
                                  {item}
                                </span>
                              </li>
                            ))
                          ) : (
                            <li className="text-muted-foreground italic">No strengths recorded</li>
                          )}
                        </ul>
                      </div>

                      {/* Improve */}
                      <div>
                        <div className="flex items-center gap-2 mb-6">
                          <AlertCircle className="size-5 text-amber-600 dark:text-amber-500" />
                          <h4 className="font-bold text-amber-700 dark:text-amber-400">
                            Improve
                          </h4>
                        </div>
                        <ul className="space-y-4">
                          {feedback?.improvements && feedback.improvements.length > 0 ? (
                            feedback.improvements.map((item: string, i: number) => {
                              const priorityMatch = item.match(/^\[(HIGH|MEDIUM|LOW)\]/i);
                              const priority = priorityMatch ? priorityMatch[1].toUpperCase() : "MEDIUM";
                              const text = item.replace(/^\[.*?\]\s*/, "");
                              
                              let badgeClass = "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20";
                              if (priority === "HIGH") badgeClass = "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20";
                              if (priority === "MEDIUM") badgeClass = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20";

                              return (
                                <li key={i} className="flex items-start gap-3">
                                  <div
                                    className={`text-[11px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border ${badgeClass} shrink-0 mt-0.5 min-w-16 text-center shadow-sm`}
                                  >
                                    {priority}
                                  </div>
                                  <span className="text-[15px] font-medium text-muted-foreground leading-relaxed">
                                    {text}
                                  </span>
                                </li>
                              );
                            })
                          ) : (
                            <li className="text-muted-foreground italic">No improvements suggested</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* <div className="mt-10 pt-6 border-t border-border/50">
                      <p className="text-[15px] text-muted-foreground font-medium">
                        Focus on{" "}
                        <span className="font-black text-foreground">
                          system design depth
                        </span>{" "}
                        and{" "}
                        <span className="font-black text-foreground">
                          answer brevity
                        </span>{" "}
                        — keep up the excellent interactivity and confidence
                        levels!
                      </p>
                    </div> */}
                  </div>
                )}
              </Card>

              {/* Chart Section */}
              <Card className="border border-border shadow-sm bg-card rounded-[2rem] overflow-hidden hidden md:block">
                <CardHeader className="p-8 pb-0">
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                    <TrendingUp className="size-5 text-primary" />
                    Interaction Timeline
                  </CardTitle>
                  <CardDescription className="text-muted-foreground font-medium">
                    Volume of activity and pacing during the session
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="h-75 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics?.chartData || []}>
                        <defs>
                          <linearGradient
                            id="colorCount"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#6366f1"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="95%"
                              stopColor="#6366f1"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--color-border, #f1f5f9)"
                        />
                        <XAxis
                          dataKey="time"
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fill: "var(--color-muted-foreground, #94a3b8)",
                            fontSize: 12,
                          }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fill: "var(--color-muted-foreground, #94a3b8)",
                            fontSize: 12,
                          }}
                        />
                        <Tooltip
                          content={<CustomTooltip />}
                          cursor={{
                            stroke: "#94a3b8",
                            strokeWidth: 1,
                            strokeDasharray: "4 4",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#6366f1"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorCount)"
                          name="Interactions"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : isGenerating ? (
            <div className="py-16 flex flex-col items-center justify-center gap-4">
              <div className="size-12 border-4 border-border border-t-primary rounded-full animate-spin" />
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                Generating analytics...
              </p>
            </div>
          ) : (
            <div className="py-16 flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-border bg-muted/30">
              <div className="p-4 bg-primary/10 rounded-2xl">
                <TrendingUp className="size-8 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  No Analytics Generated
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Generate AI-powered analytics for this session to view
                  performance insights, strengths, and areas for improvement.
                </p>
              </div>
              <Button onClick={handleGenerateAnalytics} className="gap-2">
                <TrendingUp className="size-4" />
                Generate Analytics
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
