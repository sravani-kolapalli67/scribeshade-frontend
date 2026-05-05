import React, { useEffect, useState, useRef, useCallback, useDeferredValue } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ENDPOINTS } from "@/lib/endpoints";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";
import type { RootState, AppDispatch } from "@/store/store";
import {
  setResumeTitle,
  setTemplate,
  setZoom,
  setActiveSection,
  toggleSection,
  moveSectionUp,
  moveSectionDown,
  updateField,
  setAiSuggestion,
  setIsEnhancing,
  applyAiSuggestion,
  discardAiSuggestion,
  undo,
  redo,
  setAutoSaveStatus,
  toggleAutoSave,
  setSavedResumeId,
  setActiveBottomTab,
  initFromConfig,
  addCustomSection,
  removeCustomSection,
  toggleCustomSection,
  updateCustomField,
  setSectionValidating,
  setSectionQuality,
} from "@/store/resumeBuilderSlice";
import type {
  SectionId,
  ResumeFields,
  TemplateId,
  BottomTab,
  SectionQuality,
} from "@/store/resumeBuilderSlice";
import {
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Save,
  Download,
  Loader2,
  AlertCircle,
  FileText,
  Briefcase,
  Code2,
  FolderKanban,
  GraduationCap,
  Award,
  BookOpen,
  User,
  Sparkles,
  Check,
  X,
  Lock,
  Unlock,
  Plus,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  LayoutTemplate,
  Coins,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileSearch,
  Wand2,
  Cloud,
  CloudOff,
  TrendingUp,
  ChevronRight,
} from "lucide-react";

// ─── Legacy ResumeData type (required by populateTemplate) ────────────────────

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
  /** Work experience entries — maps to data-list="experiences" in templates */
  experiences: Array<{ company: string; title: string; dates: string; points: string[] }>;
  projects: Array<{ title: string; points: string[] }>;
  education: Array<{ degree: string; institute: string; year: string }>;
  publication: string;
}

/** Available template fetched from the API — cached at editor mount. */
interface TemplateItem {
  id: string;
  name: string;
  category: string;
  code: string;
}

// ─── Section icon map ─────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ElementType> = {
  personalInfo:   User,
  summary:        FileText,
  experience:     Briefcase,
  skills:         Code2,
  projects:       FolderKanban,
  education:      GraduationCap,
  certifications: Award,
  publications:   BookOpen,
};

function getSectionIcon(id: string): React.ElementType {
  return SECTION_ICONS[id] ?? FileText;
}

const TEMPLATES: { id: TemplateId; label: string }[] = [  { id: "classic", label: "Classic" },
  { id: "modern",  label: "Modern"  },
  { id: "minimal", label: "Minimal" },
];

const AI_CREDIT_COST = 0.5;
const AI_ENHANCEABLE: SectionId[] = [
  "summary", "experience", "skills", "projects", "education",
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function sectionHasContent(id: string, fields: ResumeFields): boolean {
  switch (id) {
    case "personalInfo":    return !!(fields.name || fields.email);
    case "summary":         return !!fields.summary;
    case "experience":      return !!fields.experience;
    case "skills":          return !!(fields.skillsLanguages || fields.skillsFrameworks || fields.skillsDatabases || fields.skillsTools);
    case "projects":        return !!fields.projects;
    case "education":       return !!fields.education;
    case "certifications":  return !!fields.certifications;
    case "publications":    return !!fields.publications;
    default:                return false;
  }
}

function sectionAIText(id: string, fields: ResumeFields): string {
  switch (id) {
    case "summary":    return fields.summary;
    case "experience": return fields.experience;
    case "skills":     return [fields.skillsLanguages, fields.skillsFrameworks, fields.skillsDatabases, fields.skillsTools].filter(Boolean).join("\n");
    case "projects":   return fields.projects;
    case "education":  return fields.education;
    default:           return "";
  }
}

function mockAIEnhance(id: SectionId, text: string): string {
  switch (id) {
    case "summary":
      return text
        ? `Results-driven professional with proven expertise in ${text.split(" ").slice(0, 5).join(" ")}. Demonstrated ability to deliver high-impact solutions, optimise performance by 30 %, and collaborate across cross-functional teams in fast-paced environments.`
        : "Results-driven professional with a strong foundation in modern software development. Experienced in creating scalable systems and working seamlessly with cross-functional teams.";
    case "experience":
      return `• Led development of key features resulting in 40 % increase in user engagement\n• Architected scalable microservices handling 10 K+ requests/second\n• Mentored junior developers and conducted regular code reviews\n${text}`;
    case "skills":
      return `${text || "React, TypeScript, Node.js, Python"}\n\nSystem Design · CI/CD Pipelines · Cloud Architecture (AWS/GCP) · Performance Optimisation · Agile/Scrum`;
    case "projects":
      return `${text}\n\n• Implemented comprehensive test coverage achieving 95 % code coverage\n• Reduced page load time by 60 % through lazy loading and code splitting`;
    default:
      return text;
  }
}

function parseProjectsText(text: string): Array<{ title: string; points: string[] }> {
  if (!text.trim()) return [];
  return text.split(/\n\n+/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim());
    return { title: lines[0] ?? "Project", points: lines.slice(1).map((l) => l.replace(/^[•\-*]\s*/, "")) };
  });
}

function parseEducationText(text: string): Array<{ degree: string; institute: string; year: string }> {
  if (!text.trim()) return [];
  return text.split(/\n\n+/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim());
    return { degree: lines[0] ?? "", institute: lines[1] ?? "", year: lines[2] ?? "" };
  });
}

function parseExperienceForTemplate(
  raw: string,
): Array<{ company: string; title: string; dates: string; points: string[] }> {
  const blocks = raw.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const header = lines[0] ?? "";
    const parts  = header.split("|").map((p) => p.trim());
    const points = lines.slice(1).map((l) => l.replace(/^[•\-*]\s*/, "")).filter(Boolean);
    return { company: parts[0] ?? "", title: parts[1] ?? "", dates: parts[2] ?? "", points };
  });
}

function fieldsToResumeData(fields: ResumeFields): ResumeData {
  return {
    name: fields.name || "Your Name",
    role: fields.role || "Professional Role",
    email: fields.email || "email@example.com",
    phone: fields.phone || "",
    links: fields.links || "",
    summary: fields.summary || "",
    languages: fields.skillsLanguages || "",
    frameworks: fields.skillsFrameworks || "",
    database: fields.skillsDatabases || "",
    tools: fields.skillsTools || "",
    experiences: parseExperienceForTemplate(fields.experience),
    projects: parseProjectsText(fields.projects),
    education: parseEducationText(fields.education),
    publication: fields.publications || "",
  };
}

// ─── Legacy resume text parser ────────────────────────────────────────────────

function parseRawResume(text: string): ResumeData {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const data: ResumeData = {
    name: lines[0] || "Your Name", role: "Professional Role",
    email: "", phone: "", links: "", summary: "",
    languages: "", frameworks: "", database: "", tools: "",
    experiences: [], projects: [], education: [], publication: "",
  };
  const HEADERS = ["PROFILE", "PROJECTS", "TECHNICAL SKILLS", "EDUCATION", "PUBLICATION"];
  const firstIdx = lines.findIndex((l) => HEADERS.includes(l.toUpperCase()));
  if (firstIdx > 1) {
    const contactLines = lines.slice(1, firstIdx);
    data.phone = contactLines.find((l) => l.includes("+")) || "";
    data.links = contactLines.filter((l) => l.toLowerCase().includes("linkedin") || l.toLowerCase().includes("github") || l.includes("•")).join(" | ");
  }
  let cur = "";
  let curLines: string[] = [];
  const flush = (name: string, content: string[]) => {
    switch (name) {
      case "PROFILE":
        data.summary = content.join(" ");
        if (content[0]) data.role = content[0];
        break;
      case "TECHNICAL SKILLS":
        content.forEach((l) => {
          if (l.startsWith("Languages"))  data.languages  = l.split(":")[1]?.trim() || "";
          if (l.startsWith("Framework"))  data.frameworks = l.split(":")[1]?.trim() || "";
          if (l.startsWith("DataBase"))   data.database   = l.split(":")[1]?.trim() || "";
          if (l.startsWith("Other"))      data.tools      = l.split(":")[1]?.trim() || "";
        });
        break;
      case "PROJECTS": {
        let proj: { title: string; points: string[] } | null = null;
        content.forEach((l) => {
          if (!l.match(/^[📌•\-*]/) && l.length > 20) {
            if (proj) data.projects.push(proj);
            proj = { title: l, points: [] };
          } else if (proj) {
            proj.points.push(l.replace(/^[📌•\-*]\s*/, ""));
          }
        });
        if (proj) data.projects.push(proj);
        break;
      }
      case "EDUCATION":
        for (let i = 0; i < content.length; i += 4)
          if (content[i]) data.education.push({ degree: content[i] || "", institute: content[i + 1] || "", year: content[i + 3] || "" });
        break;
      case "PUBLICATION":
        data.publication = content.join(" ");
        break;
    }
  };
  lines.forEach((line) => {
    if (HEADERS.includes(line.toUpperCase())) {
      if (cur) flush(cur, curLines);
      cur = line.toUpperCase();
      curLines = [];
    } else if (cur) {
      curLines.push(line);
    }
  });
  if (cur) flush(cur, curLines);
  return data;
}

