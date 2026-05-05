"use client";

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
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
import { ENDPOINTS } from "@/lib/endpoints";

// Step sub-components
import { SourceSelectionStep } from "./BuildResume/SourceSelectionStep";
import { ExtractionStep } from "./BuildResume/ExtractionStep";
import { JDStep, type JDStepData } from "./BuildResume/JDStep";
import { TemplateSelectionStep, type Template } from "./BuildResume/TemplateSelectionStep";
import { ProcessingStep, type ProcessingStatus } from "./BuildResume/ProcessingStep";
import { type Resume } from "@/components/Resume/ResumeSelector";

// ─── Types ────────────────────────────────────────────────────────────────────

type SourceType = "resume" | "scratch";

/**
 * Step machine:
 *   Path A (resume):  1 Source → 2 Extract → 3 JD → 4 Template → 5 Processing
 *   Path B (scratch): 1 Source → 2 JD       → 3 Template → 4 Processing
 *
 * We encode steps as semantic names rather than numbers so the progress
 * indicator can always reflect the correct position.
 */
type StepId = "source" | "extract" | "jd" | "template" | "processing";

function getSteps(source: SourceType | null): StepId[] {
  if (source === "resume") return ["source", "extract", "jd", "template", "processing"];
  return ["source", "jd", "template", "processing"];
}

const STEP_TITLES: Record<StepId, string> = {
  source:     "Start Your Resume",
  extract:    "Select Data to Extract",
  jd:         "Target Role",
  template:   "Choose a Template",
  processing: "Building Your Resume",
};

