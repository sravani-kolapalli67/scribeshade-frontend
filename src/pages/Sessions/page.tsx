"use client";

import { useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Trash2, FileText, BarChart3 } from "lucide-react";
import { TranscriptDialog } from "./TranscriptDialog";
import { SessionAnalyticsDialog } from "./SessionAnalyticsDialog";
import type { ExportableData } from "@/components/data-table/utils/export-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Define Session interface
interface Session extends ExportableData {
  id: string;
  companyName: string;
  jobDescription: string;
  mode: "url" | "manual";
  free: boolean;
  aiUsage?: number;
  status?: "Ended" | "Active";
  createdAt: string;
  updatedAt: string;
  autoGenerateResponse: boolean;
  saveTranscription: boolean;
}

export default function Sessions() {
  const userId = localStorage.getItem("userId");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [isTranscriptDialogOpen, setIsTranscriptDialogOpen] = useState(false);
  const [isAnalyticsDialogOpen, setIsAnalyticsDialogOpen] = useState(false);
  const [selectedSessionForAnalytics, setSelectedSessionForAnalytics] =
    useState<Session | null>(null);

  // ✅ FETCH DATA FUNCTION
  const fetchSessions = async (params: any) => {
    try {
      const page = params.page || 1;
      const limit = params.limit || 10;
      const search = params.search || "";
      const fromDate = params.from_date || "";
      const toDate = params.to_date || "";

      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/session/list?userId=${userId}&search=${search}&from_date=${fromDate}&to_date=${toDate}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!res.ok) throw new Error("Failed to fetch sessions");

      const data = await res.json();
      const sessions = Array.isArray(data) ? data : data.data || [];

      // Manual client-side pagination
      const total_items = sessions.length;
      const total_pages = Math.ceil(total_items / limit);
      const startIndex = (page - 1) * limit;
      const paginatedData = sessions.slice(startIndex, startIndex + limit);

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
    } catch (error) {
      console.error("Error fetching sessions:", error);
      return {
        success: false,
        data: [],
        pagination: { page: 1, limit: 10, total_pages: 0, total_items: 0 },
      };
    }
  };

  const handleDeleteClick = (id: string) => {
    setSessionToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionToDelete}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        setRefreshKey((prev) => prev + 1);
        setIsDeleteDialogOpen(false);
      }
    } catch (error) {
      console.error("Delete error:", error);
    } finally {
      setIsDeleting(false);
      setSessionToDelete(null);
    }
  };

  // ✅ COLUMN DEFINITIONS
  const columns: ColumnDef<Session>[] = useMemo(
    () => [
      {
        accessorKey: "companyName",
        header: "Company Name",
        cell: ({ row }) => (
          <span className="font-bold text-foreground truncate max-w-48 block">
            {row.getValue("companyName") || (row.original as any).company?.name || ""}
          </span>
        ),
      },
      {
        accessorKey: "jobDescription",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm truncate max-w-64 block">
            {row.getValue("jobDescription") || "No description provided"}
          </span>
        ),
      },
      {
        accessorKey: "aiUsage",
        header: "AI Usage",
        cell: ({ row }) => (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-border shadow-[0_2px_4px_rgba(0,0,0,0.05)] text-[13px] font-bold">
            {row.getValue("aiUsage") || "0"}
          </div>
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
              onClick={() => {
                setSelectedSessionForAnalytics(row.original);
                setIsAnalyticsDialogOpen(true);
              }}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedSessionId(row.original.id);
                setIsTranscriptDialogOpen(true);
              }}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteClick(row.original.id)}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <DataTable<Session, unknown>
        key={refreshKey}
        config={{
          enableSearch: true,
          enableDateFilter: true,
          enableExport: true,
          enableColumnVisibility: true,
          enableRowSelection: true,
          searchPlaceholder: "Search by company or role...",
          size: "default",
        }}
        getColumns={() => columns}
        fetchDataFn={fetchSessions}
        idField="id"
        exportConfig={{
          entityName: "Sessions",
          columnMapping: {
            companyName: "Company Name",
            jobDescription: "Description",
            aiUsage: "AI Usage",
            createdAt: "Created At",
          },
          columnWidths: [{ wch: 20 }, { wch: 40 }, { wch: 10 }, { wch: 15 }],
          headers: ["companyName", "jobDescription", "aiUsage", "createdAt"],
        }}
        fetchByIdsFn={async () => []}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Delete Call Session
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground mt-2">
              Are you sure you want to delete this call session? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="px-6 h-11 font-medium rounded-xl"
              disabled={isDeleting}
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="px-6 h-11 font-medium rounded-xl transition-colors"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TranscriptDialog
        isOpen={isTranscriptDialogOpen}
        onClose={() => {
          setIsTranscriptDialogOpen(false);
          setSelectedSessionId(null);
        }}
        sessionId={selectedSessionId || ""}
        onDelete={(id: string) => {
          setIsTranscriptDialogOpen(false);
          handleDeleteClick(id);
        }}
      />

      <SessionAnalyticsDialog
        isOpen={isAnalyticsDialogOpen}
        onClose={() => {
          setIsAnalyticsDialogOpen(false);
          setSelectedSessionForAnalytics(null);
        }}
        session={selectedSessionForAnalytics}
      />
    </div>
  );
}
