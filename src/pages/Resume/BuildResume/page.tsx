"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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

// Display strings shown in cells / export; raw numeric timestamps used for sorting/filtering
interface ResumeEntry extends ExportableData {
  id: string;
  title: string;
  template: string;
  status: string;
  createdAt: string;       // formatted display string
  lastModified: string;    // formatted display string
  _createdAtMs: number;    // epoch ms — used for sorting & date-range filtering
  _updatedAtMs: number;    // epoch ms — used for sorting & date-range filtering
}

const DATE_FMT: Intl.DateTimeFormatOptions = {
  year: "numeric", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit",
};

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", DATE_FMT);
}

export default function BuildResume() {
  const { getToken } = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();

  // Raw API cache — populated once per navigation; search/sort/page applied in fetchDataFn
  const rawCacheRef  = useRef<any[] | null>(null);

  // Tracks which resume is being opened (shows spinner in the row)
  const [openingId, setOpeningId]   = useState<string | null>(null);
  // Tracks delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting]     = useState(false);
  // Forces DataTable to refetch after delete or navigation back from editor
  const [refreshKey, setRefreshKey] = useState(0);

  // Invalidate cache when page is revisited or after a mutation
  useEffect(() => {
    rawCacheRef.current = null;
    setRefreshKey((k) => k + 1);
  }, [location.key]);

  // ── Fetch list (handles search / date / sort / pagination client-side) ──────
  const fetchResumes = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      from_date: string;
      to_date: string;
      sort_by: string;
      sort_order: string;
    }) => {
      // ── 1. Load raw data from API (cached) ────────────────────────────────
      if (!rawCacheRef.current) {
        const userId = localStorage.getItem("userId");
        if (!userId) {
          return {
            success: true,
            data: [] as ResumeEntry[],
            pagination: { page: 1, limit: params.limit, total_pages: 0, total_items: 0 },
          };
        }
        const token = await getToken();
        const res = await fetch(ENDPOINTS.resumeBuilderList(userId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return {
            success: false,
            data: [] as ResumeEntry[],
            pagination: { page: 1, limit: params.limit, total_pages: 0, total_items: 0 },
          };
        }
        const json = await res.json();
        rawCacheRef.current = json.resumes ?? json.data ?? (Array.isArray(json) ? json : []);
      }

      // ── 2. Map raw → ResumeEntry ──────────────────────────────────────────
      let entries: ResumeEntry[] = rawCacheRef.current!.map((r) => ({
        id:           r.id,
        title:        r.title || "Untitled Resume",
        template:     r.templateName
          ? r.templateName
          : r.templateId
          ? r.templateId.charAt(0).toUpperCase() + r.templateId.slice(1)
          : "—",
        status:       r.status || "draft",
        createdAt:    fmtDate(r.createdAt),
        lastModified: fmtDate(r.updatedAt),
        _createdAtMs: r.createdAt ? new Date(r.createdAt).getTime() : 0,
        _updatedAtMs: r.updatedAt ? new Date(r.updatedAt).getTime() : 0,
      }));

      // ── 3. Search filter ──────────────────────────────────────────────────
      if (params.search) {
        const q = params.search.toLowerCase();
        entries = entries.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.template.toLowerCase().includes(q) ||
            e.status.toLowerCase().includes(q),
        );
      }

      // ── 4. Date-range filter (filters on updatedAt) ───────────────────────
      if (params.from_date) {
        const from = new Date(params.from_date).getTime();
        entries = entries.filter((e) => e._updatedAtMs >= from);
      }
      if (params.to_date) {
        // Include the entire to_date day
        const to = new Date(params.to_date).getTime() + 86_400_000 - 1;
        entries = entries.filter((e) => e._updatedAtMs <= to);
      }

      // ── 5. Sorting ────────────────────────────────────────────────────────
      const dir = params.sort_order === "asc" ? 1 : -1;
      entries.sort((a, b) => {
        switch (params.sort_by) {
          case "createdAt":
            return dir * (a._createdAtMs - b._createdAtMs);
          case "lastModified":
            return dir * (a._updatedAtMs - b._updatedAtMs);
          case "title":
            return dir * a.title.localeCompare(b.title);
          case "template":
            return dir * a.template.localeCompare(b.template);
          case "status":
            return dir * a.status.localeCompare(b.status);
          default:
            return dir * (a._updatedAtMs - b._updatedAtMs);
        }
      });

      // ── 6. Pagination ─────────────────────────────────────────────────────
      const total  = entries.length;
      const pages  = Math.max(1, Math.ceil(total / params.limit));
      const offset = (params.page - 1) * params.limit;
      const slice  = entries.slice(offset, offset + params.limit);

      return {
        success: true,
        data: slice,
        pagination: {
          page:        params.page,
          limit:       params.limit,
          total_pages: pages,
          total_items: total,
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getToken, refreshKey],
  );

  // ── Open existing resume in editor ─────────────────────────────────────────
  const handleOpen = useCallback(
    async (id: string) => {
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
              sourceType:     "builder",
              resumeId:       r.id,
              resumeTitle:    r.title,
              fields:         r.fields,
              templateId:     r.templateId,
              templateCode:   r.templateCode ?? null,
              jobDescription: r.jobDescription ?? "",
              jobTitle:       r.jobTitle ?? "",
              company:        r.company ?? "",
            },
          },
        });
      } catch (err) {
        console.error("[BuildResume] open error:", err);
      } finally {
        setOpeningId(null);
      }
    },
    [getToken, navigate, openingId],
  );

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
      rawCacheRef.current = null;    // invalidate cache
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
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
        enableSorting: true,
        cell: ({ row }) => (
          <button
            className="font-medium text-left hover:underline cursor-pointer"
            onClick={() => handleOpen(row.original.id)}
          >
            {row.getValue("title") || (
              <span className="text-muted-foreground/50 italic">Untitled Resume</span>
            )}
          </button>
        ),
      },
      {
        accessorKey: "template",
        header: "Template",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.getValue("template") || "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: true,
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
        accessorKey: "createdAt",
        header: "Created",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {row.getValue("createdAt") || "—"}
          </span>
        ),
      },
      {
        accessorKey: "lastModified",
        header: "Last Modified",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {row.getValue("lastModified") || "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const id        = row.original.id;
          const title     = row.original.title;
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
              enableSearch:           true,
              enableColumnVisibility: true,
              enableDateFilter:       true,
              enableExport:           true,
              enablePagination:       true,
              enableRowSelection:     true,
              defaultSortBy:          "lastModified",
              defaultSortOrder:       "desc",
              searchPlaceholder:      "Search resumes...",
            }}
            exportConfig={{
              entityName:    "resumes",
              headers:       ["Resume Title", "Template", "Status", "Created", "Last Modified"],
              columnMapping: {
                title:        "Resume Title",
                template:     "Template",
                status:       "Status",
                createdAt:    "Created",
                lastModified: "Last Modified",
              },
              columnWidths: [
                { wch: 30 },
                { wch: 18 },
                { wch: 12 },
                { wch: 24 },
                { wch: 24 },
              ],
            }}
          />
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => {
          if (!open) setDeleteTarget(null);
        }}
      >
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

