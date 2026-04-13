"use client";

import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FilePlus, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Sub-components
import { SourceSelectionStep } from "./BuildResume/SourceSelectionStep";
import { ExtractionStep } from "./BuildResume/ExtractionStep";
import { ManualEntryStep } from "./BuildResume/ManualEntryStep";
import { ProcessingStep } from "./BuildResume/ProcessingStep";
import { type Resume } from "@/components/Resume/ResumeSelector";

type Step = 1 | 2 | 3 | 4;
type SourceType = "resume" | "manual";

const EXTRACTION_FIELDS = [
  { id: "personalInfo", label: "Personal Information" },
  { id: "summary", label: "Professional Summary" },
  { id: "experience", label: "Work Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "projects", label: "Projects" },
  { id: "certifications", label: "Certifications" },
];

interface Template {
  id: string;
  category: string;
  thumbnail: string;
  code: string;
}

export function BuildResumeDialog() {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>(1);
  const [sourceType, setSourceType] = React.useState<SourceType | null>(null);
  const [selectedResume, setSelectedResume] = React.useState<Resume | null>(
    null,
  );
  const [extractionOptions, setExtractionOptions] = React.useState<
    Record<string, boolean>
  >(Object.fromEntries(EXTRACTION_FIELDS.map((f) => [f.id, true])));
  const [manualData, setManualData] = React.useState({
    summary: "",
    jobDescription: "",
  });
  const [selectedTemplate, setSelectedTemplate] =
    React.useState<Template | null>(null);
  const navigate = useNavigate();

  const resetDialog = () => {
    setStep(1);
    setSourceType(null);
    setSelectedResume(null);
    setExtractionOptions(
      Object.fromEntries(EXTRACTION_FIELDS.map((f) => [f.id, true])),
    );
    setManualData({ summary: "", jobDescription: "" });
    setSelectedTemplate(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setTimeout(resetDialog, 300);
    }
  };

  const handleNext = () => {
    if (step === 3) {
      setStep(4);
      startProcessing();
    } else {
      setStep((curr) => (curr + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((curr) => (curr - 1) as Step);
    }
  };

  const startProcessing = () => {
    setTimeout(() => {
      setOpen(false);
      navigate("/resume/editor", {
        state: {
          config: {
            sourceType,
            resumeId: selectedResume?.id,
            resumeContext: selectedResume?.resumeContext,
            extractionOptions,
            manualData,
            templateId: selectedTemplate?.id,
            templateCode: selectedTemplate?.code,
          },
        },
      });
    }, 3000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 px-6 py-6 rounded-xl bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-all font-semibold shadow-lg">
          <FilePlus className="h-5 w-5" />
          Build Resume
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl border-none shadow-2xl rounded-2xl p-0 overflow-hidden bg-background">
        <DialogHeader className="pt-6 px-8 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold tracking-tight">
              {step === 1 && "Start Your Resume"}
              {step === 2 &&
                (sourceType === "resume"
                  ? "Select Data to Extract"
                  : "Manual Entry")}
              {/* {step === 3 && "Choose a Template"} */}
              {step === 3 && "Building Your Resume"}
            </DialogTitle>
          </div>

          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  step === i ? "w-8 bg-primary" : "w-4 bg-muted",
                )}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="px-8 pb-8 pt-2">
          {step === 1 && (
            <SourceSelectionStep
              sourceType={sourceType}
              onSelect={setSourceType}
            />
          )}

          {step === 2 && sourceType === "resume" && (
            <ExtractionStep
              onSelectResume={setSelectedResume}
              options={extractionOptions}
              onChangeOption={(id, checked) =>
                setExtractionOptions((prev) => ({ ...prev, [id]: checked }))
              }
              fields={EXTRACTION_FIELDS}
            />
          )}

          {step === 2 && sourceType === "manual" && (
            <ManualEntryStep
              data={manualData}
              onChange={(field, value) =>
                setManualData((prev) => ({ ...prev, [field]: value }))
              }
            />
          )}

          {/* {step === 3 && (
            <TemplateSelectionStep
              selectedTemplateId={selectedTemplate?.id || null}
              onSelect={setSelectedTemplate}
            />
          )} */}

          {step === 3 && <ProcessingStep />}

          {step < 3 && (
            <div className="flex items-center justify-between pt-6 border-t mt-4">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={step === 1}
                className="rounded-xl gap-2 h-11 px-4"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleNext}
                disabled={
                  (step === 1 && !sourceType) ||
                  (step === 2 && sourceType === "resume" && !selectedResume) ||
                  (step === 3 && !selectedTemplate)
                }
                className="rounded-xl gap-2 h-11 px-8 bg-black dark:bg-white text-white dark:text-black font-semibold"
              >
                {step === 3 ? "Generate" : "Continue"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
