"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import type { ExportableData } from "@/components/data-table/utils/export-utils";

interface ResumeEntry extends ExportableData {
  id: string;
  title: string;
  template: string;
  lastModified: string;
  status: string;
}

export default function BuildResume() {
  const fetchResumes = async () => {
    // Returning empty rows as requested
    return {
      success: true,
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        total_pages: 0,
        total_items: 0,
      },
    };
  };

  const columns: ColumnDef<ResumeEntry>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Resume Title",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.getValue("title") || (
              <span className="text-muted-foreground/30 italic">
                Untitled Resume
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "template",
        header: "Template",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.getValue("template") || "—"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue("status") as string;
          if (!status)
            return (
              <Badge variant="outline" className="opacity-30">
                Draft
              </Badge>
            );
          return <Badge>{status}</Badge>;
        },
      },
      {
        accessorKey: "lastModified",
        header: "Last Modified",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.getValue("lastModified") || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-2">
        <DataTable<ResumeEntry, unknown>
          idField="id"
          getColumns={() => columns}
          fetchDataFn={fetchResumes}
          config={{
            enableSearch: true,
            enableColumnVisibility: true,
            searchPlaceholder: "Search resumes...",
          }}
        />
      </div>
    </div>
  );
}