function configToFields(config: any): { fields: Partial<ResumeFields>; title: string } {
  // ── Path A: resume was previously saved via the builder ─────────────────
  // The API returns a flat `fields` object (same shape as ResumeFields) so we
  // can use it directly without going through parseRawResume.
  if (config.sourceType === "builder" && config.fields) {
    return {
      title:  config.resumeTitle || config.title || "My Resume",
      fields: config.fields as Partial<ResumeFields>,
    };
  }

  // ── Path B: resume was parsed from an uploaded file ──────────────────────
  let d: ResumeData;
  if (config.sourceType === "resume" && config.resumeContext) {
    try { d = JSON.parse(config.resumeContext); }
    catch { d = parseRawResume(config.resumeContext); }
  } else {
    d = {
      name: "Your Name", role: "Professional Role",
      email: "email@example.com", phone: "", links: "",
      summary: config.manualData?.summary || "",
      languages: "", frameworks: "", database: "", tools: "",
      experiences: [], projects: [], education: [], publication: "",
    };
  }
  return {
    title: config.resumeTitle || "My Resume",
    fields: {
      name: d.name, role: d.role, email: d.email,
      phone: d.phone, links: d.links, summary: d.summary,
      experience: d.role,
      skillsLanguages: d.languages, skillsFrameworks: d.frameworks,
      skillsDatabases: d.database, skillsTools: d.tools,
      projects: d.projects.map((p) => `${p.title}\n${p.points.map((pt) => `• ${pt}`).join("\n")}`).join("\n\n"),
      education: d.education.map((e) => `${e.degree}\n${e.institute}\n${e.year}`).join("\n\n"),
      publications: d.publication,
    },
  };
}

// ─── populateTemplate ─────────────────────────────────────────────────────────

function populateTemplate(html: string, data: ResumeData, options: Record<string, boolean>) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const optMap: Record<string, string> = { name: "personalInfo", role: "personalInfo", email: "personalInfo", phone: "personalInfo", links: "personalInfo", summary: "summary", languages: "skills", frameworks: "skills", database: "skills", tools: "skills", publication: "certifications" };
  doc.querySelectorAll("[data-field]").forEach((el) => {
    const f = el.getAttribute("data-field");
    if (!f) return;
    const v = data[f as keyof ResumeData];
    if (typeof v === "string") {
      el.textContent = v;
      if (optMap[f] && options[optMap[f]] === false) (el as HTMLElement).style.display = "none";
    }
  });
  doc.querySelectorAll("[data-list]").forEach((container) => {
    const listName = container.getAttribute("data-list");
    const listData = data[listName as keyof ResumeData];
    const listOptMap: Record<string, string> = { projects: "projects", education: "education" };
    if (listOptMap[listName ?? ""] && options[listOptMap[listName ?? ""]] === false) { (container as HTMLElement).style.display = "none"; return; }
    if (!Array.isArray(listData) || !container.firstElementChild) return;
    const tpl = container.firstElementChild.cloneNode(true) as HTMLElement;
    container.innerHTML = "";
    (listData as Record<string, unknown>[]).forEach((item) => {
      const clone = tpl.cloneNode(true) as HTMLElement;
      Object.entries(item).forEach(([key, val]) => {
        clone.querySelectorAll(`[data-field="${key}"]`).forEach((el) => { el.textContent = val as string; });
        if (key === "points" && Array.isArray(val)) {
          const pts = clone.querySelector('[data-list="points"]');
          if (pts?.firstElementChild) {
            const ptTpl = pts.firstElementChild.cloneNode(true) as HTMLElement;
            pts.innerHTML = "";
            (val as string[]).forEach((pt) => {
              const c = ptTpl.cloneNode(true) as HTMLElement;
              (c.querySelector('[data-field="point"]') || c).textContent = pt;
              pts.appendChild(c);
            });
          }
        }
      });
      container.appendChild(clone);
    });
  });
  return doc.documentElement.outerHTML;
}

const SESSION_CONFIG_KEY = "resume_editor_config";

// ═══════════════════════════════════════════════════════════════════════════════
//  PANEL SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate  = useNavigate();
  const resumeTitle    = useSelector((s: RootState) => s.resumeBuilder.resumeTitle);
  const past           = useSelector((s: RootState) => s.resumeBuilder.past);
  const future         = useSelector((s: RootState) => s.resumeBuilder.future);
  const autoSaveStatus = useSelector((s: RootState) => s.resumeBuilder.autoSaveStatus);
  const autoSaveEnabled = useSelector((s: RootState) => s.resumeBuilder.autoSaveEnabled);
  const isDirty        = useSelector((s: RootState) => s.resumeBuilder.isDirty);
  const savedResumeId  = useSelector((s: RootState) => s.resumeBuilder.savedResumeId);
  const fields         = useSelector((s: RootState) => s.resumeBuilder.fields);
  const sections       = useSelector((s: RootState) => s.resumeBuilder.sections);
  const templateId     = useSelector((s: RootState) => s.resumeBuilder.templateId);
  const jobDescription = useSelector((s: RootState) => s.resumeBuilder.jobDescription);
  const jobTitle       = useSelector((s: RootState) => s.resumeBuilder.jobTitle);
  const company        = useSelector((s: RootState) => s.resumeBuilder.company);
  const { getToken }   = useAuth();
  const handleSave = useCallback(async () => {
    dispatch(setAutoSaveStatus("saving"));
    try {
      const userId = localStorage.getItem("userId");
      const token = await getToken();
      const res = await fetch(ENDPOINTS.resumeBuilderSave(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId,
          resumeId: savedResumeId ?? null,
          title: resumeTitle,
          templateId,
          fields,
          sections,
          jobDescription,
          jobTitle,
          company,
          status: "draft",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (!savedResumeId && data.id) dispatch(setSavedResumeId(data.id));
      dispatch(setAutoSaveStatus("saved"));
    } catch (err) {
      console.error("[TopBar] save error:", err);
      dispatch(setAutoSaveStatus("error"));
    }
  }, [dispatch, getToken, savedResumeId, resumeTitle, templateId, fields, sections, jobDescription, jobTitle, company]);

  const handleExportPdf = useCallback(async () => {
    try {
      const userId = localStorage.getItem("userId");
      const token = await getToken();
      const res = await fetch(ENDPOINTS.resumeBuilderExportPdf(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, resumeId: savedResumeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank", "noopener,noreferrer");

      // Mark the resume as complete once it has been downloaded AND there are no
      // unsaved changes. Both conditions must hold simultaneously.
      if (savedResumeId && !isDirty) {
        try {
          await fetch(ENDPOINTS.resumeBuilderComplete(savedResumeId), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ userId }),
          });
        } catch {
          // Non-fatal — completion can be retried on next download
        }
      }
    } catch (err) {
      console.error("[TopBar] PDF export error:", err);
    }
  }, [getToken, savedResumeId, isDirty]);

  // Derived save-status label (always visible)
  const saveLabel = (() => {
    if (autoSaveStatus === "saving") return { icon: <Loader2 className="h-3 w-3 animate-spin" />, text: "Saving…", cls: "text-muted-foreground" };
    if (autoSaveStatus === "saved")  return { icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" />, text: "Saved", cls: "text-emerald-600 font-medium" };
    if (autoSaveStatus === "error")  return { icon: <AlertTriangle className="h-3 w-3 text-destructive" />, text: "Save failed", cls: "text-destructive font-medium" };
    if (isDirty && !autoSaveEnabled) return { icon: <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />, text: "Unsaved", cls: "text-amber-600 font-medium" };
    if (isDirty)                      return { icon: <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />, text: "Unsaved", cls: "text-amber-600 font-medium" };
    return null;
  })();

  return (
    <header className="flex items-center gap-2 px-4 border-b border-border bg-background shrink-0 h-14">
      {/* Back */}
      <button
        onClick={() => navigate("/resume/build")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 h-8 px-2 rounded-lg hover:bg-muted/60"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="font-medium">Back</span>
      </button>

      <div className="h-5 w-px bg-border shrink-0" />

      {/* Editable title — dirty dot prefix like VS Code */}
      <div className="flex items-center gap-1 min-w-0">
        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />}
        <input
          value={resumeTitle}
          onChange={(e) => dispatch(setResumeTitle(e.target.value))}
          className="text-sm font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30 rounded-md px-2 py-1 text-foreground min-w-0 w-44"
          aria-label="Resume title"
        />
      </div>

      <div className="h-5 w-px bg-border shrink-0" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => dispatch(undo())}
          disabled={past.length === 0}
          title="Undo (⌘Z)"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => dispatch(redo())}
          disabled={future.length === 0}
          title="Redo (⌘Y)"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Auto-save toggle + status — always visible */}
      <div className="flex items-center gap-1.5 shrink-0 ml-1">
        {/* Toggle button */}
        <button
          onClick={() => dispatch(toggleAutoSave())}
          title={autoSaveEnabled ? "Auto-save is ON — click to disable" : "Auto-save is OFF — click to enable"}
          className={cn(
            "flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all",
            autoSaveEnabled
              ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              : "bg-muted border-border text-muted-foreground hover:bg-muted/80",
          )}
        >
          {autoSaveEnabled
            ? <Cloud className="h-3 w-3" />
            : <CloudOff className="h-3 w-3" />}
          <span>{autoSaveEnabled ? "Auto-save" : "Manual"}</span>
        </button>

        {/* Status indicator */}
        {saveLabel && (
          <div className={cn("flex items-center gap-1.5 text-xs", saveLabel.cls)}>
            {saveLabel.icon}
            <span>{saveLabel.text}</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      <button
        onClick={handleExportPdf}
        disabled={!savedResumeId}
        title={savedResumeId ? "Export as PDF" : "Save your resume first to export PDF"}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download className="h-3.5 w-3.5" /> PDF
      </button>

      <button
        onClick={handleSave}
        disabled={autoSaveStatus === "saving"}
        className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-sm font-semibold transition-colors shrink-0 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {autoSaveStatus === "saving"
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Save className="h-3.5 w-3.5" />}
        Save
      </button>
    </header>
  );
}

// ─── LeftPanel ────────────────────────────────────────────────────────────────

