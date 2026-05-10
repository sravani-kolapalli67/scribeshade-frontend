import { FileTextIcon, PencilLine } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Resume } from "./ListOfResumes";

interface ResumePreviewProps {
  resume: Resume | null;
}

export default function ResumePreview({ resume }: ResumePreviewProps) {
  const navigate = useNavigate();
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
      {/* Preview Content */}
      <div className="flex flex-1 flex-col items-center justify-center bg-muted/10 p-4 text-center">
        <div className="relative w-full flex-1 rounded-xl border border-border bg-background shadow-sm overflow-hidden">
          {resume.source === "builder" ? (
            /* Builder resumes live in the editor — no static file exists */
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-5 p-8">
              <div className="h-16 w-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                <PencilLine className="h-7 w-7 text-violet-500" />
              </div>
              <div className="space-y-1.5 text-center">
                <p className="text-base font-semibold text-slate-800">Builder Resume</p>
                <p className="text-sm text-muted-foreground max-w-[240px]">
                  This resume was created in the builder. Open the editor to view or download it.
                </p>
              </div>
              <button
                onClick={() =>
                  navigate("/resume/editor", {
                    state: {
                      config: {
                        sourceType: "builder",
                        resumeId: resume.id,
                      },
                    },
                  })
                }
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors duration-150"
              >
                <PencilLine className="h-4 w-4" />
                Open in Editor
              </button>
            </div>
          ) : (
            <iframe
              src={`${import.meta.env.VITE_BACKEND_URL}/${resume.path}`}
              className="h-full w-full border-none"
              title="Resume Preview"
            />
          )}
        </div>
      </div>
    </div>
  );
}
