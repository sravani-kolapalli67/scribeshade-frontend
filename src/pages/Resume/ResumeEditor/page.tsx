"use client";

import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  Save,
  Download,
  Share2,
  Loader2,
  AlertCircle,
  FileText,
  Briefcase,
  Code2,
  FolderKanban,
  History,
  Sparkles,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface ResumeData {
  name: string;
  role: string;
  email: string;
  phone: string;
  links: string;
  summary: string;
  languages: string;
  frameworks: string;
  database: string;
  tools: string;
  projects: Array<{ title: string; points: string[] }>;
  education: Array<{ degree: string; institute: string; year: string }>;
  publication: string;
}

type SectionId = "summary" | "experience" | "skills" | "projects";

interface SectionMeta {
  id: SectionId;
  label: string;
  icon: React.ElementType;
}

const SECTIONS: SectionMeta[] = [
  { id: "summary", label: "Summary", icon: FileText },
  { id: "experience", label: "Experience", icon: Briefcase },
  { id: "skills", label: "Skills", icon: Code2 },
  { id: "projects", label: "Projects", icon: FolderKanban },
];

/* ─── Mock AI enhance ─── */
function mockAIEnhance(section: SectionId, text: string): string {
  const enhancements: Record<SectionId, (t: string) => string> = {
    summary: (t) =>
      t
        ? `Results-driven professional with proven expertise in ${t.split(" ").slice(0, 5).join(" ")}. Demonstrated ability to deliver high-impact solutions, optimize performance by 30%, and collaborate seamlessly with cross-functional teams in fast-paced environments.`
        : "Results-driven professional with a strong foundation in modern software development. Experienced in creating scalable web applications, optimizing performance, and working seamlessly with cross-functional teams.",
    experience: (t) =>
      t
        ? `• Led development of key features resulting in 40% increase in user engagement\n• Architected scalable microservices handling 10K+ requests/second\n• Mentored junior developers and conducted code reviews\n${t}`
        : "• Spearheaded development of customer-facing features\n• Improved system reliability by 99.9% uptime\n• Collaborated with product and design teams",
    skills: (t) =>
      t
        ? `${t}\n\nAdditional proficiencies: System Design, CI/CD Pipelines, Cloud Architecture (AWS/GCP), Performance Optimization, Agile/Scrum Methodologies`
        : "React.js, TypeScript, Node.js, Python, AWS, Docker, PostgreSQL, Redis, GraphQL, System Design, CI/CD",
    projects: (t) =>
      t
        ? `${t}\n\n• Implemented comprehensive test coverage achieving 95% code coverage\n• Reduced page load time by 60% through lazy loading and code splitting\n• Integrated real-time collaboration features using WebSocket`
        : "• Built a full-stack web application with React and Node.js\n• Implemented real-time features with WebSocket\n• Deployed on AWS with CI/CD pipeline",
  };
  return enhancements[section](text);
}

