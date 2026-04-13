import { ResumeSelector, Resume } from "@/components/Resume/ResumeSelector";
import { FileText, CheckCircle2 } from "lucide-react";

interface Step2Props {
  onSelect: (resume: Resume | null) => void;
  selectedResumeId: string | null;
}

export function Step2_ResumeSelector({ onSelect, selectedResumeId }: Step2Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Select a Resume</h2>
        <p className="text-sm text-muted-foreground">
          Choose the resume you would like to use for this session.
        </p>
      </div>

      <div className="p-4 rounded-2xl border bg-muted/25 space-y-4">
        <div className="flex items-center gap-2 px-1">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Your Resumes</span>
        </div>
        <ResumeSelector onSelect={onSelect} />
      </div>

      {selectedResumeId && (
        <div className="flex items-center gap-3 p-4 border rounded-2xl bg-green-50/50 border-green-100 text-green-700 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Resume selected and ready to use.</p>
        </div>
      )}
    </div>
  );
}
