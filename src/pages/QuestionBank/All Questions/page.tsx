import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MOCK_COMPANIES, Company } from "../data";
import { Building2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";

const AllQuestions = () => {
  const navigate = useNavigate();

  const fetchCompanies = async (params: any) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/company`);
      if (!res.ok) throw new Error("Failed to fetch companies");
      const companies = await res.json();

      const search = (params.search || "").toLowerCase();
      const filtered = companies.filter(
        (c: any) =>
          c.name.toLowerCase().includes(search) ||
          (c.description && c.description.toLowerCase().includes(search)),
      );

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
      console.error("fetchCompanies Error:", error);
      return { success: false, data: [] };
    }
  };

  const columns: ColumnDef<Company>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Company Name",
        cell: ({ row }) => (
          <div
            onClick={() => navigate(`/questions/company/${row.original.id}`)}
            className="flex items-center gap-4 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-lg bg-brand-muted border border-brand-subtle flex items-center justify-center text-brand group-hover:bg-brand group-hover:text-white group-hover:border-brand-hover transition-all shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="font-semibold text-gray-900 group-hover:text-brand transition-colors">
              {row.getValue("name")}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "questionCount",
        header: "Available Questions",
        cell: ({ row }) => {
          const count = (row.original as any)._count?.questions || 0;
          return (
            <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-semibold rounded-full bg-brand-muted text-brand-active border border-brand-subtle shadow-sm">
              {count} Questions
            </span>
          );
        },
      },
    ],
    [navigate],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 overflow-x-auto flex-1">
        <DataTable<Company, unknown>
          config={{
            enableSearch: true,
            searchPlaceholder: "Search companies...",
            size: "default",
          }}
          getColumns={() => columns}
          fetchDataFn={fetchCompanies}
          idField="id"
          fetchByIdsFn={async () => []}
        />
      </div>
    </div>
  );
};

export default AllQuestions;
