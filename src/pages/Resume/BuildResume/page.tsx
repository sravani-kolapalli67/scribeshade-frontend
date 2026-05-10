"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BuildResumeDialog } from "@/components/Resume/BuildResumeDialog";
import { ENDPOINTS } from "@/lib/endpoints";
import { populateTemplate, fieldsToResumeData } from "@/lib/resumeTemplate";
import type { ResumeFields } from "@/store/resumeBuilderSlice";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Search,
  FileText,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  X,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ResumeEntry {
  id: string;
  title: string;
  template: string;
  status: string;
  createdAt: string;       // formatted display string
  lastModified: string;    // formatted display string
  _createdAtMs: number;    // epoch ms — used for sorting
  _updatedAtMs: number;    // epoch ms — used for sorting + relative time
}

type SortKey = "lastModified" | "createdAt" | "title";

interface PreviewState {
  id: string;
  title: string;
  template: string;
  html: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const DATE_FMT: Intl.DateTimeFormatOptions = {
  year: "numeric", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit",
};

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", DATE_FMT);
}

function relativeTime(ms: number): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  if (diff < 60_000)         return "just now";
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return fmtDate(new Date(ms).toISOString());
}

const TEMPLATE_DOTS: Record<string, string> = {
  minimal: "bg-slate-400",
  classic: "bg-blue-400",
  modern:  "bg-violet-400",
};

function templateDot(template: string): string {
  return TEMPLATE_DOTS[template.toLowerCase()] ?? "bg-slate-300";
}

const SORT_LABELS: Record<SortKey, string> = {
  lastModified: "Last Modified",
  createdAt:    "Date Created",
  title:        "Title (A–Z)",
};

const PAGE_SIZE = 12;
const THUMB_H   = 156; // visible px of the thumbnail strip

// ── ShadowHtml ────────────────────────────────────────────────────────────────
// Renders HTML into a Shadow DOM instead of an <iframe>.
// Benefits vs iframe srcDoc:
//   • No separate browsing context → browser extensions (Grammarly, etc.) cannot
//     inject content scripts, eliminating the [ContentService] console flood.
//   • No sandboxing warnings ("Blocked script execution in 'about:srcdoc'…").
//   • Template CSS is naturally scoped inside the shadow root.

function ShadowHtml({ html, style }: { html: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !html) return;
    // Attach once, reuse shadow root on subsequent html updates
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    root.innerHTML = html;
  }, [html]);

  return <div ref={ref} style={style} />;
}

// ── ResumeThumbnail ──────────────────────────────────────────────────────────────
// Lazily fetches and renders a scaled A4 preview when the card enters the
// viewport (IntersectionObserver).  Only the top THUMB_H pixels are shown so
// the name / header section is always visible and nothing scrolls inside.

function ResumeThumbnail({
  id,
  onPreview,
}: {
  id: string;
  onPreview: (id: string) => void;
}) {
  const { getToken } = useAuth();
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const fetchedRef  = useRef(false);

  const [html,    setHtml]    = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scale,   setScale]   = useState(1);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    // Track container width so scale stays accurate after layout changes
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setScale(w / A4_W);
    });
    ro.observe(el);

    // Fetch only when the card enters the viewport for the first time
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || fetchedRef.current) return;
        fetchedRef.current = true;
        io.disconnect();

        (async () => {
          setLoading(true);
          try {
            const token = await getToken();
            const res   = await fetch(ENDPOINTS.resumeBuilderGet(id), {
              headers: { Authorization: `Bearer ${token}` },
            });
            const json = await res.json();
            if (!res.ok) return;
            const r = json.resume ?? json;
            if (!r.templateCode || !r.fields) return;
            setHtml(populateTemplate(
              r.templateCode,
              fieldsToResumeData(r.fields as ResumeFields),
              {},
            ));
          } catch (err) {
            console.error("[ResumeThumbnail] fetch error:", err);
          } finally {
            setLoading(false);
          }
        })();
      },
      { threshold: 0.05 },
    );
    io.observe(el);

    return () => {
      ro.disconnect();
      io.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // getToken is stable; id never changes for a given card

  return (
    <div
      ref={wrapperRef}
      role="button"
      tabIndex={0}
      aria-label="Preview resume"
      onClick={() => onPreview(id)}
      onKeyDown={(e) => e.key === "Enter" && onPreview(id)}
      className="relative w-full group overflow-hidden cursor-pointer bg-slate-50 border-b border-border"
      style={{ height: THUMB_H }}
    >
      {html ? (
        /*
         * Two-layer scaling (same pattern as the full preview dialog):
         * - Outer div is the layout box measured by the card at THUMB_H height.
         * - Inner div holds the full A4 element, CSS-scaled from top-left,
         *   so the top THUMB_H visible-px of the resume is shown cleanly.
         * overflow-hidden on outer clips anything below THUMB_H.
         * pointer-events-none + scrolling="no" prevent any inner interaction.
         */
        <div style={{ width: "100%", height: THUMB_H, overflow: "hidden", position: "relative" }}>
          <div
            style={{
              width: A4_W,
              height: A4_H,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
            }}
          >
            <ShadowHtml
              html={html}
              style={{ width: A4_W, height: A4_H, display: "block", overflow: "hidden" }}
            />
          </div>
        </div>
      ) : (
        /* Skeleton shown while fetching */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6">
          {loading ? (
            <Loader2 className="h-5 w-5 text-slate-300 animate-spin" />
          ) : (
            <div className="w-full flex flex-col gap-1.5 opacity-20">
              <div className="h-2.5 w-1/2 mx-auto rounded-sm bg-slate-400" />
              <div className="h-1 w-1/3 mx-auto rounded-sm bg-slate-300" />
              <div className="mt-2 h-1 w-full rounded-sm bg-slate-200" />
              <div className="h-1 w-5/6 rounded-sm bg-slate-200" />
              <div className="h-1 w-full rounded-sm bg-slate-200" />
              <div className="mt-1 h-1 w-full rounded-sm bg-slate-200" />
              <div className="h-1 w-4/5 rounded-sm bg-slate-200" />
              <div className="h-1 w-full rounded-sm bg-slate-200" />
            </div>
          )}
        </div>
      )}

      {/* Hover overlay — eye icon */}
      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors">
        <div className="h-9 w-9 rounded-full bg-white/90 border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye className="h-4 w-4 text-slate-600" />
        </div>
      </div>
    </div>
  );
}
// ── ResumeCard ─────────────────────────────────────────────────────────────────

