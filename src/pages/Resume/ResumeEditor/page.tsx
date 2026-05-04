import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
  setActiveBottomTab,
  initFromConfig,
} from "@/store/resumeBuilderSlice";
import type {
  SectionId,
  ResumeFields,
  TemplateId,
  BottomTab,
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
  projects: Array<{ title: string; points: string[] }>;
  education: Array<{ degree: string; institute: string; year: string }>;
  publication: string;
}

// ─── Section icon map ─────────────────────────────────────────────────────────

const SECTION_ICONS: Record<SectionId, React.ElementType> = {
  personalInfo:   User,
  summary:        FileText,
  experience:     Briefcase,
  skills:         Code2,
  projects:       FolderKanban,
  education:      GraduationCap,
  certifications: Award,
  publications:   BookOpen,
};

const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "modern",  label: "Modern"  },
  { id: "minimal", label: "Minimal" },
];

const AI_CREDIT_COST = 0.5;
const AI_ENHANCEABLE: SectionId[] = [
  "summary", "experience", "skills", "projects", "education",
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function sectionHasContent(id: SectionId, fields: ResumeFields): boolean {
  switch (id) {
    case "personalInfo":    return !!(fields.name || fields.email);
    case "summary":         return !!fields.summary;
    case "experience":      return !!fields.experience;
    case "skills":          return !!(fields.skillsLanguages || fields.skillsFrameworks || fields.skillsDatabases || fields.skillsTools);
    case "projects":        return !!fields.projects;
    case "education":       return !!fields.education;
    case "certifications":  return !!fields.certifications;
    case "publications":    return !!fields.publications;
  }
}

function sectionAIText(id: SectionId, fields: ResumeFields): string {
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
    projects: [], education: [], publication: "",
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
      projects: [], education: [], publication: "",
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
  const { balance }    = useCreditsBalance();
  const credits        = balance ? parseFloat(balance.totalAvailable ?? "0") : null;

  return (
    <header className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-background/90 backdrop-blur-md shrink-0 h-14">
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground rounded-lg h-8 px-2.5 shrink-0" onClick={() => navigate("/resume/build")}>
        <ChevronLeft className="h-4 w-4" /> Back
      </Button>
      <div className="h-5 w-px bg-border/60 shrink-0" />

      {/* Editable title */}
      <input
        value={resumeTitle}
        onChange={(e) => dispatch(setResumeTitle(e.target.value))}
        className="flex-1 min-w-0 max-w-[220px] text-sm font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-[var(--color-brand)]/40 rounded px-1 py-0.5 text-foreground"
        aria-label="Resume title"
      />
      <div className="h-5 w-px bg-border/60 shrink-0" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={past.length === 0} onClick={() => dispatch(undo())} title="Undo (Ctrl+Z)">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={future.length === 0} onClick={() => dispatch(redo())} title="Redo (Ctrl+Y)">
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Auto-save */}
      <div className="flex items-center gap-1.5 text-xs shrink-0 min-w-[70px]">
        {autoSaveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving…</span></>}
        {autoSaveStatus === "saved"  && <><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Saved</span></>}
        {autoSaveStatus === "error"  && <><AlertTriangle className="h-3 w-3 text-destructive" /><span className="text-destructive">Failed</span></>}
      </div>

      <div className="flex-1" />

      {/* Credit balance */}
      {credits !== null && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-xs font-semibold shrink-0">
          <Coins className="h-3 w-3 text-amber-500" />
          {isNaN(credits) ? "—" : credits.toFixed(0)} credits
        </div>
      )}

      <Button variant="outline" size="sm" className="rounded-lg gap-1.5 border-border/60 hover:bg-muted/30 font-medium h-8 shrink-0">
        <Download className="h-3.5 w-3.5" /> PDF
      </Button>
      <Button size="sm" className="rounded-lg gap-1.5 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-semibold shadow-sm px-4 h-8 shrink-0">
        <Save className="h-3.5 w-3.5" /> Save
      </Button>
    </header>
  );
}