function LeftPanel() {
  const dispatch      = useDispatch<AppDispatch>();
  const sections      = useSelector((s: RootState) => s.resumeBuilder.sections);
  const customDefs    = useSelector((s: RootState) => s.resumeBuilder.customSectionDefs);
  const activeSection = useSelector((s: RootState) => s.resumeBuilder.activeSection);
  const fields        = useSelector((s: RootState) => s.resumeBuilder.fields);
  const [hovered, setHovered] = useState<string | null>(null);

  // Merge standard + custom enabled sections in display order
  const allSections   = [...sections, ...customDefs];
  const enabled       = allSections.filter((s) => s.enabled);
  const disabledCore  = sections.filter((s) => !s.enabled && !s.required);
  const disabledCustom = customDefs.filter((s) => !s.enabled);

  return (
    <aside className="w-[220px] shrink-0 border-r border-border bg-background flex flex-col overflow-y-auto">
      <div className="px-4 pt-5 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Sections</p>
      </div>

      <nav className="flex-1 px-3 pb-4 space-y-px">
        {enabled.map((sec, idx) => {
          const Icon     = getSectionIcon(sec.id);
          const isActive = activeSection === sec.id;
          const hasCont  = sec.id in SECTION_ICONS ? sectionHasContent(sec.id as any, fields) : (() => {
            try { const m = JSON.parse(fields._customSections || "{}"); return !!(m[sec.id]?.trim()); } catch { return false; }
          })();
          const isHov    = hovered === sec.id;
          const isCustom = !sections.find((s) => s.id === sec.id);

          return (
            <div key={sec.id} className="relative" onMouseEnter={() => setHovered(sec.id)} onMouseLeave={() => setHovered(null)}>
              <button
                onClick={() => dispatch(setActiveSection(sec.id))}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer",
                  isActive
                    ? "bg-[var(--color-brand)] text-white font-semibold shadow-sm"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted/70 font-medium",
                )}
              >
                <span className={cn(
                  "w-2 h-2 rounded-full shrink-0 transition-colors",
                  hasCont
                    ? isActive ? "bg-white" : "bg-emerald-500"
                    : isActive ? "bg-white/30" : "bg-border"
                )} />
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span className="truncate flex-1 text-left text-[13px]">{sec.label}</span>
                {sec.required && (
                  <Lock className={cn("h-3 w-3 shrink-0", isActive ? "text-white/40" : "text-muted-foreground/30")} />
                )}
              </button>

              {/* Hover controls */}
              {isHov && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background rounded-lg shadow-md border border-border z-10 p-0.5">
                  <button onClick={(e) => { e.stopPropagation(); dispatch(moveSectionUp(sec.id)); }} disabled={idx === 0} className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted disabled:opacity-25" title="Move up">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); dispatch(moveSectionDown(sec.id)); }} disabled={idx === enabled.length - 1} className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted disabled:opacity-25" title="Move down">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {!sec.required && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCustom) dispatch(toggleCustomSection(sec.id));
                        else dispatch(toggleSection(sec.id));
                      }}
                      className="h-5 w-5 rounded flex items-center justify-center hover:bg-red-50 text-red-400" title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Add optional sections */}
      {(disabledCore.length > 0 || disabledCustom.length > 0) && (
        <div className="px-3 pb-5 border-t border-border pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 px-1 mb-2">Add Section</p>
          {disabledCore.map((sec) => (
            <button
              key={sec.id}
              onClick={() => dispatch(toggleSection(sec.id))}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              {sec.label}
            </button>
          ))}
          {disabledCustom.map((sec) => (
            <button
              key={sec.id}
              onClick={() => dispatch(toggleCustomSection(sec.id))}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              {sec.label}
              <span className="ml-auto text-[10px] text-muted-foreground/40 bg-muted px-1.5 rounded">detected</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

// ─── Multi-entry section helpers ─────────────────────────────────────────────
//
// Work Experience, Education, and Projects each support multiple independent
// entries.  We parse the raw text string (double-newline separated blocks)
// into structured objects, render them as individual cards, and re-join on
// every change so the Redux field value always stays in sync.

interface ExperienceEntry {
  _id: string;
  company: string;
  title: string;
  dates: string;
  bullets: string; // newline-separated bullet points
}

interface EducationEntry {
  _id: string;
  degree: string;
  institution: string;
  dates: string;
  extra: string; // GPA, awards, etc.
}

interface ProjectEntry {
  _id: string;
  title: string;
  bullets: string;
}

let _entrySeq = 0;
function uid() { return `e_${++_entrySeq}_${Math.random().toString(36).slice(2, 7)}`; }

// ── Experience parsers / serialisers ─────────────────────────────────────────

function parseExperienceEntries(raw: string): ExperienceEntry[] {
  const blocks = raw.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return [blankExperience()];
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    // First line: "Company | Title | Dates"  or  "Company | Title"  or just "Company"
    const headerLine = lines[0] ?? "";
    const parts = headerLine.split("|").map((p) => p.trim());
    const bullets = lines.slice(1).map((l) => l.replace(/^[•\-*]\s*/, "")).join("\n");
    return {
      _id: uid(),
      company: parts[0] ?? "",
      title:   parts[1] ?? "",
      dates:   parts[2] ?? "",
      bullets,
    };
  });
}

function serialiseExperienceEntries(entries: ExperienceEntry[]): string {
  return entries
    .map((e) => {
      const header = [e.company, e.title, e.dates].filter(Boolean).join(" | ");
      const pts    = e.bullets.split("\n").filter(Boolean).map((l) => `• ${l.replace(/^[•\-*]\s*/, "")}`).join("\n");
      return pts ? `${header}\n${pts}` : header;
    })
    .join("\n\n");
}

function blankExperience(): ExperienceEntry {
  return { _id: uid(), company: "", title: "", dates: "", bullets: "" };
}

// ── Education parsers / serialisers ──────────────────────────────────────────

function parseEducationEntries(raw: string): EducationEntry[] {
  const blocks = raw.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return [blankEducation()];
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    return {
      _id:         uid(),
      degree:      lines[0] ?? "",
      institution: lines[1] ?? "",
      dates:       lines[2] ?? "",
      extra:       lines.slice(3).join("\n"),
    };
  });
}

function serialiseEducationEntries(entries: EducationEntry[]): string {
  return entries
    .map((e) => [e.degree, e.institution, e.dates, e.extra].filter(Boolean).join("\n"))
    .join("\n\n");
}

function blankEducation(): EducationEntry {
  return { _id: uid(), degree: "", institution: "", dates: "", extra: "" };
}

// ── Project parsers / serialisers ─────────────────────────────────────────────

function parseProjectEntries(raw: string): ProjectEntry[] {
  const blocks = raw.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return [blankProject()];
  return blocks.map((block) => {
    const lines  = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const title  = lines[0] ?? "";
    const bullets = lines.slice(1).map((l) => l.replace(/^[•\-*]\s*/, "")).join("\n");
    return { _id: uid(), title, bullets };
  });
}

function serialiseProjectEntries(entries: ProjectEntry[]): string {
  return entries
    .map((e) => {
      const pts = e.bullets.split("\n").filter(Boolean).map((l) => `• ${l.replace(/^[•\-*]\s*/, "")}`).join("\n");
      return pts ? `${e.title}\n${pts}` : e.title;
    })
    .join("\n\n");
}

function blankProject(): ProjectEntry {
  return { _id: uid(), title: "", bullets: "" };
}

// ── Shared card chrome ────────────────────────────────────────────────────────

function EntryCard({
  index, total, label, onMoveUp, onMoveDown, onRemove, defaultOpen = true, children,
}: {
  index: number; total: number; label: string;
  onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 text-left text-sm font-semibold text-foreground min-w-0"
        >
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", !open && "-rotate-90")} />
          <span className="truncate">{label || `Entry ${index + 1}`}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" disabled={index === 0} onClick={onMoveUp} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted disabled:opacity-25 text-muted-foreground" title="Move up">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={index === total - 1} onClick={onMoveDown} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted disabled:opacity-25 text-muted-foreground" title="Move down">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {total > 1 && (
            <button type="button" onClick={onRemove} className="h-6 w-6 rounded flex items-center justify-center hover:bg-red-50 text-red-400" title="Remove">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ── ExperienceEditor ──────────────────────────────────────────────────────────

const ExperienceEditor = React.memo(function ExperienceEditor() {
  const dispatch = useDispatch<AppDispatch>();
  const raw      = useSelector((s: RootState) => s.resumeBuilder.fields.experience);

  const [entries, setEntries] = useState<ExperienceEntry[]>(() => parseExperienceEntries(raw));

  // Sync inward when Redux changes from outside (e.g. AI enhance / tailor)
  const rawRef = useRef(raw);
  useEffect(() => {
    if (raw !== rawRef.current) {
      rawRef.current = raw;
      setEntries(parseExperienceEntries(raw));
    }
  }, [raw]);

  const commit = useCallback((next: ExperienceEntry[]) => {
    const serialised = serialiseExperienceEntries(next);
    rawRef.current   = serialised;
    dispatch(updateField({ field: "experience", value: serialised }));
  }, [dispatch]);

  const updateEntry = useCallback(<K extends keyof ExperienceEntry>(
    id: string, key: K, value: ExperienceEntry[K],
  ) => {
    setEntries((prev) => {
      const next = prev.map((e) => e._id === id ? { ...e, [key]: value } : e);
      commit(next);
      return next;
    });
  }, [commit]);

  const moveUp   = useCallback((idx: number) => setEntries((p) => { const n=[...p]; [n[idx-1],n[idx]]=[n[idx],n[idx-1]]; commit(n); return n; }), [commit]);
  const moveDown = useCallback((idx: number) => setEntries((p) => { const n=[...p]; [n[idx],n[idx+1]]=[n[idx+1],n[idx]]; commit(n); return n; }), [commit]);
  const remove   = useCallback((id: string) => setEntries((p) => { const n=p.filter((e)=>e._id!==id); commit(n); return n; }), [commit]);
  const addNew   = useCallback(() => setEntries((p) => { const n=[...p, blankExperience()]; commit(n); return n; }), [commit]);

  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <EntryCard
          key={entry._id}
          index={idx} total={entries.length}
          label={[entry.company, entry.title].filter(Boolean).join(" — ")}
          onMoveUp={() => moveUp(idx)} onMoveDown={() => moveDown(idx)} onRemove={() => remove(entry._id)}
          defaultOpen={idx === 0}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Company</Label>
              <Input value={entry.company} onChange={(e) => updateEntry(entry._id, "company", e.target.value)} placeholder="WebSenor Inc." className="h-9 text-sm rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Job Title</Label>
              <Input value={entry.title} onChange={(e) => updateEntry(entry._id, "title", e.target.value)} placeholder="Senior Engineer" className="h-9 text-sm rounded-lg" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">Dates</Label>
              <Input value={entry.dates} onChange={(e) => updateEntry(entry._id, "dates", e.target.value)} placeholder="Jan 2022 – Present" className="h-9 text-sm rounded-lg" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground">Bullet Points (one per line)</Label>
            <Textarea
              value={entry.bullets}
              onChange={(e) => updateEntry(entry._id, "bullets", e.target.value)}
              placeholder={"Achieved X by doing Y, resulting in Z\nLed initiative that reduced costs by N%"}
              rows={4}
              className="resize-none text-sm rounded-lg border-border bg-background placeholder:text-muted-foreground/40 leading-relaxed"
            />
          </div>
        </EntryCard>
      ))}
      <button
        type="button" onClick={addNew}
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add Experience
      </button>
    </div>
  );
});

// ── EducationEditor ───────────────────────────────────────────────────────────

const EducationEditor = React.memo(function EducationEditor() {
  const dispatch = useDispatch<AppDispatch>();
  const raw      = useSelector((s: RootState) => s.resumeBuilder.fields.education);

  const [entries, setEntries] = useState<EducationEntry[]>(() => parseEducationEntries(raw));

  const rawRef = useRef(raw);
  useEffect(() => {
    if (raw !== rawRef.current) {
      rawRef.current = raw;
      setEntries(parseEducationEntries(raw));
    }
  }, [raw]);

  const commit = useCallback((next: EducationEntry[]) => {
    const s = serialiseEducationEntries(next);
    rawRef.current = s;
    dispatch(updateField({ field: "education", value: s }));
  }, [dispatch]);

  const updateEntry = useCallback(<K extends keyof EducationEntry>(id: string, key: K, val: EducationEntry[K]) => {
    setEntries((prev) => { const n = prev.map((e) => e._id === id ? { ...e, [key]: val } : e); commit(n); return n; });
  }, [commit]);

  const moveUp   = useCallback((i: number) => setEntries((p) => { const n=[...p]; [n[i-1],n[i]]=[n[i],n[i-1]]; commit(n); return n; }), [commit]);
  const moveDown = useCallback((i: number) => setEntries((p) => { const n=[...p]; [n[i],n[i+1]]=[n[i+1],n[i]]; commit(n); return n; }), [commit]);
  const remove   = useCallback((id: string) => setEntries((p) => { const n=p.filter((e)=>e._id!==id); commit(n); return n; }), [commit]);
  const addNew   = useCallback(() => setEntries((p) => { const n=[...p, blankEducation()]; commit(n); return n; }), [commit]);

  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <EntryCard
          key={entry._id} index={idx} total={entries.length}
          label={[entry.degree, entry.institution].filter(Boolean).join(" — ")}
          onMoveUp={() => moveUp(idx)} onMoveDown={() => moveDown(idx)} onRemove={() => remove(entry._id)}
          defaultOpen={idx === 0}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Degree / Qualification</Label>
              <Input value={entry.degree} onChange={(e) => updateEntry(entry._id, "degree", e.target.value)} placeholder="BSc Computer Science" className="h-9 text-sm rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Institution</Label>
              <Input value={entry.institution} onChange={(e) => updateEntry(entry._id, "institution", e.target.value)} placeholder="MIT — Massachusetts Institute of Technology" className="h-9 text-sm rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Dates / Year</Label>
              <Input value={entry.dates} onChange={(e) => updateEntry(entry._id, "dates", e.target.value)} placeholder="2019 – 2023" className="h-9 text-sm rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Additional Info (GPA, honours, etc.)</Label>
              <Input value={entry.extra} onChange={(e) => updateEntry(entry._id, "extra", e.target.value)} placeholder="GPA: 3.9 / 4.0, Dean's List" className="h-9 text-sm rounded-lg" />
            </div>
          </div>
        </EntryCard>
      ))}
      <button
        type="button" onClick={addNew}
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add Education
      </button>
    </div>
  );
});

