"use client";

import { useState, useCallback, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import type { ExportableData } from "@/components/data-table/utils/export-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ChevronRight, FileText, Calendar, Sparkles } from "lucide-react";

interface ProjectRecord extends ExportableData {
  id: string;
  position: string;
  jobDescription: string;
  resumeId: string | null;
  projects: any[];
  userId: string;
  createdAt: string;
}

export function AIProjectsTable() {
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchProjects = useCallback(async (params: any) => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      return {
        success: false,
        data: [],
        pagination: { page: 1, limit: 10, total_pages: 0, total_items: 0 },
      };
    }

    try {
      const search = params?.search || "";
      const limit = params?.limit || 10;
      const page = params?.page || 1;

      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/projects/user/${userId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      const allProjects = Array.isArray(data) ? data : [];

      // Filter by search
      const filtered = allProjects.filter(
        (p) =>
          p.position.toLowerCase().includes(search.toLowerCase()) ||
          p.jobDescription.toLowerCase().includes(search.toLowerCase()),
      );

      // Sort
      if (params?.sort_by) {
        filtered.sort((a: any, b: any) => {
          const aValue = a[params.sort_by];
          const bValue = b[params.sort_by];
          if (aValue < bValue) return params.sort_order === "asc" ? -1 : 1;
          if (aValue > bValue) return params.sort_order === "asc" ? 1 : -1;
          return 0;
        });
      }

      // Manual client-side pagination
      const total_items = filtered.length;
      const total_pages = Math.ceil(total_items / limit);
      const startIndex = (page - 1) * limit;
      const paginatedData = filtered.slice(startIndex, startIndex + limit);

      return {
        success: true,
        data: paginatedData,
        pagination: {
          page: page,
          limit: limit,
          total_pages: total_pages,
          total_items: total_items,
        },
      };
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      return {
        success: false,
        data: [],
        pagination: { page: 1, limit: 10, total_pages: 0, total_items: 0 },
      };
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const columns: ColumnDef<ProjectRecord>[] = useMemo(
    () => [
      {
        accessorKey: "position",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Target Position" />
        ),
        cell: ({ row }) => {
          const project = row.original;
          return (
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {project.position}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  {project.jobDescription.slice(0, 80)}
                  {project.jobDescription.length > 80 ? "..." : ""}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Generated Date" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(row.getValue("createdAt")).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        ),
      },
      {
        id: "projectCount",
        header: "Projects",
        cell: ({ row }) => {
          const project = row.original;
          const count = Array.isArray(project.projects)
            ? project.projects.length
            : 0;
          return (
            <Badge
              variant="secondary"
              className="rounded-md px-2.5 py-1 text-xs font-semibold bg-primary/5 text-primary border border-primary/10"
            >
              {count} Projects
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Action</div>,
        cell: ({ row }) => {
          const project = row.original;
          return (
            <div className="flex justify-end">
              <Link to={`/ai-projects/${project.id}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg text-xs font-semibold gap-1 hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  View
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <DataTable
        key={refreshKey}
        getColumns={() => columns}
        fetchDataFn={fetchProjects}
        fetchByIdsFn={async () => []}
        idField="id"
        config={{
          enableSearch: true,
          enableRowSelection: true,
          enableColumnVisibility: true,
          enableExport: true,
          searchPlaceholder: "Search projects...",
        }}
        exportConfig={{
          entityName: "AI Projects",
          columnMapping: {
            position: "Position",
            createdAt: "Generated Date",
          },
          columnWidths: [{ wch: 30 }, { wch: 20 }],
          headers: ["position", "createdAt"],
        }}
      />
    </div>
  );
}