const EXTRACTION_FIELDS = [
  { id: "personalInfo",  label: "Personal Information"  },
  { id: "summary",       label: "Professional Summary"  },
  { id: "experience",    label: "Work Experience"        },
  { id: "education",     label: "Education"              },
  { id: "skills",        label: "Skills"                 },
  { id: "projects",      label: "Projects"               },
  { id: "certifications",label: "Certifications"         },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function BuildResumeDialog() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [open, setOpen] = React.useState(false);

  // Step machine
  const [stepId, setStepId] = React.useState<StepId>("source");
  const [sourceType, setSourceType] = React.useState<SourceType | null>(null);

  // Step 2 (extract — path A)
  const [selectedResume, setSelectedResume] = React.useState<Resume | null>(null);
  const [extractionOptions, setExtractionOptions] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(EXTRACTION_FIELDS.map((f) => [f.id, true])),
  );

  // Step JD
  const [jdData, setJdData] = React.useState<JDStepData>({
    jobDescription: "",
    jobTitle: "",
    company: "",
  });

  // Step template
  const [selectedTemplate, setSelectedTemplate] = React.useState<Template | null>(null);

  // Processing state
  const [processingStatus, setProcessingStatus] = React.useState<ProcessingStatus>("loading");
  const [processingError, setProcessingError] = React.useState<string | null>(null);

  // ── Derived step list ──────────────────────────────────────────────────────

  const steps = getSteps(sourceType);
  const stepIndex = steps.indexOf(stepId);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goNext = () => {
    const next = steps[stepIndex + 1];
    if (!next) return;
    if (next === "processing") {
      setStepId("processing");
      startProcessing();
    } else {
      setStepId(next);
    }
  };

  const isNextDisabled = (): boolean => {
    switch (stepId) {
      case "source":   return sourceType === null;
      case "extract":  return selectedResume === null;
      case "jd":       return false; // always skippable
      case "template": return selectedTemplate === null;
      default:         return false;
    }
  };

  const goBack = () => {
    const prev = steps[stepIndex - 1];
    if (prev) setStepId(prev);
  };

  // ── Processing ─────────────────────────────────────────────────────────────

  const navigateToEditor = React.useCallback(async (fields?: Record<string, string>) => {
    const resumeTitle =
      jdData.jobTitle && jdData.company
        ? `${jdData.jobTitle} – ${jdData.company}`
        : jdData.jobTitle || "My Resume";

    // Save a draft record immediately so the editor can auto-save to the same ID
    // and the mark-complete flow has a resumeId to work with.
    let savedResumeId: string | null = null;
    try {
      const userId = localStorage.getItem("userId");
      const token = await getToken();
      const defaultSections = [
        { id: "personalInfo",   label: "Personal Info",   required: true,  enabled: true  },
        { id: "summary",        label: "Summary",          required: true,  enabled: true  },
        { id: "experience",     label: "Work Experience",  required: true,  enabled: true  },
        { id: "skills",         label: "Skills",           required: true,  enabled: true  },
        { id: "projects",       label: "Projects",         required: false, enabled: true  },
        { id: "education",      label: "Education",        required: true,  enabled: true  },
        { id: "certifications", label: "Certifications",   required: false, enabled: false },
        { id: "publications",   label: "Publications",     required: false, enabled: false },
      ];
      const emptyFields = {
        name: "", role: "", email: "", phone: "", location: "", links: "",
        summary: "", experience: "", skillsLanguages: "", skillsFrameworks: "",
        skillsDatabases: "", skillsTools: "", projects: "", education: "",
        certifications: "", publications: "",
      };
      const res = await fetch(ENDPOINTS.resumeBuilderSave(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId,
          title:          resumeTitle,
          templateId:     selectedTemplate?.id ?? "classic",
          fields:         fields ?? emptyFields,
          sections:       defaultSections,
          jobDescription: jdData.jobDescription || undefined,
          jobTitle:       jdData.jobTitle       || undefined,
          company:        jdData.company        || undefined,
          status:         "draft",
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) savedResumeId = data.id;
    } catch {
      // Non-fatal: editor will create its own record on first save
    }

    setOpen(false);
    navigate("/resume/editor", {
      state: {
        config: {
          // When fields are provided (AI-extracted), use "builder" sourceType so
          // the editor uses them directly without re-parsing resumeContext.
          sourceType:        fields ? "builder" : sourceType,
          resumeId:          savedResumeId,
          resumeContext:     fields ? undefined : selectedResume?.resumeContext,
          fields:            fields ?? undefined,
          extractionOptions,
          jobDescription:    jdData.jobDescription,
          jobTitle:          jdData.jobTitle,
          company:           jdData.company,
          resumeTitle,
          templateId:        selectedTemplate?.id,
          templateCode:      selectedTemplate?.code,
        },
      },
    });
  }, [navigate, getToken, sourceType, selectedResume, extractionOptions, jdData, selectedTemplate]);

  const startProcessing = React.useCallback(async () => {
    setProcessingStatus("loading");
    setProcessingError(null);

    // Path B (scratch): no AI extraction needed — navigate with empty fields.
    if (sourceType === "scratch") {
      await navigateToEditor();
      return;
    }

    // Path A (resume): call AI extract-fields endpoint.
    const resumeContext = selectedResume?.resumeContext;
    if (!resumeContext) {
      // Fallback: no resume text available, navigate without AI-extracted fields.
      await navigateToEditor();
      return;
    }

    try {
      const userId = localStorage.getItem("userId");
      const token = await getToken();

      const res = await fetch(ENDPOINTS.resumeBuilderExtractFields(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          resumeContext,
          jobDescription: jdData.jobDescription || undefined,
          jobTitle:       jdData.jobTitle       || undefined,
          company:        jdData.company        || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "AI extraction failed");
      }

      await navigateToEditor(data.fields);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setProcessingStatus("error");
      setProcessingError(message);
    }
  }, [getToken, sourceType, selectedResume, jdData, navigateToEditor]);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const resetDialog = () => {
    setStepId("source");
    setSourceType(null);
    setSelectedResume(null);
    setExtractionOptions(Object.fromEntries(EXTRACTION_FIELDS.map((f) => [f.id, true])));
    setJdData({ jobDescription: "", jobTitle: "", company: "" });
    setSelectedTemplate(null);
    setProcessingStatus("loading");
    setProcessingError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setTimeout(resetDialog, 300);
  };

  // ── Source selection handler ───────────────────────────────────────────────

  const handleSelectSource = (type: SourceType) => {
    setSourceType(type);
    // Recompute step list with new source so next press goes to right place
  };

  // ── Progress dots ──────────────────────────────────────────────────────────
  // Show dots for all steps except "processing" (which is the terminal state)
  const progressSteps = steps.filter((s) => s !== "processing");
  const progressIndex = Math.min(stepIndex, progressSteps.length - 1);

  // ── Step title ─────────────────────────────────────────────────────────────
  const title = STEP_TITLES[stepId];

  const showFooter = stepId !== "processing";

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
              {title}
            </DialogTitle>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-4">
            {progressSteps.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === progressIndex
                    ? "w-8 bg-primary"
                    : i < progressIndex
                    ? "w-4 bg-primary/50"
                    : "w-4 bg-muted",
                )}
              />
            ))}
          </div>
        </DialogHeader>

        {/* Step content */}
        <div className="px-8 pb-8 pt-2">
          {stepId === "source" && (
            <SourceSelectionStep
              sourceType={sourceType}
              onSelect={handleSelectSource}
            />
          )}

          {stepId === "extract" && (
            <ExtractionStep
              onSelectResume={setSelectedResume}
              options={extractionOptions}
              onChangeOption={(id, checked) =>
                setExtractionOptions((prev) => ({ ...prev, [id]: checked }))
              }
              fields={EXTRACTION_FIELDS}
            />
          )}

          {stepId === "jd" && (
            <JDStep data={jdData} onChange={setJdData} />
          )}

          {stepId === "template" && (
            <TemplateSelectionStep
              selectedTemplateId={selectedTemplate?.id ?? null}
              onSelect={setSelectedTemplate}
            />
          )}

          {stepId === "processing" && (
            <ProcessingStep
              status={processingStatus}
              error={processingError}
              onRetry={() => startProcessing()}
              onSkip={() => { void navigateToEditor(); }}
            />
          )}

          {/* Footer nav */}
          {showFooter && (
            <div className="flex items-center justify-between pt-6 border-t mt-6">
              <Button
                variant="ghost"
                onClick={goBack}
                disabled={stepIndex === 0}
                className="rounded-xl gap-2 h-11 px-4"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              <div className="flex items-center gap-3">
                {/* Skip button for JD step */}
                {stepId === "jd" && (
                  <Button
                    variant="ghost"
                    onClick={goNext}
                    className="rounded-xl h-11 px-4 text-muted-foreground hover:text-foreground"
                  >
                    Skip →
                  </Button>
                )}

                <Button
                  onClick={goNext}
                  disabled={isNextDisabled()}
                  className="rounded-xl gap-2 h-11 px-8 bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-90"
                >
                  {stepId === "template" ? "Generate Resume" : "Continue"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