// ── ProjectsEditor ────────────────────────────────────────────────────────────

const ProjectsEditor = React.memo(function ProjectsEditor() {
  const dispatch = useDispatch<AppDispatch>();
  const raw      = useSelector((s: RootState) => s.resumeBuilder.fields.projects);

  const [entries, setEntries] = useState<ProjectEntry[]>(() => parseProjectEntries(raw));

  const rawRef = useRef(raw);
  useEffect(() => {
    if (raw !== rawRef.current) {
      rawRef.current = raw;
      setEntries(parseProjectEntries(raw));
    }
  }, [raw]);

  const commit = useCallback((next: ProjectEntry[]) => {
    const s = serialiseProjectEntries(next);
    rawRef.current = s;
    dispatch(updateField({ field: "projects", value: s }));
  }, [dispatch]);

  const updateEntry = useCallback(<K extends keyof ProjectEntry>(id: string, key: K, val: ProjectEntry[K]) => {
    setEntries((prev) => { const n = prev.map((e) => e._id === id ? { ...e, [key]: val } : e); commit(n); return n; });
  }, [commit]);

  const moveUp   = useCallback((i: number) => setEntries((p) => { const n=[...p]; [n[i-1],n[i]]=[n[i],n[i-1]]; commit(n); return n; }), [commit]);
  const moveDown = useCallback((i: number) => setEntries((p) => { const n=[...p]; [n[i],n[i+1]]=[n[i+1],n[i]]; commit(n); return n; }), [commit]);
  const remove   = useCallback((id: string) => setEntries((p) => { const n=p.filter((e)=>e._id!==id); commit(n); return n; }), [commit]);
  const addNew   = useCallback(() => setEntries((p) => { const n=[...p, blankProject()]; commit(n); return n; }), [commit]);

  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <EntryCard
          key={entry._id} index={idx} total={entries.length}
          label={entry.title || `Project ${idx + 1}`}
          onMoveUp={() => moveUp(idx)} onMoveDown={() => moveDown(idx)} onRemove={() => remove(entry._id)}
          defaultOpen={idx === 0}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Project Name</Label>
              <Input value={entry.title} onChange={(e) => updateEntry(entry._id, "title", e.target.value)} placeholder="AI Resume Builder" className="h-9 text-sm rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Bullet Points (one per line)</Label>
              <Textarea
                value={entry.bullets}
                onChange={(e) => updateEntry(entry._id, "bullets", e.target.value)}
                placeholder={"Built with React + TypeScript\nReduced load time by 60% via code splitting"}
                rows={4}
                className="resize-none text-sm rounded-lg border-border bg-background placeholder:text-muted-foreground/40 leading-relaxed"
              />
            </div>
          </div>
        </EntryCard>
      ))}
      <button
        type="button" onClick={addNew}
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add Project
      </button>
    </div>
  );
});

// ─── FieldInput (module-level — MUST be outside any component) ───────────────
//
// Defining this inside SectionEditorFields causes React to create a NEW
// component reference on every parent render, forcing every input to unmount
// and remount — which is why focus was lost after every keystroke.
// Moving it to module scope means React always sees the SAME component type.
// Each instance subscribes only to its own field slice via useSelector so
// unrelated keystrokes never re-render sibling fields.  (rerender-no-inline-components)

const FieldInput = React.memo(function FieldInput({
  label, fieldKey, placeholder, multiline = false, rows = 3, fullRow = false,
}: {
  label:        string;
  fieldKey:     keyof ResumeFields;
  placeholder?: string;
  multiline?:   boolean;
  rows?:        number;
  fullRow?:     boolean;
}) {
  const dispatch = useDispatch<AppDispatch>();
  // Subscribe only to this field — not the whole fields object  (rerender-derive-state)
  const value    = useSelector((s: RootState) => s.resumeBuilder.fields[fieldKey]);
  const isLocked = useSelector((s: RootState) => !!s.resumeBuilder.lockedFields[fieldKey]);

  // Stable callback ref — doesn't re-create on re-renders  (advanced-event-handler-refs)
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dispatch(updateField({ field: fieldKey, value: e.target.value }));
    },
    [dispatch, fieldKey],
  );

  return (
    <div className={cn("space-y-1.5", fullRow && "col-span-2")}>
      <div className="flex items-center gap-1.5">
        {isLocked && <Lock className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
        <Label className={cn(
          "text-sm font-semibold tracking-tight",
          isLocked ? "text-muted-foreground" : "text-foreground",
        )}>
          {label}
        </Label>
        {isLocked && (
          <span className="text-[10px] text-muted-foreground/50 bg-muted/60 px-1.5 py-0.5 rounded-md font-medium ml-1">
            locked
          </span>
        )}
      </div>
      {multiline ? (
        <Textarea
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={isLocked}
          rows={rows}
          className={cn(
            "resize-none text-sm leading-relaxed rounded-xl border-border bg-background",
            "focus-visible:border-[var(--color-brand)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/15 focus-visible:ring-offset-0",
            "placeholder:text-muted-foreground/40",
            isLocked && "bg-muted/30 text-muted-foreground cursor-not-allowed opacity-60",
          )}
        />
      ) : (
        <Input
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={isLocked}
          className={cn(
            "h-10 rounded-xl border-border bg-background text-sm",
            "focus-visible:border-[var(--color-brand)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/15 focus-visible:ring-offset-0",
            "placeholder:text-muted-foreground/40",
            isLocked && "bg-muted/30 text-muted-foreground cursor-not-allowed opacity-60",
          )}
        />
      )}
    </div>
  );
});

