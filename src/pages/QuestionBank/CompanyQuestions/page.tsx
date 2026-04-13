import { useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MOCK_COMPANIES, Question } from "../data";
import { FileText } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { QuestionFilters } from "../components/QuestionFilters";

const CompanyQuestions = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  // Filter states
  const [difficulty, setDifficulty] = useState<string>("all");
  const [industry, setIndustry] = useState<string>("all");
  const [language, setLanguage] = useState<string>("all");

  const company = MOCK_COMPANIES.find((c) => c.id === companyId);

  const fetchQuestions = useCallback(async (params: any) => {
    if (!company)
      return {
        success: false,
        data: [],
        pagination: { page: 1, limit: 10, total_pages: 0, total_items: 0 },
      };

    const search = (params.search || "").toLowerCase();
    
    const filtered = company.questions.filter((q) => {
      const matchesSearch = q.title.toLowerCase().includes(search) || 
                           q.category.toLowerCase().includes(search);
      const matchesDifficulty = difficulty === "all" || q.difficulty === difficulty;
      const matchesIndustry = industry === "all" || q.industry === industry;
      const matchesLanguage = language === "all" || q.language === language;
      
      return matchesSearch && matchesDifficulty && matchesIndustry && matchesLanguage;
    });

    return {
      success: true,
      data: filtered,
      pagination: {
        page: 1,
        limit: filtered.length || 1,
        total_pages: 1,
        total_items: filtered.length,
      },
    };
  }, [company, difficulty, industry, language]);

  const columns: ColumnDef<Question>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Question Title",
        cell: ({ row }) => (
          <div
            onClick={() =>
              navigate(
                `/questions/company/${company?.id}/question/${row.original.id}`,
              )
            }
            className="flex items-center gap-4 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 group-hover:bg-brand-muted group-hover:text-brand transition-colors shadow-sm">
              <FileText className="w-4 h-4" />
            </div>
            <span className="font-medium text-gray-900 group-hover:text-brand transition-colors">
              {row.getValue("title")}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
            {row.getValue("industry")}
          </span>
        ),
      },
      {
        accessorKey: "language",
        header: "Language",
        cell: ({ row }) => (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-muted text-brand-active border border-brand-subtle">
            {row.getValue("language")}
          </span>
        ),
      },
      {
        accessorKey: "difficulty",
        header: "Difficulty",
        cell: ({ row }) => {
          const diff = row.getValue("difficulty") as string;
          return (
            <span
              className={`inline-flex items-center justify-center px-3 py-1 text-xs font-semibold rounded-full border shadow-sm
            ${
              diff === "Easy"
                ? "bg-green-50 text-green-700 border-green-200"
                : diff === "Medium"
                  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                  : "bg-red-50 text-red-700 border-red-200"
            }`}
            >
              {diff}
            </span>
          );
        },
      },
    ],
    [navigate, company?.id],
  );

  if (!company) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-red-600">Company not found</h1>
        <button
          onClick={() => navigate("/questions/all")}
          className="text-indigo-600 hover:underline mt-4"
        >
          Back to All Questions
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer hover:text-gray-900 transition-colors text-sm"
                onClick={() => navigate("/questions/all")}
              >
                All Questions
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium tracking-tight text-gray-900 text-sm">
                {company.name}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="p-6 overflow-x-auto flex-1">
        <DataTable<Question, unknown>
          config={{
            enableSearch: true,
            searchPlaceholder: "Search questions...",
            size: "default",
          }}
          getColumns={() => columns}
          fetchDataFn={fetchQuestions}
          idField="id"
          fetchByIdsFn={async () => []}
          renderToolbarContent={() => (
            <QuestionFilters
              difficulty={difficulty}
              setDifficulty={setDifficulty}
              industry={industry}
              setIndustry={setIndustry}
              language={language}
              setLanguage={setLanguage}
              onClear={() => {
                setDifficulty("all");
                setIndustry("all");
                setLanguage("all");
              }}
            />
          )}
        />
      </div>
    </div>
  );
};

export default CompanyQuestions;
