import { FileTextIcon, DownloadIcon, EyeIcon } from "lucide-react";
import { Resume } from "./ListOfResumes";
import { Button } from "@/components/ui/button";

interface ResumePreviewProps {
  resume: Resume | null;
}

export default function ResumePreview({ resume }: ResumePreviewProps) {
  if (!resume) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <FileTextIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-1 text-lg font-semibold text-foreground">
          No resume selected
        </h3>
        <p className="text-sm text-muted-foreground">
          Click a resume to view details and actions
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col rounded-2xl border border-border bg-card p-0 overflow-hidden">
      {/* Resume Info Header */}
      {/* <div className="border-b border-border bg-muted/50 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm text-gray-400">
              <FileTextIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {resume.filename}
              </h3>
              <p className="text-sm text-muted-foreground">
                Uploaded on {resume.uploadedAt} &bull;{" "}
                {resume.size || "Unknown size"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="h-10 w-10">
              <DownloadIcon className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-10 w-10">
              <EyeIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div> */}

      {/* Preview Content */}
      <div className="flex flex-1 flex-col items-center justify-center bg-muted/10 p-4 text-center">
        <div className="relative w-full flex-1 rounded-xl border border-border bg-background shadow-sm overflow-hidden">
          <iframe
            src={`http://localhost:3000/${resume.path}`}
            className="h-full w-full border-none"
            title="Resume Preview"
          />
        </div>

        {resume.score !== undefined && (
          <div className="mt-4 inline-flex items-center gap-3 rounded-xl bg-card px-4 py-2 shadow-sm ring-1 ring-border">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Match Score
            </span>
            <span className="text-xl font-black text-foreground">
              {resume.score}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
