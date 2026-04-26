import { useMemo, useState, useCallback, useEffect } from "react";
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
  const [companyMetaData, setCompanyMetaData] = useState<{
    name: string;
  } | null>(null);

  useEffect(() => {
    if (companyId) {
      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/company/${companyId}`)
        .then((res) => res.json())
        .then((data) => setCompanyMetaData(data))
        .catch((err) => console.error("Fetch Metadata Error:", err));
    }
  }, [companyId]);

  const fetchQuestions = useCallback(
    async (params: any) => {
      try {
        if (!companyId) return { success: false, data: [] };

        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/qa/company/${companyId}`,
        );
        if (!res.ok) throw new Error("Failed to fetch questions");
        const questions = await res.json();

        const search = (params.search || "").toLowerCase();

        const filtered = questions.filter((q: any) => {
          const matchesSearch =
            (q.ques || "").toLowerCase().includes(search) ||
            (q.category || "").toLowerCase().includes(search);
          const matchesDifficulty =
            difficulty === "all" || q.difficulty === difficulty;
          const matchesIndustry = industry === "all" || q.industry === industry;
          const matchesLanguage = language === "all" || q.language === language;

          return (
            matchesSearch &&
            matchesDifficulty &&
            matchesIndustry &&
            matchesLanguage
          );
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
      } catch (error) {
        console.error("fetchQuestions Error:", error);
        return { success: false, data: [] };
      }
    },
    [companyId, difficulty, industry, language],
  );

  const columns: ColumnDef<Question>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Question Title",
        cell: ({ row }) => (
          <div
            onClick={() =>
              navigate(
                `/questions/company/${companyId}/question/${row.original.id}`,
              )
            }
            className="flex items-center gap-4 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 group-hover:bg-brand-muted group-hover:text-brand transition-colors shadow-sm">
              <FileText className="w-4 h-4" />
            </div>
            <span className="font-medium text-gray-900 group-hover:text-brand transition-colors">
              {(row.original as any).ques}
            </span>
          </div>
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
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
            {row.getValue("industry")}
          </span>
        ),
      },
    ],
    [navigate, companyId],
  );

  if (!companyId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-red-600">Company ID missing</h1>
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
                {companyMetaData?.name || "Loading..."}
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
