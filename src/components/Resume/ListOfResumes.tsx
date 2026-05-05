"use client";

import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import type { ExportableData } from "@/components/data-table/utils/export-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Eye, Trash2 } from "lucide-react";
import ResumePreview from "./ResumePreview";
import { DeleteResumeDialog } from "./DeleteResumeDialog";
import { toast } from "sonner";

export interface Resume extends ExportableData {
  id: string;
  filename: string;
  uploadedAt: string;
  size?: number | string;
  score?: number;
  path?: string;
  ats?: boolean;
  atsAnalysis?: any;
}

interface ListOfResumesProps {
  userId: string;
  onSelectResume: (resume: Resume) => void;
  selectedResumeId?: string;
}

export default function ListOfResumes({
  userId,
  onSelectResume,
  selectedResumeId,
}: ListOfResumesProps) {
  const navigate = useNavigate();
  const [previewResume, setPreviewResume] = useState<Resume | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [resumeToDelete, setResumeToDelete] = useState<Resume | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Per-row ATS loading state: key = resumeId
  const [atsLoadingIds, setAtsLoadingIds] = useState<Record<string, boolean>>(
    {},
  );

  // ✅ FETCH FUNCTION (DataTable format)
  // Wrapped in useCallback so the reference only changes when userId changes,
  // preventing DataTable from re-fetching on every parent render.
  const fetchResumes = useCallback(async () => {
    if (!userId) {
      return { success: true, data: [], pagination: { page: 1, limit: 0, total_pages: 1, total_items: 0 } };
    }
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/resume/list?userId=${userId}`,
    );

    const data = await res.json();

    return {
      success: true,
      data,
      pagination: {
        page: 1,
        limit: data.length,
        total_pages: 1,
        total_items: data.length,
      },
    };
  }, [userId]);

  // ✅ ATS
  const handleATS = async (resume: Resume) => {
    setAtsLoadingIds((prev) => ({ ...prev, [resume.id]: true }));

    try {
      // If ATS boolean flag is true, try to fetch existing analysis first
      if (resume.ats) {
        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/resume/all-ats?userId=${userId}`,
        );
        const allAnalyzed = await res.json();
        const existing = allAnalyzed.find((r: any) => r.id === resume.id);

        if (existing?.atsAnalysis) {
          navigate("/resume/ats-result", {
            state: {
              analysis: {
                ...existing.atsAnalysis,
                filename: resume.filename,
              },
            },
          });
          return;
        }
      }

      // Otherwise (or if not found), run the analysis
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/resume/ats-score`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeId: resume.id }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze resume");
      }

      navigate("/resume/ats-result", {
        state: {
          analysis: {
            ...data,
            filename: resume.filename,
          },
        },
      });
    } catch (error: any) {
      console.error("ATS error:", error);
      toast.error(error.message || "Something went wrong");
    } finally {
      setAtsLoadingIds((prev) => ({ ...prev, [resume.id]: false }));
    }
  };

  // ✅ DELETE
  const handleDelete = (resume: Resume) => {
    setResumeToDelete(resume);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!resumeToDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/resume/${resumeToDelete.id}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) {
        throw new Error("Failed to delete resume");
      }

      setIsDeleteDialogOpen(false);
      setResumeToDelete(null);
      // Refresh the table
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete resume. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ COLUMNS — memoized so DataTable's getColumns dep doesn't bust on every render
  const columns: ColumnDef<Resume>[] = useMemo(() => [
    {
      accessorKey: "filename",
      header: "Resume Name",
      cell: ({ row }) => {
        const resume = row.original;

        return (
          <div
            onClick={() => onSelectResume(resume)}
            className={cn(
              "cursor-pointer font-medium",
              selectedResumeId === resume.id && "text-primary",
            )}
          >
            {resume.filename}
          </div>
        );
      },
    },
    {
      accessorKey: "uploadedAt",
      header: "Uploaded Date",
      cell: ({ row }) =>
        new Date(row.getValue("uploadedAt")).toLocaleDateString(),
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }) => row.getValue("size") || "—",
    },

    // 🔥 ACTIONS
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const resume = row.original;

        return (
          <div className="flex gap-2 justify-end">
            {/* VIEW */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setPreviewResume(resume);
                setIsPreviewOpen(true);
              }}
              className="h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
              title="View Resume"
            >
              <Eye className="h-4 w-4" />
            </Button>

            {/* ATS */}
            <Button
              size="sm"
              variant={resume.ats ? "outline" : "secondary"}
              onClick={() => handleATS(resume)}
              disabled={atsLoadingIds[resume.id]}
              className="h-8 px-3 font-semibold"
              title={
                resume.ats ? "View existing ATS result" : "Run ATS analysis"
              }
            >
              {atsLoadingIds[resume.id] ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Analyzing...
                </>
              ) : resume.ats ? (
                "View ATS"
              ) : (
                "ATS"
              )}
            </Button>

            {/* DELETE */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleDelete(resume)}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete Resume"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [onSelectResume, selectedResumeId, atsLoadingIds, handleATS, handleDelete]);

  return (
    <div className="space-y-4">
      {/* ✅ HEADER (kept from your UI) */}
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg font-semibold">Your resumes</h2>
      </div>

      {/* ✅ DATATABLE */}
      <DataTable
        key={refreshKey}
        getColumns={useCallback(() => columns, [columns])}
        fetchDataFn={fetchResumes}
        fetchByIdsFn={async () => []}
        idField="id"
        config={{
          enableSearch: false,
          enableRowSelection: false,
        }}
      />

      {/* ✅ PREVIEW MODAL (unchanged) */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="min-w-5xl w-[95vw] h-[95vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Resume: {previewResume?.filename}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden mt-4 w-full">
            {previewResume && <ResumePreview resume={previewResume} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* ✅ DELETE CONFIRMATION DIALOG */}
      <DeleteResumeDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        resumeName={resumeToDelete?.filename || ""}
        isDeleting={isDeleting}
      />
    </div>
  );
}
