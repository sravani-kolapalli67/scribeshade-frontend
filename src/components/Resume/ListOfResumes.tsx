import { useEffect, useState } from "react";
import { FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Resume {
  id: string;
  filename: string;
  uploadedAt: string;
  size?: string;
  score?: number;
  path?: string;
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
  const [resumes, setResumes] = useState<Resume[]>([]);

  useEffect(() => {
    if (!userId) return;

    fetch(`http://localhost:3000/api/resume/list?userId=${userId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setResumes(data);
      })
      .catch((err) => console.log(err));
  }, [userId]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500/10 text-green-600";
    if (score >= 60) return "bg-orange-500/10 text-orange-600";
    return "bg-destructive/10 text-destructive";
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">
          Your resumes{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {resumes.length} files
          </span>
        </h2>
      </div>

      <div className="divide-y divide-gray-50">
        {resumes.map((resume) => (
          <div
            key={resume.id}
            onClick={() => onSelectResume(resume)}
            className={cn(
              "group flex cursor-pointer items-center justify-between p-6 transition-colors hover:bg-muted/50",
              selectedResumeId === resume.id && "bg-muted ring-1 ring-inset ring-primary/5"
            )}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:bg-card group-hover:shadow-sm">
                <FileIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {resume.filename}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {resume.uploadedAt} &bull; {resume.size || "Unknown size"}
                </p>
              </div>
            </div>

            {resume.score !== undefined && (
              <div
                className={cn(
                  "rounded-lg px-3 py-1 text-sm font-bold",
                  getScoreColor(resume.score),
                )}
              >
                {resume.score}%
              </div>
            )}
          </div>
        ))}
        {resumes.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            No resumes found. Upload one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