// ─── SectionEditorFields ──────────────────────────────────────────────────────

function SectionEditorFields() {
  // Only read the active section — each FieldInput subscribes to its own field
  const activeSection = useSelector((s: RootState) => s.resumeBuilder.activeSection);

  switch (activeSection) {
    case "personalInfo":
      return (
        <div className="grid grid-cols-2 gap-4">
          <FieldInput label="Full Name"          fieldKey="name"  placeholder="Jane Smith"                   fullRow />
          <FieldInput label="Professional Title" fieldKey="role"  placeholder="Senior Software Engineer"     fullRow />
          <FieldInput label="Email"              fieldKey="email" placeholder="jane@example.com" />
          <FieldInput label="Phone"              fieldKey="phone" placeholder="+1 (555) 000-0000" />
          <FieldInput label="Location"           fieldKey="location" placeholder="San Francisco, CA" />
          <FieldInput label="Portfolio / Links"  fieldKey="links" placeholder="github.com/jane | portfolio.dev" />
        </div>
      );
    case "summary":
      return (
        <FieldInput
          label="Professional Summary" fieldKey="summary" multiline rows={7}
          placeholder="Write a compelling 2–4 sentence summary of your professional background, key skills, and what you bring to the role..."
        />
      );
    case "experience":
      return <ExperienceEditor />;
    case "skills":
      return (
        <div className="space-y-4">
          <FieldInput label="Languages"             fieldKey="skillsLanguages"  placeholder="Python, TypeScript, Go" />
          <FieldInput label="Frameworks & Libraries" fieldKey="skillsFrameworks" placeholder="React, Node.js, FastAPI, Django" />
          <FieldInput label="Databases"             fieldKey="skillsDatabases"  placeholder="PostgreSQL, MongoDB, Redis" />
          <FieldInput label="Tools & Platforms"     fieldKey="skillsTools"      placeholder="Docker, Kubernetes, AWS, CI/CD" />
        </div>
      );
    case "projects":
      return <ProjectsEditor />;
    case "education":
      return <EducationEditor />;
    case "certifications":
      return (
        <FieldInput
          label="Certifications" fieldKey="certifications" multiline rows={6}
          placeholder={"AWS Solutions Architect – Associate (2023)\nGoogle Cloud Professional Data Engineer (2022)"}
        />
      );
    case "publications":
      return (
        <FieldInput
          label="Publications" fieldKey="publications" multiline rows={6}
          placeholder={"Smith, J. et al. (2023). Title. Journal Name, Vol(Issue), pp.\nDOI: https://doi.org/..."}
        />
      );
    default:
      // Custom / detected section
      return <CustomSectionEditor sectionId={activeSection} />;
  }
}

// ─── CustomSectionEditor ──────────────────────────────────────────────────────

const CustomSectionEditor = React.memo(function CustomSectionEditor({ sectionId }: { sectionId: string }) {
  const dispatch  = useDispatch<AppDispatch>();
  const rawMap    = useSelector((s: RootState) => s.resumeBuilder.fields._customSections);
  const sectionLabel = useSelector((s: RootState) =>
    s.resumeBuilder.customSectionDefs.find((d) => d.id === sectionId)?.label ?? sectionId,
  );

  const value = (() => {
    try { return (JSON.parse(rawMap || "{}") as Record<string, string>)[sectionId] ?? ""; } catch { return ""; }
  })();

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold tracking-tight text-foreground">{sectionLabel}</Label>
      <Textarea
        value={value}
        onChange={(e) => dispatch(updateCustomField({ id: sectionId, value: e.target.value }))}
        rows={8}
        placeholder={`Enter your ${sectionLabel} details here…`}
        className="resize-none text-sm leading-relaxed rounded-xl border-border bg-background focus-visible:border-[var(--color-brand)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/15 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40"
      />
    </div>
  );
});

// ─── AiDiffPanel ─────────────────────────────────────────────────────────────

function AiDiffPanel() {
  const dispatch     = useDispatch<AppDispatch>();
  const aiSuggestion = useSelector((s: RootState) => s.resumeBuilder.aiSuggestion);
  const aiSectionId  = useSelector((s: RootState) => s.resumeBuilder.aiSectionId);
  const fields       = useSelector((s: RootState) => s.resumeBuilder.fields);

  if (!aiSuggestion || !aiSectionId) return null;

  const currentText = sectionAIText(aiSectionId, fields);

  return (
    <div className="rounded-2xl border border-[var(--color-brand)]/20 bg-background shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-[var(--color-brand-muted)]/60">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-[var(--color-brand)]/15 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-brand)]" />
          </div>
          <span className="text-sm font-bold text-foreground">AI Enhancement Ready</span>
        </div>
        <button
          onClick={() => dispatch(discardAiSuggestion())}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Diff */}
      <div className="grid grid-cols-2 divide-x divide-border max-h-52 overflow-auto">
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">{currentText || "(empty)"}</p>
        </div>
        <div className="p-4 space-y-2 bg-[var(--color-brand-muted)]/40">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-brand)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand)]">AI Enhanced</span>
          </div>
          <p className="text-xs leading-relaxed whitespace-pre-line">{aiSuggestion}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-t border-border bg-muted/20">
        <button
          onClick={() => dispatch(applyAiSuggestion())}
          className="flex items-center gap-1.5 px-5 h-8 rounded-xl bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-sm font-semibold transition-colors"
        >
          <Check className="h-3.5 w-3.5" /> Apply Changes
        </button>
        <button
          onClick={() => dispatch(discardAiSuggestion())}
          className="flex items-center gap-1.5 px-5 h-8 rounded-xl border border-border hover:bg-muted/60 text-sm font-medium transition-colors"
        >
          <X className="h-3.5 w-3.5" /> Discard
        </button>
      </div>
    </div>
  );
}

// ─── SectionQualityMeter ──────────────────────────────────────────────────────

