/**
 * Shared resume template utilities — used by both the resume editor preview
 * panel and the Build Resume card-grid preview dialog.
 *
 * Extracted from src/pages/Resume/ResumeEditor/page.tsx to avoid duplication.
 */

import type { ResumeFields } from "@/store/resumeBuilderSlice";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResumeData {
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
  experiences: Array<{ company: string; title: string; dates: string; points: string[] }>;
  projects: Array<{ title: string; points: string[] }>;
  education: Array<{ degree: string; institute: string; year: string }>;
  publication: string;
}

// ─── Text parsers ─────────────────────────────────────────────────────────────

export function parseProjectsText(text: string): Array<{ title: string; points: string[] }> {
  if (!text.trim()) return [];
  return text.split(/\n\n+/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim());
    return { title: lines[0] ?? "Project", points: lines.slice(1).map((l) => l.replace(/^[•\-*]\s*/, "")) };
  });
}

export function parseEducationText(text: string): Array<{ degree: string; institute: string; year: string }> {
  if (!text.trim()) return [];
  return text.split(/\n\n+/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim());
    return { degree: lines[0] ?? "", institute: lines[1] ?? "", year: lines[2] ?? "" };
  });
}

export function parseExperienceForTemplate(
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

// ─── fieldsToResumeData ───────────────────────────────────────────────────────

export function fieldsToResumeData(fields: ResumeFields): ResumeData {
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

// ─── Link parsing helpers ─────────────────────────────────────────────────────

function inferPlatformLabel(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("linkedin.com"))      return "LinkedIn";
  if (lower.includes("github.com"))        return "GitHub";
  if (lower.includes("leetcode.com"))      return "LeetCode";
  if (lower.includes("hackerrank.com"))    return "HackerRank";
  if (lower.includes("behance.net"))       return "Behance";
  if (lower.includes("dribbble.com"))      return "Dribbble";
  if (lower.includes("medium.com"))        return "Medium";
  if (lower.includes("codepen.io"))        return "CodePen";
  if (lower.includes("stackoverflow.com")) return "Stack Overflow";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "Twitter/X";
  if (lower.includes("dev.to"))            return "Dev.to";
  return "Portfolio";
}

function parseLinksString(raw: string): { label: string; url: string }[] {
  if (!raw.trim()) return [];
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const colonIdx = entry.indexOf(":");
      if (colonIdx > 0 && colonIdx < 25) {
        const label = entry.slice(0, colonIdx).trim();
        const rest  = entry.slice(colonIdx + 1).trim();
        if (!label.includes("/") && rest) {
          const url = rest.startsWith("http") ? rest : `https://${rest}`;
          return { label, url };
        }
      }
      const url = entry.startsWith("http") ? entry : `https://${entry}`;
      return { label: inferPlatformLabel(url), url };
    });
}

// ─── populateTemplate ─────────────────────────────────────────────────────────

/**
 * Stamp a resume HTML template string with field values from `data`.
 * Returns the fully populated outerHTML string.
 */
export function populateTemplate(
  html: string,
  data: ResumeData,
  options: Record<string, boolean>,
): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const optMap: Record<string, string> = {
    name:        "personalInfo",
    role:        "personalInfo",
    email:       "personalInfo",
    phone:       "personalInfo",
    links:       "personalInfo",
    summary:     "summary",
    languages:   "skills",
    frameworks:  "skills",
    database:    "skills",
    tools:       "skills",
    publication: "certifications",
  };

  doc.querySelectorAll("[data-field]").forEach((el) => {
    const f = el.getAttribute("data-field");
    if (!f) return;
    const v = data[f as keyof ResumeData];
    if (typeof v === "string") {
      if (f === "links") {
        const parsed = parseLinksString(v);
        if (parsed.length === 0) {
          el.textContent = "";
        } else {
          const isBlock = el.classList.contains("links-block") || el.closest(".sidebar") !== null;
          el.innerHTML = parsed.map(({ label, url }, i) => {
            const a = `<a href="${url}" style="color:inherit;text-decoration:none;">${label}</a>`;
            if (isBlock) return `<span style="display:block;margin-bottom:2px;">${a}</span>`;
            return (i > 0 ? " · " : "") + a;
          }).join("");
        }
        if (optMap[f] && options[optMap[f]] === false) (el as HTMLElement).style.display = "none";
        return;
      }
      el.textContent = v;
      if (optMap[f] && options[optMap[f]] === false) (el as HTMLElement).style.display = "none";
    }
  });

  doc.querySelectorAll("[data-list]").forEach((container) => {
    const listName = container.getAttribute("data-list");
    const listData = data[listName as keyof ResumeData];
    const listOptMap: Record<string, string> = { projects: "projects", education: "education" };
    if (listOptMap[listName ?? ""] && options[listOptMap[listName ?? ""]] === false) {
      (container as HTMLElement).style.display = "none";
      return;
    }
    if (!Array.isArray(listData) || !container.firstElementChild) return;
    const tpl = container.firstElementChild.cloneNode(true) as HTMLElement;
    container.innerHTML = "";
    (listData as Record<string, unknown>[]).forEach((item) => {
      const clone = tpl.cloneNode(true) as HTMLElement;
      Object.entries(item).forEach(([key, val]) => {
        clone.querySelectorAll(`[data-field="${key}"]`).forEach((el) => {
          el.textContent = val as string;
        });
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

  // Strip all <script> tags so sandboxed iframes (which lack allow-scripts)
  // don't emit "Blocked script execution in 'about:srcdoc'" console errors.
  // Resume templates render purely via CSS — no JS is needed.
  doc.querySelectorAll("script").forEach((s) => s.remove());

  return doc.documentElement.outerHTML;
}
