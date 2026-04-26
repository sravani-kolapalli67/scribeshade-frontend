import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UserQuestion } from "../data";
import { FileQuestion, Calendar } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { QuestionFilters } from "../components/QuestionFilters";

const UserQuestions = () => {
  const navigate = useNavigate();
  const userId = localStorage.getItem("userId");

  // Filter states
  const [difficulty, setDifficulty] = useState<string>("all");
  const [industry, setIndustry] = useState<string>("all");
  const [language, setLanguage] = useState<string>("all");

  const fetchQuestions = useCallback(
    async (params: any) => {
      try {
        if (!userId) return { success: false, data: [] };

        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/qa/user/${userId}`,
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
    [userId, difficulty, industry, language],
  );

  const columns: ColumnDef<any>[] = useMemo(
    () => [
      {
        accessorKey: "ques",
        header: "Question Title",
        cell: ({ row }) => (
          <div
            onClick={() =>
              navigate(`/questions/user/question/${row.original.id}`)
            }
            className="flex items-center gap-4 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 group-hover:bg-brand-muted group-hover:text-brand transition-colors shadow-sm">
              <FileQuestion className="w-4 h-4" />
            </div>
            <span className="font-medium text-gray-900 group-hover:text-brand transition-colors truncate max-w-md">
              {row.getValue("ques")}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-muted text-brand-active border border-brand-subtle">
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
        accessorKey: "createdAt",
        header: "Created At",
        cell: ({ row }) => (
          <span className="flex items-center text-gray-500 text-sm font-medium">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
            {new Date(row.getValue("createdAt")).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
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
    [navigate],
  );

  return (
    <div className="flex flex-col h-full ">
      <div className="p-6 overflow-x-auto flex-1">
        <DataTable<any, unknown>
          config={{
            enableSearch: true,
            searchPlaceholder: "Search your questions...",
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

export default UserQuestions;