const QUALITY_COLORS = {
  excellent:        { bar: "#22c55e", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200/60", label: "Excellent" },
  good:             { bar: "#84cc16", bg: "bg-lime-50",    text: "text-lime-700",    border: "border-lime-200/60",    label: "Good"      },
  needs_improvement:{ bar: "#f59e0b", bg: "bg-amber-50",  text: "text-amber-700",   border: "border-amber-200/60",  label: "Needs work"},
  poor:             { bar: "#ef4444", bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200/60",    label: "Poor"      },
} as const;

function SectionQualityMeter({ quality }: { quality: SectionQuality | undefined }) {
  const [open, setOpen] = useState(false);

  if (!quality) return null;

  const { score, status, issues, suggestions, constraints, wordCount, isValidating } = quality;
  const colors = QUALITY_COLORS[status] ?? QUALITY_COLORS.needs_improvement;

  // Word count range indicator
  const wordPct = Math.min(100, (wordCount / constraints.maxWords) * 100);
  const inRange  = wordCount >= constraints.minWords && wordCount <= constraints.maxWords;
  const tooShort = wordCount < constraints.minWords;
  const wordBadgeColor = inRange ? "text-emerald-600" : tooShort ? "text-amber-600" : "text-red-600";

  return (
    <div className={cn(
      "rounded-2xl border p-4 space-y-3 transition-all duration-300",
      colors.bg, colors.border,
      isValidating && "opacity-60"
    )}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className={cn("h-4 w-4 shrink-0", colors.text)} />
          <span className={cn("text-sm font-semibold", colors.text)}>
            Section Quality
          </span>
          {isValidating && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Score badge */}
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", colors.bg, colors.text, colors.border)}>
            {colors.label}
          </span>
          <span className={cn("text-base font-black tabular-nums", colors.text)}>
            {score}
            <span className="text-xs font-semibold opacity-60">/100</span>
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="relative h-1.5 rounded-full bg-black/8 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: colors.bar }}
        />
      </div>

      {/* Word count vs ideal range */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className={cn("font-semibold", wordBadgeColor)}>{wordCount}</span>
          {" "}words{" "}
          <span className="opacity-60">
            · ideal {constraints.minWords}–{constraints.maxWords}
          </span>
        </span>

        {/* Visual range bar */}
        <div className="relative w-24 h-1 rounded-full bg-black/8 overflow-visible">
          {/* ideal zone */}
          <div
            className="absolute inset-y-0 rounded-full bg-emerald-400/30"
            style={{
              left:  `${(constraints.minWords / constraints.maxWords) * 100}%`,
              width: `${Math.max(0, Math.min(100, 100 - (constraints.minWords / constraints.maxWords) * 100))}%`,
            }}
          />
          {/* cursor dot */}
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full border-2 border-white shadow-sm transition-all duration-500",
              inRange ? "bg-emerald-500" : tooShort ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ left: `${Math.min(100, wordPct)}%` }}
          />
        </div>
      </div>

      {/* Constraint reason tooltip */}
      {constraints.reason && (
        <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed">
          {constraints.reason}
        </p>
      )}

      {/* Issues & suggestions (collapsible) */}
      {(issues.length > 0 || suggestions.length > 0) && (
        <div>
          <button
            onClick={() => setOpen((p) => !p)}
            className={cn(
              "flex items-center gap-1 text-xs font-medium transition-colors",
              colors.text, "opacity-80 hover:opacity-100"
            )}
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
            {issues.length} issue{issues.length !== 1 ? "s" : ""}
            {suggestions.length > 0 && ` · ${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""}`}
          </button>

          {open && (
            <div className="mt-2 space-y-2">
              {issues.length > 0 && (
                <ul className="space-y-1">
                  {issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500 mt-0.5" />
                      {issue}
                    </li>
                  ))}
                </ul>
              )}
              {suggestions.length > 0 && (
                <ul className="space-y-1 pt-1 border-t border-black/8">
                  {suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                      <Sparkles className="h-3 w-3 shrink-0 text-violet-400 mt-0.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CenterPanel — Editor ─────────────────────────────────────────────────────

function CenterPanel() {
  const dispatch            = useDispatch<AppDispatch>();
  const activeSection       = useSelector((s: RootState) => s.resumeBuilder.activeSection);
  const sections            = useSelector((s: RootState) => s.resumeBuilder.sections);
  const customDefs          = useSelector((s: RootState) => s.resumeBuilder.customSectionDefs);
  const isEnhancing         = useSelector((s: RootState) => s.resumeBuilder.isEnhancing);
  const aiSuggestion        = useSelector((s: RootState) => s.resumeBuilder.aiSuggestion);
  const fields              = useSelector((s: RootState) => s.resumeBuilder.fields);
  const aiEnhancedSections  = useSelector((s: RootState) => s.resumeBuilder.aiEnhancedSections);
  const sectionValidation   = useSelector((s: RootState) => s.resumeBuilder.sectionValidation);
  const jobTitle            = useSelector((s: RootState) => s.resumeBuilder.jobTitle);
  const company             = useSelector((s: RootState) => s.resumeBuilder.company);
  const { balance }         = useCreditsBalance();
  const { getToken }        = useAuth();

  const sectionMeta     = [...sections, ...customDefs].find((s) => s.id === activeSection);
  const Icon            = getSectionIcon(activeSection);
  const canAI           = AI_ENHANCEABLE.includes(activeSection);
  const credits         = balance ? parseFloat(balance.totalAvailable ?? "0") : null;
  const hasEnoughCredit = credits === null || credits >= AI_CREDIT_COST;

  const isAiEnhanced    = aiEnhancedSections.includes(activeSection);
  const sweepKey        = `${activeSection}-${isAiEnhanced}`;
  const quality         = sectionValidation[activeSection];

  /** Debounced validation — fires 1.5s after user stops typing or switches section. */
  const validateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fieldsSnapshot = JSON.stringify(fields);

  useEffect(() => {
    // Only validate AI-enhanceable sections (personalInfo has no free-text field to score)
    if (!canAI) return;
    const text = sectionAIText(activeSection, fields);
    if (!text || text.trim().length < 15) return;

    dispatch(setSectionValidating({ sectionId: activeSection, isValidating: true }));
    clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await fetch(ENDPOINTS.resumeBuilderValidateSection(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            sectionId: activeSection,
            currentText: text,
            jobTitle: jobTitle || undefined,
            company: company || undefined,
            resumeContext: fields.name ? `${fields.name}, ${fields.role}` : undefined,
          }),
        });
        if (!res.ok) throw new Error("Validation failed");
        const data = await res.json();
        dispatch(setSectionQuality({
          sectionId: activeSection,
          quality: {
            score:       data.score,
            status:      data.status,
            issues:      data.issues ?? [],
            suggestions: data.suggestions ?? [],
            constraints: data.constraints,
            wordCount:   data.wordCount,
          },
        }));
      } catch {
        dispatch(setSectionValidating({ sectionId: activeSection, isValidating: false }));
      }
    }, 1500);

    return () => clearTimeout(validateTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsSnapshot, activeSection]);

  const handleAIEnhance = useCallback(async () => {
    if (isEnhancing) return;
    dispatch(setIsEnhancing(true));
    try {
      const userId = localStorage.getItem("userId");
      const token = await getToken();
      const res = await fetch(ENDPOINTS.resumeBuilderEnhanceSection(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId,
          sectionId: activeSection,
          currentText: sectionAIText(activeSection, fields),
          resumeContext: fields.name ? `${fields.name}, ${fields.role}` : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enhancement failed");
      dispatch(setAiSuggestion({ sectionId: activeSection, suggestion: data.enhancedText }));
    } catch (err) {
      console.error("[AI Enhance]", err);
    } finally {
      dispatch(setIsEnhancing(false));
    }
  }, [dispatch, getToken, activeSection, fields, isEnhancing]);

  return (
    <main className="flex-1 overflow-y-auto bg-muted/20">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        {/* Section header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Icon — glows violet when this section has AI-generated content */}
            <div className={cn(
              "h-10 w-10 rounded-2xl border flex items-center justify-center shrink-0 transition-all duration-500",
              isAiEnhanced
                ? "bg-gradient-to-br from-violet-100 to-indigo-100 border-violet-200/60 ai-icon-glow"
                : "bg-[var(--color-brand)]/10 border-[var(--color-brand)]/20"
            )}>
              <Icon className={cn(
                "h-5 w-5 transition-colors duration-500",
                isAiEnhanced ? "text-violet-500" : "text-[var(--color-brand)]"
              )} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">{sectionMeta?.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                {canAI ? "AI-enhanced rewriting available" : "Edit your details below"}
                {isAiEnhanced && (
                  <span className="ai-enhanced-badge">✦ AI Enhanced</span>
                )}
              </p>
            </div>
          </div>

          {canAI && (
            <button
              onClick={handleAIEnhance}
              disabled={isEnhancing || !!aiSuggestion || !hasEnoughCredit}
              title={!hasEnoughCredit ? `Need ${AI_CREDIT_COST} credit` : `Uses ${AI_CREDIT_COST} credit`}
              className={cn(
                "flex items-center gap-2 px-4 h-9 rounded-xl text-sm font-semibold transition-all shrink-0",
                "bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white shadow-sm",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isEnhancing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />}
              {isEnhancing ? "Enhancing…" : "AI Enhance"}
              {!isEnhancing && (
                <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">
                  {AI_CREDIT_COST}cr
                </span>
              )}
            </button>
          )}
        </div>

        {/* Section-specific fields */}
        {isAiEnhanced ? (
          <div className="ai-gradient-border rounded-2xl p-[1.5px] shadow-sm">
            <div className="relative bg-background rounded-[14px] p-6 overflow-hidden">
              <div key={sweepKey} className="ai-sweep-container">
                <div className="ai-sweep-ray" />
              </div>
              <div className="relative z-10">
                <SectionEditorFields />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-background rounded-2xl border border-border p-6 shadow-sm">
            <SectionEditorFields />
          </div>
        )}

        {/* Quality meter — only for AI-enhanceable sections */}
        {canAI && <SectionQualityMeter quality={quality} />}

        {/* AI diff review panel */}
        <AiDiffPanel />
      </div>
    </main>
  );
}

// ─── CenterPanel — ATS Score ─────────────────────────────────────────────────

function ATSPanel() {
  const CHECKS = [
    { label: "Contact info present",       done: true  },
    { label: "Summary section filled",     done: true  },
    { label: "Measurable achievements",    done: false },
    { label: "Action verbs in experience", done: false },
    { label: "Keywords match job role",    done: false },
  ];
  const passed = CHECKS.filter((c) => c.done).length;
  const total  = CHECKS.length;
  const pct    = Math.round((passed / total) * 100);

  return (
    <main className="flex-1 overflow-y-auto bg-muted/20">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-100 border border-emerald-200/60 flex items-center justify-center shrink-0">
              <FileSearch className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">ATS Score</h2>
              <p className="text-xs text-muted-foreground">Applicant Tracking System analysis</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wide border border-emerald-200/60">Free</span>
        </div>

        {/* Score ring + CTA */}
        <div className="bg-background rounded-2xl border border-border p-6 flex items-center gap-8 shadow-sm">
          {/* SVG ring */}
          <div className="relative shrink-0">
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="36" fill="none" stroke="#e5e7eb" strokeWidth="8" />
              <circle
                cx="44" cy="44" r="36" fill="none"
                stroke="#10b981" strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - pct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 44 44)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-foreground leading-none">—</span>
              <span className="text-[10px] text-muted-foreground font-medium mt-0.5">score</span>
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Run a scan to find keywords, formatting issues, and quick wins to boost your match rate with ATS systems.
            </p>
            <button className="flex items-center gap-2 px-5 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm">
              <FileSearch className="h-3.5 w-3.5" /> Run ATS Scan
            </button>
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Resume Checklist — {passed}/{total} passed
            </span>
          </div>
          <div className="divide-y divide-border">
            {CHECKS.map((item) => (
              <div key={item.label} className="flex items-center gap-3.5 px-5 py-3.5">
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center shrink-0 border",
                  item.done
                    ? "bg-emerald-100 border-emerald-200 text-emerald-600"
                    : "bg-muted border-border text-muted-foreground/40"
                )}>
                  {item.done ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  item.done ? "text-foreground" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
                {item.done && (
                  <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Pass</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── CenterPanel — JD Tailor ─────────────────────────────────────────────────

function JDTailorPanel() {
  const jobDescription = useSelector((s: RootState) => s.resumeBuilder.jobDescription);
  const jobTitle       = useSelector((s: RootState) => s.resumeBuilder.jobTitle);
  const company        = useSelector((s: RootState) => s.resumeBuilder.company);
  const savedResumeId  = useSelector((s: RootState) => s.resumeBuilder.savedResumeId);
  const [jdText, setJdText] = React.useState(jobDescription);
  const [isTailoring, setIsTailoring] = React.useState(false);
  const [tailorError, setTailorError] = React.useState<string | null>(null);
  const [tailorSuccess, setTailorSuccess] = React.useState(false);
  const charCount = jdText.length;
  const { getToken } = useAuth();

  React.useEffect(() => { setJdText(jobDescription); }, [jobDescription]);

  const handleTailor = React.useCallback(async () => {
    if (isTailoring || charCount < 50) return;
    setIsTailoring(true);
    setTailorError(null);
    setTailorSuccess(false);
    try {
      const userId = localStorage.getItem("userId");
      const token = await getToken();
      const res = await fetch(ENDPOINTS.resumeBuilderTailor(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId,
          resumeId: savedResumeId,
          jobDescription: jdText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tailoring failed");
      setTailorSuccess(true);
    } catch (err) {
      setTailorError(err instanceof Error ? err.message : "Tailoring failed. Please try again.");
    } finally {
      setIsTailoring(false);
    }
  }, [isTailoring, charCount, getToken, savedResumeId, jdText]);

  return (
    <main className="flex-1 overflow-y-auto bg-muted/20">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-violet-100 border border-violet-200/60 flex items-center justify-center shrink-0">
            <Wand2 className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">JD Tailor</h2>
            <p className="text-xs text-muted-foreground">Rewrite your resume to match a specific job description</p>
          </div>
          <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200/60 uppercase tracking-wide">1 credit</span>
        </div>

        {/* Context card — pre-filled from wizard if available */}
        {(jobTitle || company) && (
          <div className="bg-background rounded-2xl border border-border px-5 py-4 flex items-center gap-4 shadow-sm">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Briefcase className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{jobTitle || "Role not set"}</p>
              <p className="text-xs text-muted-foreground truncate">{company || "Company not set"}</p>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md shrink-0">From wizard</span>
          </div>
        )}

        {/* JD input */}
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Job Description</span>
            <span className="text-[10px] text-muted-foreground">{charCount > 0 ? `${charCount} chars` : "Paste JD below"}</span>
          </div>
          <Textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full job description here. We'll analyse keywords, extract requirements, and rewrite your resume sections to maximise ATS match rate…"
            className="border-none rounded-none min-h-[220px] resize-none text-sm bg-background focus-visible:ring-0 focus-visible:ring-offset-0 px-5 py-4 placeholder:text-muted-foreground/40 leading-relaxed"
          />
        </div>

        {/* Action */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleTailor}
              disabled={charCount < 50 || isTailoring}
              className={cn(
                "flex items-center gap-2 px-6 h-10 rounded-xl text-sm font-semibold transition-all shadow-sm",
                charCount >= 50 && !isTailoring
                  ? "bg-violet-600 hover:bg-violet-700 text-white"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {isTailoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {isTailoring ? "Tailoring…" : "Tailor My Resume"}
            </button>
            {charCount > 0 && charCount < 50 && !isTailoring && (
              <p className="text-xs text-muted-foreground">
                Paste at least 50 characters to continue
              </p>
            )}
          </div>
          {tailorError && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{tailorError}
            </p>
          )}
          {tailorSuccess && (
            <p className="text-xs text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Resume tailored successfully!
            </p>
          )}
        </div>

        {/* How it works */}
        <div className="rounded-2xl border border-border bg-background p-5 space-y-3 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">How it works</p>
          <div className="space-y-2.5">
            {[
              { n: "1", text: "Paste the job description from any job board" },
              { n: "2", text: "AI extracts required skills, keywords, and tone" },
              { n: "3", text: "Your resume sections are rewritten to match" },
              { n: "4", text: "Review each change before applying — you stay in control" },
            ].map((step) => (
              <div key={step.n} className="flex items-start gap-3">
                <span className="text-[11px] font-black text-[var(--color-brand)] bg-[var(--color-brand-muted)] w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">{step.n}</span>
                <p className="text-sm text-muted-foreground leading-snug">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────

/** Scales the A4 iframe (794 × 1123 px) to fill the preview container.
 *
 * RAF throttling: ResizeObserver can fire many times per frame (e.g. on window
 * resize). We cancel any pending RAF before scheduling a new one so we process
 * at most one update per animation frame — this eliminates the "stutter"
 * caused by rapid consecutive React state updates.                (rerender-use-ref-transient-values)
 *
 * Guard: only calls setState when the scale changes by > 0.001 to avoid
 * unnecessary re-renders for sub-pixel width fluctuations.
 */
function useA4PreviewScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = React.useState(0.42);
  const rafRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const w = entry.contentRect.width;
        if (w > 0) {
          const next = w / 794;
          setScale((prev) => (Math.abs(prev - next) > 0.001 ? next : prev));
        }
      });
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [ref]);

  return scale;
}

// ─── TemplateMarketplace ───────────────────────────────────────────────────────

function TemplateMarketplace({
  templates,
  currentTemplateId,
  fields,
  onSelect,
  onClose,
}: {
  templates: TemplateItem[];
  currentTemplateId: string;
  fields: ResumeFields;
  onSelect: (id: string, code: string) => void;
  onClose: () => void;
}) {
  const data = fieldsToResumeData(fields);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">Choose Template</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Switch anytime — your content is preserved</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-6">
            {templates.map((tpl) => {
              // Determine if this template is the current one (match by id, name, or category)
              const tid = currentTemplateId?.toLowerCase();
              const isActive =
                tpl.id === currentTemplateId ||
                tpl.name.toLowerCase() === tid ||
                tpl.category.toLowerCase() === tid;

              // Render a tiny scaled iframe preview
              let previewHtml = "";
              try { previewHtml = populateTemplate(tpl.code, data, {}); } catch { /* ignore */ }

              return (
                <button
                  key={tpl.id}
                  onClick={() => { onSelect(tpl.id, tpl.code); onClose(); }}
                  className={cn(
                    "group relative flex flex-col rounded-2xl overflow-hidden border-2 transition-all text-left",
                    isActive
                      ? "border-[var(--color-brand)] shadow-[0_0_0_4px_var(--color-brand-muted)]"
                      : "border-border hover:border-[var(--color-brand)]/50 hover:shadow-md",
                  )}
                >
                  {/* Mini preview */}
                  <div className="relative bg-white overflow-hidden" style={{ height: 240 }}>
                    {previewHtml ? (
                      <iframe
                        srcDoc={previewHtml}
                        className="block border-none bg-white pointer-events-none"
                        style={{ width: 794, height: 1123, transform: "scale(0.302)", transformOrigin: "top left" }}
                        title={tpl.name}
                        sandbox=""
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted/30">
                        <FileText className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                    {isActive && (
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-[var(--color-brand)] flex items-center justify-center shadow-sm">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <div className={cn(
                    "px-4 py-3 border-t flex items-center justify-between",
                    isActive ? "bg-[var(--color-brand-muted)]/60 border-[var(--color-brand)]/20" : "bg-background border-border",
                  )}>
                    <span className={cn(
                      "text-sm font-semibold",
                      isActive ? "text-[var(--color-brand)]" : "text-foreground",
                    )}>
                      {tpl.name}
                    </span>
                    {isActive ? (
                      <span className="text-[10px] font-bold text-[var(--color-brand)] bg-[var(--color-brand-muted)] px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground group-hover:text-[var(--color-brand)] transition-colors">Apply →</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {templates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Loading templates…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────

function RightPanel({
  templateCode,
  currentTemplateName,
  onOpenMarketplace,
}: {
  templateCode: string;
  currentTemplateName: string;
  onOpenMarketplace: () => void;
}) {
  const dispatch   = useDispatch<AppDispatch>();
  const zoom       = useSelector((s: RootState) => s.resumeBuilder.zoom);
  const fields     = useSelector((s: RootState) => s.resumeBuilder.fields);

  // Defer the expensive template render so typing stays snappy.     (rerender-use-deferred-value)
  const deferredFields = useDeferredValue(fields);

  const [populatedHtml, setPopulatedHtml] = useState("");
  const populateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const baseScale = useA4PreviewScale(previewContainerRef);
  const finalScale = baseScale * zoom;
  const containerHeight = Math.round(1123 * finalScale);

  // Debounce template population by 400 ms
  useEffect(() => {
    if (!templateCode) return;
    clearTimeout(populateTimerRef.current);
    populateTimerRef.current = setTimeout(() => {
      try {
        setPopulatedHtml(
          populateTemplate(templateCode, fieldsToResumeData(deferredFields), {}),
        );
      } catch (err) {
        console.error("[RightPanel] populateTemplate error:", err);
      }
    }, 400);
    return () => clearTimeout(populateTimerRef.current);
  }, [deferredFields, templateCode]);

  const iframeTransformStyle: React.CSSProperties =
    Math.abs(finalScale - 1) < 0.005
      ? { width: 794, height: 1123 }
      : { width: 794, height: 1123, transform: `scale(${finalScale})`, transformOrigin: "top left" };

  const ZOOM_STEP = 0.1;

  return (
    <aside className="w-[360px] shrink-0 border-l border-border/40 bg-muted/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 shrink-0 space-y-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Preview</h3>

        {/* Template picker button */}
        <button
          onClick={onOpenMarketplace}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-background hover:bg-muted/50 hover:border-[var(--color-brand)]/40 transition-all text-left group"
        >
          <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[var(--color-brand)] shrink-0 transition-colors" />
          <span className="flex-1 text-sm font-medium text-foreground truncate">{currentTemplateName || "Classic"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[var(--color-brand)] shrink-0 transition-colors" />
        </button>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground w-10 shrink-0">{Math.round(zoom * 100)}%</span>
          <div className="flex items-center gap-0.5 ml-auto">
            <button onClick={() => dispatch(setZoom(Math.max(0.3, zoom - ZOOM_STEP)))} className="p-1 rounded hover:bg-muted" title="Zoom out"><ZoomOut className="h-3.5 w-3.5 text-muted-foreground" /></button>
            <button onClick={() => dispatch(setZoom(1))} className="p-1 rounded hover:bg-muted" title="Reset zoom"><RotateCcw className="h-3 w-3 text-muted-foreground" /></button>
            <button onClick={() => dispatch(setZoom(Math.min(2, zoom + ZOOM_STEP)))} className="p-1 rounded hover:bg-muted" title="Zoom in"><ZoomIn className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </div>
        </div>
      </div>

      {/* Preview scroll area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        <div
          ref={previewContainerRef}
          className="w-full bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.10)] border border-border/20 overflow-hidden"
          style={{ height: populatedHtml ? containerHeight : undefined, minHeight: populatedHtml ? undefined : 400 }}
        >
          {!populatedHtml ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3 p-6 text-center">
              <div className="h-10 w-10 rounded-xl bg-[var(--color-brand)]/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-[var(--color-brand)]/40" />
              </div>
              <p className="text-xs text-muted-foreground">
                {templateCode ? "Generating preview…" : "Fill in your details to see a live preview."}
              </p>
            </div>
          ) : (
            <iframe
              srcDoc={populatedHtml}
              className="block border-none bg-white"
              style={iframeTransformStyle}
              title="Resume Preview"
              sandbox=""
            />
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── BottomTabsBar ────────────────────────────────────────────────────────────

function BottomTabsBar() {
  const dispatch        = useDispatch<AppDispatch>();
  const navigate        = useNavigate();
  const activeBottomTab = useSelector((s: RootState) => s.resumeBuilder.activeBottomTab);

  const TABS: { id: BottomTab; label: string; badge?: string; isLink?: boolean }[] = [
    { id: "editor",      label: "Editor" },
    { id: "ats",         label: "ATS Score", badge: "FREE" },
    { id: "jdtailor",    label: "JD Tailor" },
    { id: "coverletter", label: "Cover Letter", isLink: true },
  ];

  return (
    <div className="flex items-center border-t border-border bg-background shrink-0 px-2 h-12">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => {
            if (tab.isLink) { navigate("/resume/cover-letter"); return; }
            dispatch(setActiveBottomTab(tab.id));
          }}
          className={cn(
            "flex items-center gap-1.5 px-4 h-full text-sm font-medium transition-all border-b-2 rounded-none relative",
            !tab.isLink && activeBottomTab === tab.id
              ? "border-[var(--color-brand)] text-[var(--color-brand)] font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
          )}
        >
          {tab.label}
          {tab.badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200/60 uppercase tracking-wide">{tab.badge}</span>
          )}
          {tab.isLink && <ExternalLink className="h-2.5 w-2.5 opacity-40 ml-0.5" />}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE ROOT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ResumeEditor() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const dispatch  = useDispatch<AppDispatch>();

  // ── Config resolution: navigation state first, sessionStorage fallback ─────
  // sessionStorage survives hard-refresh (tab stays open) but not new tabs.
  // This prevents the "shutter" caused by location.state being cleared on F5.
  const config = React.useMemo(() => {
    const fromNav = (location.state as any)?.config ?? null;
    if (fromNav) {
      try { sessionStorage.setItem(SESSION_CONFIG_KEY, JSON.stringify(fromNav)); } catch { /* private browsing */ }
      return fromNav;
    }
    try {
      const stored = sessionStorage.getItem(SESSION_CONFIG_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty         = useSelector((s: RootState) => s.resumeBuilder.isDirty);
  const fieldsKey       = useSelector((s: RootState) => JSON.stringify(s.resumeBuilder.fields));
  const resumeTitle     = useSelector((s: RootState) => s.resumeBuilder.resumeTitle);
  const activeBottomTab = useSelector((s: RootState) => s.resumeBuilder.activeBottomTab);
  const autoSaveEnabled = useSelector((s: RootState) => s.resumeBuilder.autoSaveEnabled);
  const savedResumeId   = useSelector((s: RootState) => s.resumeBuilder.savedResumeId);
  const fields          = useSelector((s: RootState) => s.resumeBuilder.fields);
  const sections        = useSelector((s: RootState) => s.resumeBuilder.sections);
  const templateId      = useSelector((s: RootState) => s.resumeBuilder.templateId);
  const jobDescription  = useSelector((s: RootState) => s.resumeBuilder.jobDescription);
  const jobTitle        = useSelector((s: RootState) => s.resumeBuilder.jobTitle);
  const company         = useSelector((s: RootState) => s.resumeBuilder.company);
  const { getToken }    = useAuth();

  const [templateCode, setTemplateCode] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [showTemplateMarket, setShowTemplateMarket] = useState(false);

  /** All templates fetched from the API, cached so switching is instant. */
  const allTemplatesRef = useRef<TemplateItem[]>([]);
  const [currentTemplateName, setCurrentTemplateName] = useState<string>("Classic");

  const saveTimerRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showSavingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDirtyRef      = useRef(isDirty);
  isDirtyRef.current    = isDirty;

  // ── Initialise Redux from config ──────────────────────────────────────────
  useEffect(() => {
    if (!config) { setIsInitialized(true); return; }
    const { title, fields: parsedFields } = configToFields(config);
    dispatch(initFromConfig({
      title:          config.resumeTitle || config.title || title,
      fields:         parsedFields,
      templateId:     config.templateId ?? "classic",
      lockedFields:   { name: true, email: true },
      jobDescription: config.jobDescription ?? "",
      jobTitle:       config.jobTitle ?? "",
      company:        config.company ?? "",
    }));
    if (config.resumeId) dispatch(setSavedResumeId(config.resumeId));

    // Always fetch all templates so the marketplace and template switching work
    const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "";
    fetch(`${backendUrl}/api/resume/all-templates`)
      .then((r) => r.json())
      .then((list: TemplateItem[]) => {
        if (!Array.isArray(list)) return;
        allTemplatesRef.current = list;
        const tid = (config.templateId ?? "classic").toLowerCase();
        const match =
          list.find((t) => t.id === config.templateId) ??
          list.find((t) => t.name.toLowerCase() === tid) ??
          list.find((t) => t.category.toLowerCase() === tid);
        if (match) {
          setCurrentTemplateName(match.name);
          if (config.templateCode) {
            // Config already has code (fresh load) — prefer that, but still
            // cache the code from API into allTemplatesRef for correct switching
            setTemplateCode(config.templateCode);
          } else {
            setTemplateCode(match.code);
          }
        } else if (config.templateCode) {
          setTemplateCode(config.templateCode);
        }
      })
      .catch(() => {
        // Fallback: if API fails and config has templateCode, use it
        if (config.templateCode) setTemplateCode(config.templateCode);
      })
      .finally(() => setIsInitialized(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Template switching — update templateCode when user picks a new template
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) { initializedRef.current = isInitialized; return; }
    if (!isInitialized) return;
    const list = allTemplatesRef.current;
    if (!list.length) return;
    const tid = templateId?.toLowerCase();
    const match =
      list.find((t) => t.id === templateId) ??
      list.find((t) => t.name.toLowerCase() === tid) ??
      list.find((t) => t.category.toLowerCase() === tid);
    if (match) {
      setTemplateCode(match.code);
      setCurrentTemplateName(match.name);
    }
  }, [templateId, isInitialized]);

  // ── Debounced auto-save ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDirtyRef.current || !autoSaveEnabled) return;

    clearTimeout(saveTimerRef.current);
    clearTimeout(showSavingTimer.current);

    showSavingTimer.current = setTimeout(async () => {
      if (!isDirtyRef.current) return;
      dispatch(setAutoSaveStatus("saving"));
      try {
        const token = await getToken();
        const res = await fetch(ENDPOINTS.resumeBuilderSave(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            userId: localStorage.getItem("userId"),
            resumeId: savedResumeId ?? null,
            title: resumeTitle,
            templateId,
            fields,
            sections,
            jobDescription,
            jobTitle,
            company,
            status: "draft",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
        if (!savedResumeId && data.id) dispatch(setSavedResumeId(data.id));
        dispatch(setAutoSaveStatus("saved"));
      } catch (err) {
        console.error("[AutoSave]", err);
        dispatch(setAutoSaveStatus("error"));
      }
    }, 2000);

    return () => {
      clearTimeout(saveTimerRef.current);
      clearTimeout(showSavingTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey, resumeTitle, autoSaveEnabled]);

  // ── Keyboard undo/redo ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); dispatch(undo()); }
      if (mod && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); dispatch(redo()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── No config fallback ─────────────────────────────────────────────────────
  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
        <AlertCircle className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-lg font-medium">No build configuration found.</p>
        <Button onClick={() => navigate("/resume/build")} variant="outline" className="rounded-xl px-8 h-11">
          Return to Builder
        </Button>
      </div>
    );
  }

  const handleTemplateSelect = (id: string, code: string) => {
    dispatch(setTemplate(id as TemplateId));
    setTemplateCode(code);
    const match = allTemplatesRef.current.find((t) => t.id === id);
    if (match) setCurrentTemplateName(match.name);
  };

  const centerContent = () => {
    switch (activeBottomTab) {
      case "ats":      return <ATSPanel />;
      case "jdtailor": return <JDTailorPanel />;
      default:         return <CenterPanel />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <TopBar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <LeftPanel />
        {centerContent()}
        <RightPanel
          templateCode={templateCode}
          currentTemplateName={currentTemplateName}
          onOpenMarketplace={() => setShowTemplateMarket(true)}
        />
      </div>
      <BottomTabsBar />

      {/* Template marketplace overlay */}
      {showTemplateMarket && (
        <TemplateMarketplace
          templates={allTemplatesRef.current}
          currentTemplateId={templateId}
          fields={fields}
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplateMarket(false)}
        />
      )}
    </div>
  );
}
