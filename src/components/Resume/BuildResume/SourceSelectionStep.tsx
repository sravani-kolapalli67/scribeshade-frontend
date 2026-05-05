"use client";

import { FileText, Type, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceSelectionStepProps {
  sourceType: "resume" | "scratch" | null;
  onSelect: (type: "resume" | "scratch") => void;
}

export function SourceSelectionStep({
  sourceType,
  onSelect,
}: SourceSelectionStepProps) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <button
        onClick={() => onSelect("resume")}
        className={cn(
          "relative flex items-center gap-6 p-2 rounded-2xl border-2 transition-all text-left group w-full",
          sourceType === "resume"
            ? "border-primary bg-primary/5 shadow-md"
            : "border-border hover:border-border/80 hover:bg-muted/30",
        )}
      >
        <div
          className={cn(
            "p-2 rounded-xl transition-colors shrink-0",
            sourceType === "resume"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground group-hover:text-foreground",
          )}
        >
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-lg mb-1">Use Existing Resume</h3>
          <p className="text-sm text-muted-foreground">
            Extract data from your uploaded files for a quick start.
          </p>
        </div>
        {sourceType === "resume" && (
          <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
      </button>

      {/* OR Separator */}
      <div className="flex items-center gap-4 py-2">
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/20 px-3 py-1 rounded-full">
          OR
        </span>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      <button
        onClick={() => onSelect("scratch")}
        className={cn(
          "relative flex items-center gap-6 p-2 rounded-2xl border-2 transition-all text-left group w-full",
          sourceType === "scratch"
            ? "border-primary bg-primary/5 shadow-md"
            : "border-border hover:border-border/80 hover:bg-muted/30",
        )}
      >
        <div
          className={cn(
            "p-2 rounded-xl transition-colors shrink-0",
            sourceType === "scratch"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground group-hover:text-foreground",
          )}
        >
          <Type className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-lg mb-1">Start from Scratch</h3>
          <p className="text-sm text-muted-foreground">
            AI builds your resume from the job description or role you provide.
          </p>
        </div>
        {sourceType === "scratch" && (
          <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
      </button>
    </div>
  );
}