// ─── LeftPanel ────────────────────────────────────────────────────────────────

function LeftPanel() {
  const dispatch      = useDispatch<AppDispatch>();
  const sections      = useSelector((s: RootState) => s.resumeBuilder.sections);
  const activeSection = useSelector((s: RootState) => s.resumeBuilder.activeSection);
  const fields        = useSelector((s: RootState) => s.resumeBuilder.fields);
  const [hovered, setHovered] = useState<SectionId | null>(null);

  const enabled  = sections.filter((s) => s.enabled);
  const disabled = sections.filter((s) => !s.enabled && !s.required);

  return (
    <aside className="w-[200px] shrink-0 border-r border-border/40 bg-muted/20 flex flex-col overflow-y-auto">
      <div className="px-3 pt-4 pb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Sections</p>
      </div>

      <nav className="flex-1 px-2 pb-4 space-y-0.5">
        {enabled.map((sec, idx) => {
          const Icon    = SECTION_ICONS[sec.id];
          const isActive = activeSection === sec.id;
          const hasCont  = sectionHasContent(sec.id, fields);
          const isHov    = hovered === sec.id;

          return (
            <div key={sec.id} className="relative" onMouseEnter={() => setHovered(sec.id)} onMouseLeave={() => setHovered(null)}>
              <button
                onClick={() => dispatch(setActiveSection(sec.id))}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer",
                  isActive
                    ? "bg-[var(--color-brand)] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                {/* Completion dot */}
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", hasCont ? isActive ? "bg-white" : "bg-emerald-500" : isActive ? "bg-white/30" : "bg-muted-foreground/20")} />
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate flex-1 text-left">{sec.label}</span>
                {sec.required && <Lock className={cn("h-2.5 w-2.5 shrink-0", isActive ? "text-white/50" : "text-muted-foreground/30")} />}
              </button>

              {/* Hover controls: reorder + toggle */}
              {isHov && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background/95 rounded-lg px-0.5 py-0.5 shadow border border-border/30 z-10">
                  <button onClick={(e) => { e.stopPropagation(); dispatch(moveSectionUp(sec.id)); }} disabled={idx === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30" title="Move up"><ChevronUp className="h-3 w-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); dispatch(moveSectionDown(sec.id)); }} disabled={idx === enabled.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30" title="Move down"><ChevronDown className="h-3 w-3" /></button>
                  {!sec.required && (
                    <button onClick={(e) => { e.stopPropagation(); dispatch(toggleSection(sec.id)); }} className="p-0.5 rounded hover:bg-red-50 text-red-400" title="Remove section"><X className="h-3 w-3" /></button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Add optional sections */}
      {disabled.length > 0 && (
        <div className="px-2 pb-4 border-t border-border/30 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-1 mb-1.5">Add section</p>
          {disabled.map((sec) => (
            <button key={sec.id} onClick={() => dispatch(toggleSection(sec.id))} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
              <Plus className="h-3 w-3 shrink-0" />
              {sec.label}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

// ─── SectionEditorFields ──────────────────────────────────────────────────────

function SectionEditorFields() {
  const dispatch      = useDispatch<AppDispatch>();
  const activeSection = useSelector((s: RootState) => s.resumeBuilder.activeSection);
  const fields        = useSelector((s: RootState) => s.resumeBuilder.fields);
  const lockedFields  = useSelector((s: RootState) => s.resumeBuilder.lockedFields);

  /** Generic field renderer — handles both Input and Textarea. */
  const Field = React.memo(function Field({
    label, fieldKey, placeholder, multiline = false, rows = 3, fullRow = false,
  }: {
    label: string; fieldKey: keyof ResumeFields;
    placeholder?: string; multiline?: boolean; rows?: number; fullRow?: boolean;
  }) {
    const isLocked = !!lockedFields[fieldKey];
    return (
      <div className={cn("space-y-1.5", fullRow && "col-span-2")}>
        <div className="flex items-center gap-1.5">
          {isLocked
            ? <Lock className="h-3 w-3 text-zinc-400 shrink-0" />
            : <Unlock className="h-3 w-3 text-zinc-300 shrink-0" />}
          <Label className={cn("text-sm font-medium", isLocked ? "text-muted-foreground" : "")}>
            {label}
          </Label>
          {isLocked && <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded font-medium">locked</span>}
        </div>
        {multiline ? (
          <Textarea
            value={fields[fieldKey]}
            onChange={(e) => dispatch(updateField({ field: fieldKey, value: e.target.value }))}
            placeholder={placeholder}
            disabled={isLocked}
            rows={rows}
            className={cn("resize-none text-sm leading-relaxed rounded-xl border-border/60 focus-visible:border-[var(--color-brand)] focus-visible:ring-[var(--color-brand)]/20", isLocked && "bg-muted/40 text-muted-foreground cursor-not-allowed")}
          />
        ) : (
          <Input
            value={fields[fieldKey]}
            onChange={(e) => dispatch(updateField({ field: fieldKey, value: e.target.value }))}
            placeholder={placeholder}
            disabled={isLocked}
            className={cn("rounded-xl border-border/60 h-10 focus-visible:border-[var(--color-brand)] focus-visible:ring-[var(--color-brand)]/20", isLocked && "bg-muted/40 text-muted-foreground cursor-not-allowed")}
          />
        )}
      </div>
    );
  });

  switch (activeSection) {
    case "personalInfo":
      return (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full Name" fieldKey="name" placeholder="Jane Smith" fullRow />
          <Field label="Professional Title" fieldKey="role" placeholder="Senior Software Engineer" fullRow />
          <Field label="Email" fieldKey="email" placeholder="jane@example.com" />
          <Field label="Phone" fieldKey="phone" placeholder="+1 (555) 000-0000" />
          <Field label="Location" fieldKey="location" placeholder="San Francisco, CA" />
          <Field label="Portfolio / Links" fieldKey="links" placeholder="github.com/jane | portfolio.dev" />
        </div>
      );
    case "summary":
      return <Field label="Professional Summary" fieldKey="summary" placeholder="Write a compelling 2–4 sentence summary of your professional background, key skills, and what you bring to the role..." multiline rows={7} />;
    case "experience":
      return <Field label="Work Experience" fieldKey="experience" placeholder={"Company Name | Job Title | Start – End\n• Achieved X by doing Y\n• Led initiative that reduced costs by N%\n\nAnother Company | Role | Dates\n• ..."} multiline rows={11} />;
    case "skills":
      return (
        <div className="space-y-4">
          <Field label="Languages" fieldKey="skillsLanguages" placeholder="Python, TypeScript, Go" />
          <Field label="Frameworks & Libraries" fieldKey="skillsFrameworks" placeholder="React, Node.js, FastAPI, Django" />
          <Field label="Databases" fieldKey="skillsDatabases" placeholder="PostgreSQL, MongoDB, Redis" />
          <Field label="Tools & Platforms" fieldKey="skillsTools" placeholder="Docker, Kubernetes, AWS, CI/CD" />
        </div>
      );
    case "projects":
      return <Field label="Projects" fieldKey="projects" placeholder={"Project Title\n• Built X using Y, achieving Z\n• Reduced latency by N%\n\nAnother Project\n• ..."} multiline rows={10} />;
    case "education":
      return <Field label="Education" fieldKey="education" placeholder={"BSc Computer Science\nMIT — Massachusetts Institute of Technology\n2019 – 2023\n\nCertificate in ML\nCoursera / Stanford\n2022"} multiline rows={7} />;
    case "certifications":
      return <Field label="Certifications" fieldKey="certifications" placeholder={"AWS Solutions Architect – Associate (2023)\nGoogle Cloud Professional Data Engineer (2022)"} multiline rows={6} />;
    case "publications":
      return <Field label="Publications" fieldKey="publications" placeholder={"Smith, J. et al. (2023). Title. Journal Name, Vol(Issue), pp.\nDOI: https://doi.org/..."} multiline rows={6} />;
    default:
      return null;
  }
}

// ─── AiDiffPanel ─────────────────────────────────────────────────────────────

function AiDiffPanel() {
  const dispatch     = useDispatch<AppDispatch>();
  const aiSuggestion = useSelector((s: RootState) => s.resumeBuilder.aiSuggestion);
  const aiSectionId  = useSelector((s: RootState) => s.resumeBuilder.aiSectionId);
  const fields       = useSelector((s: RootState) => s.resumeBuilder.fields);

  if (!aiSuggestion || !aiSectionId) return null;

  const currentText = sectionAIText(aiSectionId, fields);

  return (
    <div className="rounded-2xl border border-border/60 bg-background shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--color-brand)]" />
          <span className="font-bold text-sm">Review AI Enhancement</span>
        </div>
        <button onClick={() => dispatch(discardAiSuggestion())} className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border/40 max-h-48 overflow-auto">
        <div className="p-4 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current</span>
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">{currentText || "(empty)"}</p>
        </div>
        <div className="p-4 space-y-2 bg-violet-50/40 dark:bg-violet-950/20">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand)]">AI Enhanced</span>
          <p className="text-xs leading-relaxed whitespace-pre-line">{aiSuggestion}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2.5 px-5 py-3 border-t border-border/40 bg-muted/20">
        <Button onClick={() => dispatch(applyAiSuggestion())} size="sm" className="rounded-xl gap-1.5 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-semibold px-5 h-8">
          <Check className="h-3.5 w-3.5" /> Apply Changes
        </Button>
        <Button variant="outline" size="sm" onClick={() => dispatch(discardAiSuggestion())} className="rounded-xl gap-1.5 font-semibold px-5 h-8 border-border/60">
          <X className="h-3.5 w-3.5" /> Discard
        </Button>
      </div>
    </div>
  );
}

// ─── CenterPanel — Editor ─────────────────────────────────────────────────────

function CenterPanel() {
  const dispatch      = useDispatch<AppDispatch>();
  const activeSection = useSelector((s: RootState) => s.resumeBuilder.activeSection);
  const sections      = useSelector((s: RootState) => s.resumeBuilder.sections);
  const isEnhancing   = useSelector((s: RootState) => s.resumeBuilder.isEnhancing);
  const aiSuggestion  = useSelector((s: RootState) => s.resumeBuilder.aiSuggestion);
  const fields        = useSelector((s: RootState) => s.resumeBuilder.fields);
  const { balance }   = useCreditsBalance();

  const sectionMeta     = sections.find((s) => s.id === activeSection);
  const Icon            = SECTION_ICONS[activeSection];
  const canAI           = AI_ENHANCEABLE.includes(activeSection);
  const credits         = balance ? parseFloat(balance.totalAvailable ?? "0") : null;
  const hasEnoughCredit = credits === null || credits >= AI_CREDIT_COST;

  const handleAIEnhance = () => {
    if (isEnhancing) return;
    dispatch(setIsEnhancing(true));
    setTimeout(() => {
      const enhanced = mockAIEnhance(activeSection, sectionAIText(activeSection, fields));
      dispatch(setAiSuggestion({ sectionId: activeSection, suggestion: enhanced }));
      dispatch(setIsEnhancing(false));
    }, 1200);
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-6 space-y-6">
        {/* Section header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-[var(--color-brand)]/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-[var(--color-brand)]" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">{sectionMeta?.label}</h2>
            </div>
            <p className="text-xs text-muted-foreground pl-[42px]">
              Edit your {sectionMeta?.label?.toLowerCase()} section below.
              {canAI && " Use AI Enhance to rewrite it automatically."}
            </p>
          </div>

          {canAI && (
            <Button
              onClick={handleAIEnhance}
              disabled={isEnhancing || !!aiSuggestion || !hasEnoughCredit}
              size="sm"
              title={!hasEnoughCredit ? `Need ${AI_CREDIT_COST} credit` : `Uses ${AI_CREDIT_COST} credit`}
              className="rounded-xl gap-1.5 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-semibold shadow-sm px-4 h-9 shrink-0"
            >
              {isEnhancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isEnhancing ? "Enhancing…" : "AI Enhance"}
              {!isEnhancing && (
                <span className="ml-0.5 text-[10px] font-bold opacity-70 bg-white/20 px-1.5 py-0.5 rounded-full">
                  {AI_CREDIT_COST}cr
                </span>
              )}
            </Button>
          )}
        </div>

        {/* Section-specific fields */}
        <SectionEditorFields />

        {/* AI diff review panel */}
        <AiDiffPanel />
      </div>
    </main>
  );
}

// ─── CenterPanel — ATS Score ─────────────────────────────────────────────────

function ATSPanel() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <FileSearch className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">ATS Score</h2>
            <p className="text-xs text-muted-foreground">Free — no credits required</p>
          </div>
          <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase">FREE</span>
        </div>

        <div className="rounded-2xl border border-border/40 bg-muted/20 p-8 flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full border-8 border-emerald-200 flex items-center justify-center">
            <span className="text-3xl font-black text-emerald-600">—</span>
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Save your resume and run an ATS scan. We'll surface quick wins to improve your match rate.
          </p>
          <Button className="rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 h-9">
            <FileSearch className="h-3.5 w-3.5" /> Run ATS Check
          </Button>
        </div>

        <div className="space-y-2">
          {[
            { label: "Contact info present",       done: true  },
            { label: "Summary section",            done: true  },
            { label: "Measurable achievements",    done: false },
            { label: "Action verbs in experience", done: false },
            { label: "Keywords match job role",    done: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 px-1 py-1">
              <div className={cn("h-5 w-5 rounded-full flex items-center justify-center shrink-0", item.done ? "bg-emerald-100" : "bg-muted")}>
                {item.done ? <Check className="h-3 w-3 text-emerald-600" /> : <Clock className="h-3 w-3 text-muted-foreground" />}
              </div>
              <span className={cn("text-sm", item.done ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// ─── CenterPanel — JD Tailor ─────────────────────────────────────────────────

function JDTailorPanel() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <Wand2 className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">JD Tailor</h2>
            <p className="text-xs text-muted-foreground">Optimise your resume for a specific job description</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Paste Job Description</Label>
          <Textarea
            placeholder="Paste the full job description here. We'll analyse keywords and tailor your resume to maximise the match score…"
            className="min-h-[200px] resize-none rounded-xl border-border/60 text-sm"
          />
        </div>
        <Button className="rounded-xl gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 h-9">
          <Wand2 className="h-3.5 w-3.5" /> Tailor Resume — 1 credit
        </Button>
      </div>
    </main>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────

function RightPanel({ templateCode }: { templateCode: string }) {
  const dispatch   = useDispatch<AppDispatch>();
  const templateId = useSelector((s: RootState) => s.resumeBuilder.templateId);
  const zoom       = useSelector((s: RootState) => s.resumeBuilder.zoom);
  const fields     = useSelector((s: RootState) => s.resumeBuilder.fields);

  const [populatedHtml, setPopulatedHtml] = useState("");

  useEffect(() => {
    if (!templateCode) return;
    try {
      setPopulatedHtml(populateTemplate(templateCode, fieldsToResumeData(fields), {}));
    } catch (err) {
      console.error("[RightPanel] populateTemplate error:", err);
    }
  }, [fields, templateCode]);

  const ZOOM_STEP = 0.1;

  return (
    <aside className="w-[300px] shrink-0 border-l border-border/40 bg-muted/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 shrink-0 space-y-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Preview</h3>

        {/* Template dropdown */}
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <select
            value={templateId}
            onChange={(e) => dispatch(setTemplate(e.target.value as TemplateId))}
            className="flex-1 text-xs rounded-lg border border-border/60 bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/40 appearance-auto"
          >
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground w-10 shrink-0">{Math.round(zoom * 100)}%</span>
          <div className="flex items-center gap-0.5 ml-auto">
            <button onClick={() => dispatch(setZoom(zoom - ZOOM_STEP))} className="p-1 rounded hover:bg-muted" title="Zoom out"><ZoomOut className="h-3.5 w-3.5 text-muted-foreground" /></button>
            <button onClick={() => dispatch(setZoom(1))} className="p-1 rounded hover:bg-muted" title="Reset zoom"><RotateCcw className="h-3 w-3 text-muted-foreground" /></button>
            <button onClick={() => dispatch(setZoom(zoom + ZOOM_STEP))} className="p-1 rounded hover:bg-muted" title="Zoom in"><ZoomIn className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto p-3">
        <div
          className="bg-white dark:bg-zinc-900 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-border/20 overflow-hidden"
          style={{ minHeight: Math.round(600 * zoom) }}
        >
          {!populatedHtml ? (
            <div className="flex flex-col items-center justify-center min-h-[350px] gap-3 p-6 text-center">
              <div className="h-10 w-10 rounded-xl bg-[var(--color-brand)]/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-[var(--color-brand)]/40" />
              </div>
              <p className="text-xs text-muted-foreground">
                {templateCode ? "Generating preview…" : "Fill in your details to see a live preview."}
              </p>
            </div>
          ) : (
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: `${(100 / zoom).toFixed(1)}%` }}>
              <iframe
                srcDoc={populatedHtml}
                className="w-full border-none bg-white"
                style={{ height: Math.max(600, Math.round(700 / zoom)) }}
                title="Resume Preview"
                sandbox="allow-scripts"
              />
            </div>
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
    <div className="flex items-center border-t border-border/40 bg-background/90 shrink-0 px-4 h-11">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => {
            if (tab.isLink) { navigate("/resume/cover-letter"); return; }
            dispatch(setActiveBottomTab(tab.id));
          }}
          className={cn(
            "flex items-center gap-1.5 px-4 h-full text-xs font-semibold transition-all border-b-2",
            !tab.isLink && activeBottomTab === tab.id
              ? "border-[var(--color-brand)] text-[var(--color-brand)]"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {tab.badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase">{tab.badge}</span>
          )}
          {tab.isLink && <ExternalLink className="h-2.5 w-2.5 opacity-40" />}
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config    = (location.state as any)?.config;

  const isDirty         = useSelector((s: RootState) => s.resumeBuilder.isDirty);
  const fields          = useSelector((s: RootState) => s.resumeBuilder.fields);
  const activeBottomTab = useSelector((s: RootState) => s.resumeBuilder.activeBottomTab);

  const [templateCode, setTemplateCode] = useState<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Initialise Redux from route config ────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    const { title, fields: parsedFields } = configToFields(config);
    dispatch(initFromConfig({ title, fields: parsedFields, templateId: "classic", lockedFields: { name: true, email: true } }));
    if (config.templateCode) setTemplateCode(config.templateCode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced auto-save simulation ────────────────────────────────────────
  useEffect(() => {
    if (!isDirty) return;
    clearTimeout(saveTimerRef.current);
    dispatch(setAutoSaveStatus("saving"));
    saveTimerRef.current = setTimeout(() => dispatch(setAutoSaveStatus("saved")), 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const centerContent = () => {
    switch (activeBottomTab) {
      case "ats":      return <ATSPanel />;
      case "jdtailor": return <JDTailorPanel />;
      default:         return <CenterPanel />;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel />
        {centerContent()}
        <RightPanel templateCode={templateCode} />
      </div>
      <BottomTabsBar />
    </div>
  );
}
