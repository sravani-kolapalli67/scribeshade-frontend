import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { FileText, CheckCircle2, Search, Clock, SortAsc, SortDesc, PencilLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type Resume } from "@/components/Resume/ResumeSelector";

interface Step2Props {
  onSelect: (resume: Resume | null) => void;
  selectedResumeId: string | null;
}

export function Step2_ResumeSelector({ onSelect, selectedResumeId }: Step2Props) {
  const { getToken } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (!userId) return;
    setLoading(true);
    getToken().then((token) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;

      const uploadedP = fetch(
        import.meta.env.VITE_BACKEND_URL + "/api/resume/list?userId=" + userId,
        { headers }
      ).then((r) => r.json()).then((res): Resume[] => {
        const list = Array.isArray(res) ? res : (res.data ?? []);
        return list.map((r: Resume) => ({ ...r, source: "uploaded" as const }));
      }).catch(() => [] as Resume[]);

      const builderP = fetch(
        import.meta.env.VITE_BACKEND_URL + "/api/resume/builder/list?userId=" + userId,
        { headers }
      ).then((r) => r.json()).then((res): Resume[] => {
        const list = res.resumes ?? res.data ?? (Array.isArray(res) ? res : []);
        return list.map((r: any) => ({
          id: r.id,
          filename: r.title || "Untitled Resume",
          path: "",
          ats: false,
          source: "builder" as const,
          uploadedAt: r.updatedAt ?? r.createdAt ?? "",
        }));
      }).catch(() => [] as Resume[]);

      Promise.all([uploadedP, builderP]).then(([uploaded, builder]) => {
        setResumes([...uploaded, ...builder]);
        setLoading(false);
      });
    });
  }, [getToken]);

  const filtered = resumes
    .filter((r) => r.filename.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const da = new Date(a.uploadedAt).getTime();
      const db = new Date(b.uploadedAt).getTime();
      return sortOrder === "desc" ? db - da : da - db;
    });

  const selectedResume = resumes.find((r) => r.id === selectedResumeId);

  return (
    <div className="space-y-4">
      {/* Search + Sort row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resumes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl h-10"
          />
        </div>
        <button
          onClick={() => setSortOrder((s) => (s === "desc" ? "asc" : "desc"))}
          className="flex items-center gap-1.5 px-3 h-10 rounded-xl border border-border bg-background text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          {sortOrder === "desc" ? <SortDesc className="h-4 w-4" /> : <SortAsc className="h-4 w-4" />}
          {sortOrder === "desc" ? "Newest" : "Oldest"}
        </button>
      </div>

      {/* Resume cards */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <FileText className="h-8 w-8 opacity-30" />
            <p className="text-sm">{search ? "No resumes match your search." : "No resumes found. Upload one first."}</p>
          </div>
        ) : (
          filtered.map((resume) => {
            const isSelected = resume.id === selectedResumeId;
            const date = resume.uploadedAt
              ? new Date(resume.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
              : "";
            return (
              <button
                key={resume.id}
                onClick={() => onSelect(isSelected ? null : resume)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background hover:bg-muted/30 hover:border-border/80"
                )}
              >
                <div className={cn(
                  "flex shrink-0 items-center justify-center h-9 w-9 rounded-lg",
                  isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {resume.source === "builder"
                    ? <PencilLine className="h-4 w-4" />
                    : <FileText className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{resume.filename}</p>
                    {resume.source === "builder" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-200 text-violet-600 bg-violet-50 shrink-0">Builder</Badge>
                    )}
                  </div>
                  {date && (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {date}
                    </div>
                  )}
                </div>
                {isSelected && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>

      {/* Selected confirmation */}
      {selectedResume && (
        <div className="flex items-center gap-3 p-3 border rounded-xl bg-green-50/50 border-green-100 text-green-700 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium truncate">
            {selectedResume.filename} selected and ready to use.
          </p>
        </div>
      )}
    </div>
  );
}