/* ─── Resume parser (unchanged logic) ─── */
function parseRawResume(text: string): ResumeData {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const data: ResumeData = {
    name: lines[0] || "Your Name",
    role: "Professional Role",
    email: "",
    phone: "",
    links: "",
    summary: "",
    languages: "",
    frameworks: "",
    database: "",
    tools: "",
    projects: [],
    education: [],
    publication: "",
  };

  let currentSection = "";
  let sectionLines: string[] = [];
  const headers = [
    "PROFILE",
    "PROJECTS",
    "TECHNICAL SKILLS",
    "EDUCATION",
    "PUBLICATION",
  ];

  const firstHeaderIdx = lines.findIndex((l) =>
    headers.includes(l.toUpperCase()),
  );
  if (firstHeaderIdx > 1) {
    const contactLines = lines.slice(1, firstHeaderIdx);
    data.phone = contactLines.find((l) => l.includes("+")) || "";
    data.links = contactLines
      .filter(
        (l) =>
          l.toLowerCase().includes("linkedin") ||
          l.toLowerCase().includes("github") ||
          l.includes("•"),
      )
      .join(" | ");
  }

  const processSection = (name: string, content: string[]) => {
    const text = content.join(" ");
    switch (name) {
      case "PROFILE":
        data.summary = text;
        if (content.length > 0) data.role = content[0];
        break;
      case "TECHNICAL SKILLS":
        content.forEach((line) => {
          if (line.startsWith("Languages"))
            data.languages = line.split(":")[1]?.trim() || "";
          if (line.startsWith("Framework"))
            data.frameworks = line.split(":")[1]?.trim() || "";
          if (line.startsWith("DataBase"))
            data.database = line.split(":")[1]?.trim() || "";
          if (line.startsWith("Other"))
            data.tools = line.split(":")[1]?.trim() || "";
        });
        break;
      case "PROJECTS": {
        let currentProject: { title: string; points: string[] } | null = null;
        content.forEach((line) => {
          if (!line.match(/^[📌•\-*]/) && line.length > 20) {
            if (currentProject) data.projects.push(currentProject);
            currentProject = { title: line, points: [] };
          } else if (currentProject && line.length > 0) {
            currentProject.points.push(line.replace(/^[📌•\-*]\s*/, ""));
          }
        });
        if (currentProject) data.projects.push(currentProject);
        break;
      }
      case "EDUCATION":
        for (let i = 0; i < content.length; i += 4) {
          if (content[i]) {
            data.education.push({
              degree: content[i] || "",
              institute: content[i + 1] || "",
              year: content[i + 3] || "",
            });
          }
        }
        break;
      case "PUBLICATION":
        data.publication = text;
        break;
    }
  };

  lines.forEach((line) => {
    const upperLine = line.toUpperCase();
    if (headers.includes(upperLine)) {
      if (currentSection) processSection(currentSection, sectionLines);
      currentSection = upperLine;
      sectionLines = [];
    } else if (currentSection) {
      sectionLines.push(line);
    }
  });
  if (currentSection) processSection(currentSection, sectionLines);
  return data;
}

function getResumeData(config: any): ResumeData {
  if (config.sourceType === "resume" && config.resumeContext) {
    try {
      return { ...JSON.parse(config.resumeContext) };
    } catch {
      return parseRawResume(config.resumeContext);
    }
  }
  return {
    name: "Your Name",
    role: "Professional Role",
    email: "email@example.com",
    phone: "+1 (000) 000-0000",
    links: "portfolio.com | github.com",
    summary: config.manualData?.summary || "",
    languages: "",
    frameworks: "",
    database: "",
    tools: "",
    projects: [],
    education: [],
    publication: "",
  };
}

