"use client";

import * as React from "react";
import { FileText, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Resume {
  id: string;
  filename: string;
  path: string;
  size?: number | string;
  resumeContext?: string;
  uploadedAt: string;
  userId?: string;
  score?: number;
  ats: boolean;
  atsAnalysis?: {
    id: string;
    score: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    missingKeywords: string[];
    suggestions: string[];
  };
}

interface ResumeSelectorProps {
  onSelect?: (resume: Resume) => void;
  onDeselect?: () => void;
  value?: string;
  className?: string;
  filter?: (resume: Resume) => boolean;
}

export function ResumeSelector({ onSelect, onDeselect, value, filter }: ResumeSelectorProps) {
  const [resumes, setResumes] = React.useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = React.useState<string>(value || "");

  // Update internal state if value prop changes
  React.useEffect(() => {
    if (value !== undefined) {
      setSelectedResumeId(value);
    }
  }, [value]);
  const [loading, setLoading] = React.useState(true);
  const id = localStorage.getItem("userId");

  // Use a ref for onSelect to avoid infinite re-fetch when parent passes inline arrow functions
  const onSelectRef = React.useRef(onSelect);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  React.useEffect(() => {
    if (!id) return;

    setLoading(true);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/api/resume/list?userId=${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((response) => {
        // Handle both flat array and wrapped response formats
        let resumeList: Resume[] = Array.isArray(response)
          ? response
          : (response.data ?? []);

        // Apply filter if provided
        if (filter) {
          resumeList = resumeList.filter(filter);
        }

        setResumes(resumeList);
      })
      .catch((err) => console.error("Error fetching resumes:", err))
      .finally(() => setLoading(false));
  }, [id, filter]);

  const handleValueChange = (value: string) => {
    setSelectedResumeId(value);
    const selected = resumes.find((r) => r.id === value);
    if (selected) {
      onSelect?.(selected);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedResumeId("");
    onDeselect?.();
  };

  const selectedResume = resumes.find((r) => r.id === selectedResumeId);

  return (
    <div className="relative">
      <Select
        value={selectedResumeId}
        onValueChange={handleValueChange}
        disabled={loading || resumes.length === 0}
      >
      <SelectTrigger className="h-12 w-full px-4 rounded-xl border-border/80 bg-background hover:bg-muted/30 transition-all focus:ring-primary/20 py-6">
        <SelectValue
          placeholder={
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex shrink-0 items-center justify-center h-8 w-8 rounded-lg bg-muted text-muted-foreground/80">
                <FileText className="h-5 w-5" />
              </div>
              <span className="truncate text-sm font-medium text-foreground/80">
                {loading
                  ? "Loading resumes..."
                  : resumes.length > 0
                    ? "Select a resume"
                    : "No resumes found"}
              </span>
            </div>
          }
        >
          {selectedResume && (
            <div className="flex items-center gap-3 py-1">
              <div className="flex shrink-0 items-center justify-center h-8 w-8 rounded-lg bg-muted text-muted-foreground/80">
                <FileText className="h-5 w-5" />
              </div>
              <span className="truncate text-sm font-medium text-foreground/80">
                {selectedResume.filename}
              </span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-xl border-border/60 shadow-lg">
        {resumes.map((resume) => (
          <SelectItem
            key={resume.id}
            value={resume.id}
            className="py-3 px-4 focus:bg-primary/5 focus:text-primary transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{resume.filename}</span>
                <span className="text-[10px] text-muted-foreground">
                  {resume.uploadedAt}
                </span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
      </Select>
      {selectedResume && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear selected resume"
          className="absolute right-10 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-muted hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
    // <Card className={cn("w-full shadow-none border-border/50", className)}>
    //   <CardHeader className="py-4 px-6 border-b border-border/40">
    //     <CardTitle className="text-sm font-semibold text-foreground/90">
    //       Resume to Use
    //     </CardTitle>
    //   </CardHeader>
    //   <CardContent className="p-6">

    //   </CardContent>
    // </Card>
  );
}
