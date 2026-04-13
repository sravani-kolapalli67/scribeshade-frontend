"use client";

import { useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import type { ExportableData } from "@/components/data-table/utils/export-utils";

interface DocumentData extends ExportableData {
  id: string;
  name: string;
  createdAt: string;
}

export default function DocumentPage() {
  const [refreshKey] = useState(0);

  const fetchDocuments = async (params: any) => {
    const page = params?.page || 1;
    const limit = params?.limit || 10;

    // Mock data for now since we don't have an API yet
    const docs = [
      { id: "1", name: "Resume_2024.pdf", createdAt: new Date().toISOString() },
      {
        id: "2",
        name: "CoverLetter.docx",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    const total_items = docs.length;
    const total_pages = Math.ceil(total_items / limit);
    const startIndex = (page - 1) * limit;
    const paginatedData = docs.slice(startIndex, startIndex + limit);

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
  };

  const columns: ColumnDef<DocumentData>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Document Name",
        cell: ({ row }) => (
          <span className="font-medium text-foreground truncate max-w-75 block">
            {row.getValue("name")}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created At",
        cell: ({ row }) => {
          const date = new Date(row.getValue("createdAt"));
          return (
            <span className="text-muted-foreground text-sm font-medium">
              {date.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2 pr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => console.log("View", row.original.id)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* <div className="flex justify-between items-center bg-white p-6 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Documents</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage and view your uploaded documents.</p>
        </div>
      </div> */}

      <div className="">
        <DataTable<DocumentData, unknown>
          key={refreshKey}
          config={{
            enableSearch: true,
            enableDateFilter: false,
            enableExport: false,
            enableColumnVisibility: true,
            enableRowSelection: false,
            searchPlaceholder: "Search documents...",
            size: "default",
          }}
          getColumns={() => columns}
          fetchDataFn={fetchDocuments}
          idField="id"
        />
      </div>
    </div>
  );
}