function populateTemplate(
  html: string,
  data: ResumeData,
  options: Record<string, boolean>,
) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc.querySelectorAll("[data-field]").forEach((el) => {
    const field = el.getAttribute("data-field");
    if (field && data[field as keyof ResumeData] !== undefined) {
      const value = data[field as keyof ResumeData];
      if (typeof value === "string") {
        el.textContent = value;
        const optionMap: any = {
          name: "personalInfo",
          role: "personalInfo",
          email: "personalInfo",
          phone: "personalInfo",
          links: "personalInfo",
          summary: "summary",
          languages: "skills",
          frameworks: "skills",
          database: "skills",
          tools: "skills",
          publication: "certifications",
        };
        if (optionMap[field] && options[optionMap[field]] === false) {
          (el as HTMLElement).style.display = "none";
        }
      }
    }
  });

  doc.querySelectorAll("[data-list]").forEach((container) => {
    const listName = container.getAttribute("data-list");
    const listData = data[listName as keyof ResumeData];
    const optionMap: any = { projects: "projects", education: "education" };
    if (
      optionMap[listName || ""] &&
      options[optionMap[listName || ""]] === false
    ) {
      (container as HTMLElement).style.display = "none";
      return;
    }
    if (Array.isArray(listData) && container.firstElementChild) {
      const itemTemplate = container.firstElementChild.cloneNode(
        true,
      ) as HTMLElement;
      container.innerHTML = "";
      listData.forEach((itemData: any) => {
        const itemClone = itemTemplate.cloneNode(true) as HTMLElement;
        Object.entries(itemData).forEach(([key, value]) => {
          itemClone
            .querySelectorAll(`[data-field="${key}"]`)
            .forEach((fieldEl) => {
              fieldEl.textContent = value as string;
            });
          if (key === "points" && Array.isArray(value)) {
            const pointsContainer =
              itemClone.querySelector('[data-list="points"]');
            if (pointsContainer && pointsContainer.firstElementChild) {
              const pointTemplate = pointsContainer.firstElementChild.cloneNode(
                true,
              ) as HTMLElement;
              pointsContainer.innerHTML = "";
              value.forEach((point: string) => {
                const pointClone = pointTemplate.cloneNode(
                  true,
                ) as HTMLElement;
                const pointField =
                  pointClone.querySelector('[data-field="point"]') ||
                  pointClone;
                pointField.textContent = point;
                pointsContainer.appendChild(pointClone);
              });
            }
          }
        });
        container.appendChild(itemClone);
      });
    }
  });

  doc.querySelectorAll("[data-section]").forEach((el) => {
    const section = el.getAttribute("data-section");
    const sectionMap: any = {
      header: "personalInfo",
      profile: "summary",
      skills: "skills",
      projects: "projects",
      education: "education",
      publication: "certifications",
    };
    if (
      sectionMap[section || ""] &&
      options[sectionMap[section || ""]] === false
    ) {
      (el as HTMLElement).style.display = "none";
    }
  });

  return doc.documentElement.outerHTML;
}

/* ─── Extracted section text from resume data ─── */
function extractSectionText(
  data: ResumeData,
  section: SectionId,
): string {
  switch (section) {
    case "summary":
      return data.summary || "";
    case "experience":
      return data.role || "";
    case "skills":
      return [data.languages, data.frameworks, data.database, data.tools]
        .filter(Boolean)
        .join("\n");
    case "projects":
      return data.projects
        .map(
          (p) =>
            `${p.title}\n${p.points.map((pt) => `• ${pt}`).join("\n")}`,
        )
        .join("\n\n");
    default:
      return "";
  }
}

