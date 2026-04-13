import { useParams, useNavigate } from "react-router-dom";
import { USER_QUESTIONS } from "../data";
import {
  ArrowLeft,
  Briefcase,
  Code2,
  Tag,
  MessageCircle,
  Trophy,
  Calendar,
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

const UserQuestionDetails = () => {
  const { questionId } = useParams<{ questionId: string }>();
  const navigate = useNavigate();

  const question = USER_QUESTIONS.find((q) => q.id === questionId);

  if (!question) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-100">
        <h1 className="text-xl font-bold text-gray-900">Question not found</h1>
        <p className="text-gray-500 mt-2">
          The question you are looking for does not exist or has been moved.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate("/questions/user")}
          className="mt-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Your Questions
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
                onClick={() => navigate("/questions/user")}
              >
                User Questions
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium truncate max-w-50 tracking-tight text-gray-900 text-xs">
                {question.title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="bg-brand-muted/50 text-brand-active border-brand-subtle font-semibold px-2.5 py-0.5"
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Created at{" "}
                {new Date(question.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </Badge>
              <Badge
                variant="outline"
                className={`font-semibold px-2.5 py-0.5 ${
                  question.difficulty === "Easy"
                    ? "bg-green-50 text-green-700 border-green-100"
                    : question.difficulty === "Medium"
                      ? "bg-yellow-50 text-yellow-700 border-yellow-100"
                      : "bg-red-50 text-red-700 border-red-100"
                }`}
              >
                <Trophy className="w-3.5 h-3.5 mr-1.5" />
                {question.difficulty}
              </Badge>
            </div>

            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
              {question.title}
            </h1>

            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 border-y border-gray-100 py-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center text-brand">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 leading-none mb-1">
                    Industry
                  </p>
                  <p className="font-semibold text-gray-700">
                    {question.industry}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center text-brand">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 leading-none mb-1">
                    Language
                  </p>
                  <p className="font-semibold text-gray-700">
                    {question.language}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-muted flex items-center justify-center text-brand">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 leading-none mb-1">
                    Category
                  </p>
                  <p className="font-semibold text-gray-700">
                    {question.category}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/questions/user")}
            className="hidden md:flex items-center gap-2 self-start mt-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to List
          </Button>
        </div>
      </div>

      <div className="p-6 pt-0 flex-1 overflow-y-auto">
        <div className="max-w-5xl">
          <div className="bg-gray-50/50 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-white border-b border-gray-200 p-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shadow-lg shadow-brand/20">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 leading-none">
                  Answer
                </h3>
                {/* <p className="text-xs text-gray-500 mt-1">Detailed explanation and solution approach</p> */}
              </div>
            </div>

            <div className="p-8 md:p-10 bg-[#F8FAFF] rounded-b-2xl">
              <div className="max-w-none">
                <MarkdownRenderer content={question.answer} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserQuestionDetails;
