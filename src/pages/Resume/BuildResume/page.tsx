"use client";

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ENDPOINTS } from "@/lib/endpoints";
import type { ExportableData } from "@/components/data-table/utils/export-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";

interface ResumeEntry extends ExportableData {
  id: string;
  title: string;
  template: string;
  lastModified: string;
  status: string;
}

export default function BuildResume() {
  const { getToken } = useAuth();
  const navigate     = useNavigate();

  // Tracks which resume is being opened (shows spinner in the row)
  const [openingId, setOpeningId]   = useState<string | null>(null);
  // Tracks delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting]     = useState(false);
  // Forces DataTable to refetch after delete
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchResumes = useCallback(async () => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      return { success: true, data: [], pagination: { page: 1, limit: 10, total_pages: 0, total_items: 0 } };
    }
    const token = await getToken();
    const res = await fetch(ENDPOINTS.resumeBuilderList(userId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { success: false, data: [], pagination: { page: 1, limit: 10, total_pages: 0, total_items: 0 } };
    }
    const json = await res.json();
    const raw: any[] = json.resumes ?? json.data ?? [];
    return {
      success: true,
      data: raw.map((r) => ({
        id:           r.id,
        title:        r.title || "Untitled Resume",
        template:     r.templateId
          ? r.templateId.charAt(0).toUpperCase() + r.templateId.slice(1)
          : "—",
        status:       r.status || "draft",
        lastModified: r.updatedAt
          ? new Date(r.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
          : "—",
      })) as ResumeEntry[],
      pagination: {
        page:        1,
        limit:       raw.length || 10,
        total_pages: 1,
        total_items: raw.length,
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, refreshKey]);

  // ── Open existing resume in editor ─────────────────────────────────────────
  const handleOpen = useCallback(async (id: string) => {
    if (openingId) return;
    setOpeningId(id);
    try {
      const token = await getToken();
      const res = await fetch(ENDPOINTS.resumeBuilderGet(id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load resume");
      const r = json.resume ?? json;
      navigate("/resume/editor", {
        state: {
          config: {
            sourceType:    "builder",   // handled by configToFields in the editor
            resumeId:      r.id,
            resumeTitle:   r.title,
            fields:        r.fields,    // flat ResumeFields object stored by builder/save
            templateId:    r.templateId,
            templateCode:  r.templateCode ?? null,
            jobDescription: r.jobDescription ?? "",
            jobTitle:       r.jobTitle ?? "",
            company:        r.company  ?? "",
          },
        },
      });
    } catch (err) {
      console.error("[BuildResume] open error:", err);
    } finally {
      setOpeningId(null);
    }
  }, [getToken, navigate, openingId]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const token = await getToken();
      await fetch(ENDPOINTS.resumeBuilderDelete(deleteTarget.id), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);  // trigger DataTable refetch
    } catch (err) {
      console.error("[BuildResume] delete error:", err);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, getToken]);

  // ── Columns ─────────────────────────────────────────────────────────────────
  const columns: ColumnDef<ResumeEntry>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Resume Title",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.getValue("title") || (
              <span className="text-muted-foreground/30 italic">Untitled Resume</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "template",
        header: "Template",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.getValue("template") || "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = (row.getValue("status") as string) || "draft";
          return (
            <Badge
              variant={status === "draft" ? "outline" : "default"}
              className={status === "draft" ? "text-muted-foreground" : ""}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          );
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
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const id    = row.original.id;
          const title = row.original.title;
          const isOpening = openingId === id;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isOpening}>
                  {isOpening
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpen(id)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Open in Editor
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteTarget({ id, title })}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openingId, handleOpen],
  );

  return (
    <>
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resume?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.title}</strong> will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