/* ═══════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                      */
/* ═══════════════════════════════════════════════════ */
export default function ResumeEditor() {
  const location = useLocation();
  const navigate = useNavigate();
  const config = location.state?.config;

  const [populatedHtml, setPopulatedHtml] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] =
    React.useState<SectionId>("summary");
  const [sectionData, setSectionData] = React.useState<
    Record<SectionId, string>
  >({ summary: "", experience: "", skills: "", projects: "" });
  const [showAISuggestions, setShowAISuggestions] = React.useState(false);
  const [aiSuggestion, setAiSuggestion] = React.useState("");
  const [isEnhancing, setIsEnhancing] = React.useState(false);
  const [resumeData, setResumeData] = React.useState<ResumeData | null>(null);

  /* Build initial data from config */
  React.useEffect(() => {
    if (!config) return;
    try {
      const data = getResumeData(config);
      setResumeData(data);
      setSectionData({
        summary: extractSectionText(data, "summary"),
        experience: extractSectionText(data, "experience"),
        skills: extractSectionText(data, "skills"),
        projects: extractSectionText(data, "projects"),
      });
      if (config.templateCode) {
        const result = populateTemplate(
          config.templateCode,
          data,
          config.extractionOptions || {},
        );
        setPopulatedHtml(result);
      }
    } catch (err) {
      setError("Failed to generate resume preview.");
      console.error(err);
    }
  }, [config]);

  /* Re-render preview when resumeData changes */
  const refreshPreview = React.useCallback(
    (data: ResumeData) => {
      if (config?.templateCode) {
        try {
          const result = populateTemplate(
            config.templateCode,
            data,
            config.extractionOptions || {},
          );
          setPopulatedHtml(result);
        } catch (err) {
          console.error(err);
        }
      }
    },
    [config],
  );

  /* AI Enhance handler */
  const handleAIEnhance = () => {
    setIsEnhancing(true);
    setTimeout(() => {
      const enhanced = mockAIEnhance(
        activeSection,
        sectionData[activeSection],
      );
      setAiSuggestion(enhanced);
      setShowAISuggestions(true);
      setIsEnhancing(false);
    }, 1200);
  };

  /* Apply AI suggestion */
  const handleApply = () => {
    setSectionData((prev) => ({
      ...prev,
      [activeSection]: aiSuggestion,
    }));
    // Update resume data and refresh preview
    if (resumeData) {
      const updated = { ...resumeData };
      switch (activeSection) {
        case "summary":
          updated.summary = aiSuggestion;
          break;
        case "experience":
          updated.role = aiSuggestion;
          break;
        case "skills": {
          const parts = aiSuggestion.split("\n").filter(Boolean);
          updated.languages = parts[0] || "";
          updated.frameworks = parts[1] || "";
          break;
        }
        case "projects":
          // Keep existing projects structure, just update text view
          break;
      }
      setResumeData(updated);
      refreshPreview(updated);
    }
    setShowAISuggestions(false);
    setAiSuggestion("");
  };

  /* Discard AI suggestion */
  const handleDiscard = () => {
    setShowAISuggestions(false);
    setAiSuggestion("");
  };

  /* Save section text */
  const handleSave = () => {
    if (resumeData) {
      const updated = { ...resumeData };
      const text = sectionData[activeSection];
      switch (activeSection) {
        case "summary":
          updated.summary = text;
          break;
        case "experience":
          updated.role = text;
          break;
        case "skills": {
          const parts = text.split("\n").filter(Boolean);
          updated.languages = parts[0] || "";
          updated.frameworks = parts[1] || "";
          break;
        }
      }
      setResumeData(updated);
      refreshPreview(updated);
    }
  };

  /* ─── No config fallback ─── */
  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center min-h-100 space-y-4 text-center p-8">
        <AlertCircle className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-lg font-medium">
          No build configuration found.
        </p>
        <Button
          onClick={() => navigate("/resume/build")}
          variant="outline"
          className="rounded-xl px-8 h-12"
        >
          Return to Dashboard
        </Button>
      </div>
    );
  }

  const activeMeta = SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ═══ Top Header Bar ═══ */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-background/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground rounded-lg"
            onClick={() => navigate("/resume/build")}
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Builder
          </Button>
          <div className="h-6 w-px bg-border/60" />
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-1 rounded-full bg-[var(--color-brand)]" />
            <h1 className="text-xl font-bold tracking-tight">Resume Editor</h1>
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            Customizing your chosen template with extracted data
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg gap-1.5 border-border/60 hover:bg-muted/30 font-medium"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg gap-1.5 border-border/60 hover:bg-muted/30 font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
          <Button
            size="sm"
            className="rounded-lg gap-1.5 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-semibold shadow-md px-5"
          >
            <Save className="h-3.5 w-3.5" />
            Save Changes
          </Button>
        </div>
      </header>

      {/* ═══ Main 3-Panel Layout ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Left Sidebar ─── */}
        <aside className="w-52 shrink-0 border-r border-border/40 bg-muted/20 flex flex-col">
          <nav className="flex-1 py-4 px-3 space-y-1">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    setShowAISuggestions(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-[var(--color-brand)] text-white shadow-md shadow-[var(--color-brand)]/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {section.label}
                </button>
              );
            })}
          </nav>

          <div className="px-3 pb-4 mt-auto">
            <div className="h-px bg-border/40 mb-3" />
            <button className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer">
              <History className="h-4 w-4 shrink-0" />
              Version History
            </button>
          </div>
        </aside>

        {/* ─── Center: Section Editor ─── */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Editor Title */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Edit {activeMeta.label}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Update your {activeMeta.label.toLowerCase()} section below or use AI to enhance it.
              </p>
            </div>

            {/* Textarea */}
            <Textarea
              value={sectionData[activeSection]}
              onChange={(e) =>
                setSectionData((prev) => ({
                  ...prev,
                  [activeSection]: e.target.value,
                }))
              }
              placeholder={`Enter your ${activeMeta.label.toLowerCase()} here...`}
              className="min-h-40 text-sm leading-relaxed rounded-xl border-border/60 bg-muted/10 focus-visible:border-[var(--color-brand)] focus-visible:ring-[var(--color-brand)]/20 resize-none p-4"
              rows={6}
            />

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={handleAIEnhance}
                disabled={isEnhancing}
                className="rounded-xl gap-2 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-semibold shadow-md px-6 h-10"
              >
                {isEnhancing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isEnhancing ? "Enhancing..." : "+ AI Enhance"}
              </Button>
              <Button
                onClick={handleSave}
                variant="outline"
                className="rounded-xl font-semibold px-6 h-10 border-border/60"
              >
                Save
              </Button>
            </div>

            {/* ─── AI Suggestions Panel ─── */}
            {showAISuggestions && (
              <div className="rounded-2xl border border-border/60 bg-background shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--color-brand)]" />
                    <h3 className="font-bold text-base">AI Suggestions</h3>
                  </div>
                  <button
                    onClick={handleDiscard}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Comparison */}
                <div className="grid grid-cols-2 divide-x divide-border/40">
                  {/* Current */}
                  <div className="p-5 space-y-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Current
                    </span>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {sectionData[activeSection] ||
                        "(empty — no content yet)"}
                    </p>
                  </div>
                  {/* AI Enhanced */}
                  <div className="p-5 space-y-3 bg-[var(--color-brand-muted)]/40">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-brand)]">
                      AI Enhanced
                    </span>
                    <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                      {aiSuggestion}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-border/40 bg-muted/20">
                  <Button
                    onClick={handleApply}
                    className="rounded-xl gap-2 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-semibold shadow-md px-6 h-9"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Apply Changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDiscard}
                    className="rounded-xl gap-2 font-semibold px-6 h-9 border-border/60"
                  >
                    <X className="h-3.5 w-3.5" />
                    Discard
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ─── Right: Live Preview ─── */}
        <aside className="w-[420px] shrink-0 border-l border-border/40 bg-muted/10 flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/40 shrink-0">
            <h3 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
              Live Preview
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-border/30 overflow-hidden min-h-[700px] relative">
              {error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-4 bg-red-50/10">
                  <AlertCircle className="h-12 w-12 text-destructive/40" />
                  <div className="space-y-1">
                    <p className="text-destructive font-bold">
                      Generation Failed
                    </p>
                    <p className="text-muted-foreground text-xs max-w-xs">
                      {error}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => window.location.reload()}
                  >
                    Try Again
                  </Button>
                </div>
              ) : !populatedHtml ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                  <div className="relative">
                    <Loader2 className="h-10 w-10 text-[var(--color-brand)] animate-spin" />
                    <div className="absolute inset-0 h-10 w-10 rounded-full border-4 border-[var(--color-brand)]/20" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                      Building Preview
                    </p>
                    <p className="text-xs text-muted-foreground animate-pulse">
                      Populating template...
                    </p>
                  </div>
                </div>
              ) : (
                <iframe
                  srcDoc={populatedHtml}
                  className="w-full min-h-[700px] border-none bg-white"
                  title="Resume Preview"
                  sandbox="allow-scripts"
                />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
