import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ResumeSelector, Resume } from "@/components/Resume/ResumeSelector";
import { Sparkles, Briefcase, FileText } from "lucide-react";

export function GenerateProjectDialog() {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState("");
  const [jobDescription, setJobDescription] = React.useState("");
  const [selectedResumeId, setSelectedResumeId] = React.useState<string | null>(
    null,
  );

  const handleResumeSelect = (resume: Resume | null) => {
    setSelectedResumeId(resume?.id || null);
  };

  const handleGenerate = () => {
    console.log("Generating project with:", {
      position,
      jobDescription,
      selectedResumeId,
    });
    // TODO: Implement actual generation logic here
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-xl h-10 px-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium">
          <Sparkles className="h-4 w-4" />
          Generate Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] rounded-2xl border-border/60 shadow-xl">
        <DialogHeader className="gap-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <DialogTitle className="text-xl font-semibold">
              Generate AI Project
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            Fill in the details below to generate a tailored project based on
            your resume and target role.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid gap-2.5">
            <Label
              htmlFor="resume"
              className="text-sm font-medium flex items-center gap-2"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              Select Resume
            </Label>
            <ResumeSelector onSelect={handleResumeSelect} />
          </div>
          <div className="grid gap-2.5">
            <Label
              htmlFor="position"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              Target Position
            </Label>
            <Input
              id="position"
              placeholder="e.g. Frontend Developer"
              className="h-10 rounded-xl bg-background border-border/80 focus-visible:ring-primary/20"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
          <div className="grid gap-2.5">
            <Label htmlFor="job-description" className="text-sm font-medium">
              Job Description
            </Label>
            <Textarea
              id="job-description"
              placeholder="Paste the job requirements and description here..."
              className="resize-none h-32 rounded-xl bg-background border-border/80 focus-visible:ring-primary/20 p-3"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="rounded-xl h-10 px-4"
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedResumeId || !position || !jobDescription}
            className="rounded-xl h-10 px-6 gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Generate Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
