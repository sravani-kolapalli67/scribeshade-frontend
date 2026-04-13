"use client";

import { useState, useEffect, useMemo } from "react";
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
  Award,
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
  content: string;
  timestamp: string;
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
  const [isLoading, setIsLoading] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(true);

  useEffect(() => {
    if (isOpen && session?.id) {
      const fetchDetails = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(
            `${import.meta.env.VITE_BACKEND_URL}/api/session/${session.id}`,
          );
          if (res.ok) {
            const data = await res.json();
            setMessages(data.messages || []);
          }
        } catch (error) {
          console.error("Error fetching session details for analytics:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchDetails();
    }
  }, [isOpen, session?.id]);

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
      .map((m) => new Date(m.timestamp).getTime())
      .filter((t) => !isNaN(t));
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);
    const durationMs = endTime - startTime;
    const durationMin = Math.round(durationMs / 60000);

    // Calculate average response length
    const totalChars = aiMessages.reduce((acc, m) => acc + m.content.length, 0);
    const avgChars = aiMessages.length
      ? Math.round(totalChars / aiMessages.length)
      : 0;

    // Chart data: Interactions over time (bucketed by minute)
    const chartDataMap: Record<string, number> = {};
    messages.forEach((m) => {
      const date = new Date(m.timestamp);
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
      duration: durationMin || "< 1",
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
          ) : (
            <div className="space-y-6">
              {/* Top Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Score", value: "88%" },
                  { label: "Confidence", value: "94%" },
                  { label: "Session Quality", value: "Excellent" },
                  {
                    label: "Avg. Response",
                    value: analytics?.avgResponseLength,
                  },
                  {
                    label: "Answered",
                    value: `${analytics?.questions || 14}`,
                  },
                  { label: "AI Assists", value: analytics?.aiResponses || 0 },
                  {
                    label: "Avg. Response",
                    value: "4.2s",
                  },
                  { label: "Verdict", value: "Strong Pass" },
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
                      88%
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
                        Communication <span className="font-bold">92%</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 text-sm font-semibold flex items-center gap-2 border border-blue-500/20">
                        Interactivity <span className="font-bold">85%</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm font-semibold flex items-center gap-2 border border-emerald-500/20">
                        Confidence <span className="font-bold">94%</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 text-sm font-semibold flex items-center gap-2 border border-slate-500/20">
                        Technical Depth <span className="font-bold">79%</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm font-semibold flex items-center gap-2 border border-amber-500/20">
                        Conciseness <span className="font-bold">72%</span>
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
                          {[
                            "Highly interactive and dynamic session, effectively maintained two-way dialogue",
                            "Consistently demonstrated high confidence through steady, assured communication",
                            "Strong use of quantified impact and clear examples",
                            "Direct, poised delivery with excellent problem-solving demeanor",
                          ].map((item, i) => (
                            <li key={i} className="flex items-start gap-4">
                              <Check className="size-5 text-emerald-500 mt-0.5 shrink-0" />
                              <span className="text-[15px] font-medium text-muted-foreground leading-relaxed">
                                {item}
                              </span>
                            </li>
                          ))}
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
                          {[
                            {
                              level: "High",
                              text: "Over-explaining — answers ran a bit longer than necessary",
                              badgeClass:
                                "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
                            },
                            {
                              level: "High",
                              text: "System design answers could use more explicit technical depth",
                              badgeClass:
                                "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
                            },
                            {
                              level: "Medium",
                              text: "Missed validating understanding before diving into problem solutions",
                              badgeClass:
                                "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20",
                            },
                            {
                              level: "Low",
                              text: "Closing statements could be noticeably stronger",
                              badgeClass:
                                "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
                            },
                          ].map((item, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <div
                                className={`text-[11px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border ${item.badgeClass} shrink-0 mt-0.5 min-w-16 text-center shadow-sm`}
                              >
                                {item.level}
                              </div>
                              <span className="text-[15px] font-medium text-muted-foreground leading-relaxed">
                                {item.text}
                              </span>
                            </li>
                          ))}
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