function ResumeCard({
  resume,
  isOpening,
  isLoadingPreview,
  onOpen,
  onDelete,
  onPreview,
}: {
  resume: ResumeEntry;
  isOpening: boolean;
  isLoadingPreview: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onPreview: (id: string) => void;
}) {
  const isCompleted = resume.status === "completed";

  return (
    <div
      className={cn(
        "flex flex-col bg-white border border-border rounded-xl overflow-hidden transition-shadow hover:shadow-sm",
        (isOpening || isLoadingPreview) && "opacity-60 pointer-events-none",
      )}
    >
      {/* Thumbnail strip — real resume preview, lazy-loaded on viewport entry */}
      <ResumeThumbnail id={resume.id} onPreview={onPreview} />

      {/* Card body */}
      <div className="flex flex-col gap-3 p-4">
        {/* Top row: template indicator + status badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("h-2 w-2 rounded-full shrink-0", templateDot(resume.template))} />
            <span className="text-[11px] font-medium text-muted-foreground truncate">{resume.template}</span>
          </div>
          <Badge
            variant={isCompleted ? "default" : "outline"}
            className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0",
              !isCompleted && "text-muted-foreground border-border",
            )}
          >
            {resume.status.charAt(0).toUpperCase() + resume.status.slice(1)}
          </Badge>
        </div>

        {/* Title + modified time */}
        <div>
          <h3 className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
            {resume.title}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Modified {relativeTime(resume._updatedAtMs)}
          </p>
        </div>

        {/* Meta */}
        <p className="text-[11px] text-muted-foreground -mt-1">
          Created {resume.createdAt}
        </p>

        {/* Footer actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/60">
          <button
            onClick={() => onOpen(resume.id)}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
          >
            {isOpening ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
            Open in Editor
          </button>
          <button
            onClick={() => onPreview(resume.id)}
            title="Preview"
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-slate-50 transition-colors"
          >
            {isLoadingPreview
              ? <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
              : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-slate-50 transition-colors">
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onPreview(resume.id)}>
                <Eye className="h-3.5 w-3.5 mr-2" />
                Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpen(resume.id)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Open in Editor
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(resume.id, resume.title)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

// ── Preview Dialog ───────────────────────────────────────────────────────────────

// A4 dimensions (px at 96dpi)
const A4_W = 794;
const A4_H = 1123;

function ResumePreviewDialog({
  preview,
  onClose,
  onOpenEditor,
}: {
  preview: PreviewState | null;
  onClose: () => void;
  onOpenEditor: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Compute scale to fit A4 inside the scrollable body
  useEffect(() => {
    if (!preview || !containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setScale(Math.min(1, (w - 32) / A4_W));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [preview]);

  return (
    <Dialog open={!!preview} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-[860px] p-0 gap-0">
        <div className="flex flex-col h-[90vh] overflow-hidden rounded-2xl">

          {/* ── Fixed top: title bar ── */}
          <div className="shrink-0 bg-background px-6 pt-5 pb-4 border-b border-border/50 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-100 border border-border flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[13px] font-semibold text-foreground truncate leading-tight">{preview?.title ?? "Resume Preview"}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                {preview?.template && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-border">
                    {preview.template}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { onClose(); if (preview) onOpenEditor(preview.id); }}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold border border-border bg-background hover:bg-slate-50 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Open in Editor
              </button>
              <button
                onClick={onClose}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-slate-50 transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* ── Scrollable body: Shadow DOM resume render ── */}
          {/*
            Layout trick: the outer scroll container (overflow-y-auto) must see the
            VISUAL (scaled) height, not the raw A4 height. We achieve this with a
            two-layer approach:
              1. A layout placeholder div sized to scaled dimensions (what the scroll
                 container measures).
              2. An absolutely-positioned inner div that holds the real A4 element
                 and applies the CSS scale transform (origin: top left).
            ShadowHtml renders into a shadow root — no browsing context, no
            extension injection, no sandboxing warnings.
          */}
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto min-h-0 bg-slate-100 flex flex-col items-center py-6 px-4"
          >
            {preview?.html ? (
              /* Layout placeholder — sized to the VISUAL scaled dimensions */
              <div
                style={{
                  width: Math.round(A4_W * scale),
                  height: Math.round(A4_H * scale),
                  position: "relative",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {/* Actual A4 content — CSS-scaled from top-left origin */}
                <div
                  style={{
                    width: A4_W,
                    height: A4_H,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    position: "absolute",
                    top: 0,
                    left: 0,
                  }}
                >
                  <ShadowHtml
                    html={preview.html}
                    style={{ width: A4_W, height: A4_H, display: "block", overflow: "hidden" }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Skeleton card ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col bg-white border border-border rounded-xl p-5 gap-4">
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
        <div className="h-5 w-16 rounded-md bg-slate-100 animate-pulse" />
      </div>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-slate-100 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 w-3/4 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="h-3 w-2/5 rounded bg-slate-100 animate-pulse" />
      <div className="h-8 w-full rounded-lg bg-slate-100 animate-pulse mt-1" />
    </div>
  );
}

export default function BuildResume() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();

  const rawCacheRef = useRef<any[] | null>(null);

  // Resolved internal DB userId (set after useSyncUser fires)
  const [userId, setUserId]         = useState<string | null>(null);

  const [allEntries, setAllEntries] = useState<ResumeEntry[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [search, setSearch]         = useState("");
  const [sortBy, setSortBy]         = useState<SortKey>("lastModified");
  const [sortOrder, setSortOrder]   = useState<"asc" | "desc">("desc");
  const [page, setPage]             = useState(1);

  const [openingId, setOpeningId]           = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget]     = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting]         = useState(false);
  const [previewState, setPreviewState]     = useState<PreviewState | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  // ── Resolve userId (fast path: localStorage, slow path: userSynced event) ──
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    // Fast path: useSyncUser already wrote the id
    const stored = localStorage.getItem("userId");
    if (stored) {
      setUserId(stored);
      return;
    }

    // Slow path: wait for useSyncUser to finish and broadcast
    function onUserSynced(e: Event) {
      const detail = (e as CustomEvent<{ userId: string }>).detail;
      if (detail?.userId) setUserId(detail.userId);
    }
    window.addEventListener("userSynced", onUserSynced);
    return () => window.removeEventListener("userSynced", onUserSynced);
  }, [isLoaded, isSignedIn]);

  // ── Load all resumes from API ──────────────────────────────────────────────
  const loadResumes = useCallback(async (uid: string) => {
    setIsLoading(true);
    try {
      if (!rawCacheRef.current) {
        const token = await getToken();
        const res = await fetch(ENDPOINTS.resumeBuilderList(uid), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setAllEntries([]); return; }
        const json = await res.json();
        rawCacheRef.current = json.resumes ?? json.data ?? (Array.isArray(json) ? json : []);
      }

      const entries: ResumeEntry[] = rawCacheRef.current!.map((r) => ({
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

      setAllEntries(entries);
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  // Re-fetch whenever userId resolves or the route key changes (navigation)
  useEffect(() => {
    if (!userId) return;
    rawCacheRef.current = null;
    loadResumes(userId);
  }, [userId, location.key, loadResumes]);

  // Reset to page 1 when search/sort changes
  useEffect(() => { setPage(1); }, [search, sortBy, sortOrder]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const filtered = allEntries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.template.toLowerCase().includes(q) ||
      e.status.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortOrder === "asc" ? 1 : -1;
    switch (sortBy) {
      case "createdAt": return dir * (a._createdAtMs - b._createdAtMs);
      case "title":     return dir * a.title.localeCompare(b.title);
      default:          return dir * (a._updatedAtMs - b._updatedAtMs);
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      rawCacheRef.current = null;
      setDeleteTarget(null);
      if (userId) await loadResumes(userId);
    } catch (err) {
      console.error("[BuildResume] delete error:", err);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, getToken, loadResumes]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder(key === "title" ? "asc" : "desc");
    }
  };

  // ── Preview resume (client-side rendering) ────────────────────────────────
  const handlePreview = useCallback(
    async (id: string) => {
      if (previewLoadingId) return;
      setPreviewLoadingId(id);
      try {
        const token = await getToken();
        const res = await fetch(ENDPOINTS.resumeBuilderGet(id), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load resume");
        const r = json.resume ?? json;
        if (!r.templateCode || !r.fields) throw new Error("No template or fields returned");
        const html = populateTemplate(r.templateCode, fieldsToResumeData(r.fields as ResumeFields), {});
        const template = r.templateName ?? (r.templateId
          ? r.templateId.charAt(0).toUpperCase() + r.templateId.slice(1)
          : "Standard");
        setPreviewState({ id, title: r.title || "Untitled Resume", template, html });
      } catch (err) {
        console.error("[BuildResume] preview error:", err);
      } finally {
        setPreviewLoadingId(null);
      }
    },
    [getToken, previewLoadingId],
  );

  // ── Auth guards ────────────────────────────────────────────────────────────
  // Show skeleton while Clerk is initialising OR while userId hasn't resolved yet
  if (!isLoaded || (isSignedIn && !userId)) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-56 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-9 w-36 rounded-lg bg-slate-100 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-56 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-9 w-36 rounded-lg bg-slate-100 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  // ── All-empty state ────────────────────────────────────────────────────────
  if (!isLoading && allEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-12 w-12 rounded-xl bg-slate-100 border border-border flex items-center justify-center mb-4">
          <FileText className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-[14px] font-semibold text-foreground">No resumes yet</p>
        <p className="text-[12px] text-muted-foreground mt-1.5 max-w-[240px] leading-relaxed">
          Click <strong>Build Resume</strong> above to create your first resume.
        </p>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-5">

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 flex-wrap">

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search resumes…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-background text-[13px] text-foreground hover:bg-slate-50 transition-colors whitespace-nowrap">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                {SORT_LABELS[sortBy]}
                <span className="text-[10px] text-muted-foreground">{sortOrder === "asc" ? "↑" : "↓"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Sort by
              </DropdownMenuLabel>
              {(["lastModified", "createdAt", "title"] as const).map((key) => (
                <DropdownMenuItem
                  key={key}
                  className={cn(sortBy === key && "bg-slate-50 font-medium")}
                  onClick={() => toggleSort(key)}
                >
                  {SORT_LABELS[key]}
                  {sortBy === key && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Build Resume button + count — pushed to the right as a group */}
          <div className="ml-auto flex items-center gap-3">
            <BuildResumeDialog />
            <span className="text-[12px] text-muted-foreground whitespace-nowrap">
              {sorted.length} {sorted.length === 1 ? "resume" : "resumes"}
            </span>
          </div>
        </div>

        {/* ── Search empty state ── */}
        {paginated.length === 0 && search ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-10 w-10 rounded-xl bg-slate-100 border border-border flex items-center justify-center mb-3">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-[13px] font-medium text-foreground">No results for "{search}"</p>
            <p className="text-[12px] text-muted-foreground mt-1">Try a different search term.</p>
          </div>
        ) : (
          /* ── Card grid ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map((resume) => (
              <ResumeCard
                key={resume.id}
                resume={resume}
                isOpening={openingId === resume.id}
                isLoadingPreview={previewLoadingId === resume.id}
                onOpen={handleOpen}
                onDelete={(id, title) => setDeleteTarget({ id, title })}
                onPreview={handlePreview}
              />
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-[12px] text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {/* Windowed page numbers (max 5 visible) */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const pg    = start + i;
                if (pg > totalPages) return null;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded-lg text-[12px] border transition-colors",
                      pg === page
                        ? "bg-slate-900 text-white border-slate-900 font-semibold"
                        : "border-border text-foreground hover:bg-slate-50",
                    )}
                  >
                    {pg}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Resume Preview Dialog ── */}
      <ResumePreviewDialog
        preview={previewState}
        onClose={() => setPreviewState(null)}
        onOpenEditor={(id) => { setPreviewState(null); handleOpen(id); }}
      />

      {/* ── Delete confirmation ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
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

