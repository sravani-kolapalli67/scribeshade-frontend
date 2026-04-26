import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Code2,
  Tag,
  MessageCircle,
  Trophy,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

const QuestionDetails = () => {
  const { companyId, questionId } = useParams<{
    companyId: string;
    questionId: string;
  }>();
  const navigate = useNavigate();

  const [question, setQuestion] = useState<any>(null);
  const [company, setCompany] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!questionId || !companyId) return;
      setLoading(true);
      try {
        // Fetch Question
        const qRes = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/qa/${questionId}`,
        );
        if (qRes.ok) {
          const qData = await qRes.json();
          setQuestion(qData);
        }

        // Fetch Company
        const cRes = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/company/${companyId}`,
        );
        if (cRes.ok) {
          const cData = await cRes.json();
          setCompany(cData);
        }
      } catch (error) {
        console.error("Error fetching question details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [questionId, companyId]);

  const formatEnum = (val: string) => {
    if (!val) return "";
    return val
      .replace(/_/g, " ")
      .replace("Plus Plus", "++")
      .replace("Sharp", "#");
  };

  const handleCopyAll = () => {
    if (question?.answer) {
      navigator.clipboard.writeText(question.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-white p-6">
        <div className="animate-pulse space-y-8">
          <div className="h-4 bg-gray-100 rounded w-1/4"></div>
          <div className="space-y-4">
            <div className="h-10 bg-gray-100 rounded w-3/4"></div>
            <div className="h-6 bg-gray-50 rounded w-1/2"></div>
          </div>
          <div className="h-64 bg-gray-50 rounded-2xl w-full"></div>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
        <h1 className="text-xl font-bold text-gray-900">Question not found</h1>
        <p className="text-gray-500 mt-2">
          The question you are looking for does not exist or has been moved.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate("/questions/all")}
          className="mt-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to All Questions
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-6 pb-0">
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer hover:text-gray-900 transition-colors text-xs"
                onClick={() => navigate("/questions/all")}
              >
                All Questions
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer hover:text-gray-900 transition-colors text-xs"
                onClick={() => navigate(`/questions/company/${companyId}`)}
              >
                {company?.name || "Company"}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium truncate max-w-[200px] tracking-tight text-gray-900 text-xs">
                {question.ques}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-gray-100 pb-8">
          <div className="space-y-4 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="bg-brand-muted/50 text-brand-active border-brand-subtle font-semibold px-2.5 py-0.5"
              >
                <Globe className="w-3.5 h-3.5 mr-1.5" />
                {company?.name || "Company"}
              </Badge>
              <span
                className={`inline-flex items-center justify-center px-2.5 py-0.5 text-xs font-bold rounded-full border
                ${
                  question.difficulty === "Easy"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : question.difficulty === "Medium"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                <Trophy className="w-3.5 h-3.5 mr-1.5" />
                {question.difficulty}
              </span>
            </div>

            <h1 className="text-md font-medium text-gray-900 tracking-tight leading-tight max-w-4xl">
              {question.ques}
            </h1>

            <div className="flex flex-wrap items-center gap-8 text-sm text-gray-500 pt-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 shadow-sm">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] font-black text-slate-400 leading-none mb-1.5">
                    Industry
                  </p>
                  <p className="font-bold text-slate-700 text-base">
                    {formatEnum(question.industry)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shadow-sm">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] font-black text-slate-400 leading-none mb-1.5">
                    Language
                  </p>
                  <p className="font-bold text-slate-700 text-base">
                    {formatEnum(question.language)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] font-black text-slate-400 leading-none mb-1.5">
                    Difficulty
                  </p>
                  <p className="font-bold text-slate-700 text-base">
                    {question.difficulty}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/questions/company/${companyId}`)}
            className="hidden md:flex items-center gap-2 self-start mt-2 border-slate-200 hover:bg-slate-50 rounded-xl px-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to List
          </Button>
        </div>
      </div>

      <div className="p-6 pt-0 flex-1 overflow-y-auto">
        <div className="max-w-5xl">
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="bg-slate-50/50 border-b border-slate-100 p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shadow-lg shadow-brand/20">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 leading-none uppercase tracking-wide">
                    Suggested Answer
                  </h3>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyAll}
                className="h-9 px-4 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 text-slate-500 hover:text-slate-900 transition-all gap-2"
              >
                {copied ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <Copy className="size-4" />
                )}
                <span className="text-xs font-bold uppercase tracking-wider">
                  {copied ? "Copied!" : "Copy"}
                </span>
              </Button>
            </div>

            <div className="p-8 md:p-12">
              <div className="max-w-none">
                <MarkdownRenderer
                  content={question.answer || "No answer provided."}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestionDetails;
