# Resume Builder Wizard — Feature Requirements

**Document created:** 4 May 2026  
**Status:** PLANNING  
**Owner:** Engineering

---

## 1. Goal

Redesign the "Build Resume" wizard (the `BuildResumeDialog` modal) to follow a new, richer 4-step flow that collects everything needed before entering the `ResumeEditor`:

```
Step 1 – Source Selection   →   Step 2 – JD Input (optional)   →   Step 3 – Template Picker   →   Step 4 – Processing
```

---

## 2. User Flow (Step-by-Step)

### Step 1 — Source Selection (EXISTING, minor update)

User picks **one** of:

| Choice | Label | Description |
|--------|-------|-------------|
| A | Use Existing Resume | Select from uploaded resumes; AI extracts structured data (2 credits) |
| B | Start from Scratch | No resume; AI generates a baseline from the JD / job role provided in Step 2 |

**Changes from current:**
- Remove the separate `ManualEntryStep` (Step 2 in old flow). The "manual entry" path is replaced by "Start from Scratch" which feeds into the new JD step.
- Keep `ExtractionStep` for the "existing resume" path (select resume + field checkboxes).

---

### Step 2 — Job Description / Target Role (NEW, optional)

Shown after Step 1 regardless of source path.

| Element | Details |
|---------|---------|
| **JD textarea** | Paste full job description (optional). Placeholder: *"Paste the job description you're targeting to unlock AI tailoring…"* |
| **OR simple fields** | If user doesn't have a JD, show two inputs: **Job Title** and **Company** (both optional) |
| **Skip option** | Prominent "Skip" link/button to bypass this step entirely |
| **Credit badge** | If JD is provided → label shows "+AI Tailoring ready" badge (no extra credit consumed at wizard stage; JD Tailor tab inside editor charges 4 credits separately) |
| **Character count** | Show live char count on textarea; max 4,000 chars |

**Why optional:** Users building a general-purpose resume shouldn't be forced to provide a JD.

---

### Step 3 — Template Selection (EXISTING, re-enabled + improved)

Re-enable the commented-out `TemplateSelectionStep` with these enhancements:

| Element | Details |
|---------|---------|
| **Template grid** | 2-column grid of template cards; thumbnail + category label + template name |
| **Live preview on hover** | Hovering a card shows a small iframe preview of the template with placeholder data |
| **Selected state** | Border highlight + checkmark badge (already implemented) |
| **Fetch from API** | `GET /api/resume/all-templates` (already implemented in `TemplateSelectionStep.tsx`) |
| **Require selection** | "Next" button disabled until a template is chosen |
| **Credit note** | Footer note: *"Applying a template costs 1 credit. Switching templates in the editor is free."* |

---

### Step 4 — Processing (EXISTING, keep as-is)

Animated "Crafting Your Resume" screen (current `ProcessingStep` component).

After 3 seconds: close dialog → navigate to `/resume/editor` with `location.state.config`:

```ts
{
  sourceType: "resume" | "scratch",
  resumeId?: string,
  resumeContext?: string,      // raw text from selected resume
  extractionOptions?: Record<string, boolean>,
  jobDescription?: string,     // from Step 2 (may be empty)
  jobTitle?: string,           // from Step 2 simple fields
  company?: string,            // from Step 2 simple fields
  templateId: string,          // from Step 3 (required)
  templateCode: string,        // from Step 3 (required)
  resumeTitle: string,         // auto-generated: "<Job Title> at <Company>" or "My Resume"
}
```

---

## 3. Step Count & Progress Indicator

| Step | Path A (Existing Resume) | Path B (Scratch) |
|------|--------------------------|------------------|
| 1 | Source Selection | Source Selection |
| 2 | Extract Fields (existing) | — (skip extract) |
| 3 | JD / Target Role (optional) | JD / Target Role (optional) |
| 4 | Template Selection | Template Selection |
| 5 | Processing | Processing |

Progress bar dots should reflect the actual number of steps for the chosen path.

---

## 4. Credit Costs (Wizard Stage Only)

| Action | Credits |
|--------|---------|
| Parse uploaded resume (Step 1 → Extract) | **2** |
| Template applied (Step 3 selection → editor) | **1** |
| Start from Scratch (no existing resume) | **0** |

> Credits for AI Enhance, JD Tailor, etc. are charged inside the editor, not the wizard.

---

## 5. State Shape (Dialog Local State)

```ts
// All lives in BuildResumeDialog component (no Redux needed for wizard)
interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  sourceType: "resume" | "scratch" | null;
  // Step 2 — Extraction (path A only)
  selectedResume: Resume | null;
  extractionOptions: Record<string, boolean>;
  // Step 3 — JD
  jobDescription: string;
  jobTitle: string;
  company: string;
  // Step 4 — Template
  selectedTemplate: Template | null;
}
```

---

## 6. Files to Create / Modify

| File | Action | Notes |
|------|--------|-------|
| `src/components/Resume/BuildResume/JDStep.tsx` | **CREATE** | New step component for JD input |
| `src/components/Resume/BuildResumeDialog.tsx` | **MODIFY** | Re-wire step order; add JD step; re-enable TemplateSelectionStep; update config passed to navigate |
| `src/components/Resume/BuildResume/TemplateSelectionStep.tsx` | **MODIFY** | Add hover preview; add credit footer note |
| `src/components/Resume/BuildResume/SourceSelectionStep.tsx` | **MODIFY** | Rename "Manual Entry" option to "Start from Scratch" |
| `src/pages/Resume/ResumeEditor/page.tsx` | **MODIFY** | Handle new `jobDescription`, `jobTitle`, `company` fields from config; pre-populate `JDTailorPanel` textarea; set `resumeTitle` from config |
| `src/store/resumeBuilderSlice.ts` | **MODIFY** | Add `jobDescription`, `jobTitle`, `company` to `initFromConfig` payload and slice state |

---

## 7. UX Rules & Constraints

1. **Dialog max-width stays `sm:max-w-2xl`** — no layout change to the modal shell.
2. **Extraction step only shown for path A** — path B skips straight from Source → JD step.
3. **JD step is always skippable** — never block the user; a "Skip →" text button in the footer.
4. **Template selection is required** — "Next" is disabled until a template card is clicked.
5. **Auto-generate `resumeTitle`** — if `jobTitle` and `company` are provided: `"{jobTitle} – {company}"`, else `"My Resume"`.
6. **No new npm packages** — use existing UI primitives (shadcn Textarea, Button, Badge, etc.).
7. **JD textarea max 4,000 chars** — enforce with `maxLength` + live counter.
8. **Hover preview in TemplateSelectionStep** — use `<iframe srcDoc={tpl.code}>` scaled to fit the card thumbnail area.
9. **Credits guard** — before navigating to editor, check user has ≥ 1 credit (template apply). If not, show `OutOfCreditsDialog`.

---

## 8. Implementation Order (Systematic)

- [ ] **8.1** Create `JDStep.tsx` component
- [ ] **8.2** Update `SourceSelectionStep.tsx` — rename "Manual Entry" to "Start from Scratch"
- [ ] **8.3** Update `TemplateSelectionStep.tsx` — hover iframe preview + credit footer
- [ ] **8.4** Rewrite `BuildResumeDialog.tsx` — new step machine, new config payload
- [ ] **8.5** Update `resumeBuilderSlice.ts` — add `jobDescription`, `jobTitle`, `company` fields
- [ ] **8.6** Update `ResumeEditor/page.tsx` — consume new config fields (JD panel pre-fill, title auto-set)
- [ ] **8.7** Verify TS errors are zero
- [ ] **8.8** Smoke test full wizard flow end-to-end (manual)

---

## 9. Open Questions

| # | Question | Answer |
|---|----------|--------|
| Q1 | Should the wizard block if the user has 0 credits? | Yes — show `OutOfCreditsDialog` before Step 4 processing if balance < 1 |
| Q2 | Where does the template "apply cost" of 1 credit get deducted? | TBD — backend API on template apply, or at editor save. Wizard just collects selection. |
| Q3 | Does "Start from Scratch" need AI generation on the backend? | No for MVP — create empty fields, pre-fill `summary` placeholder from JD if provided |
| Q4 | Does the template hover preview need auth? | No — templates are public HTML |

---

## 10. Acceptance Criteria

- [ ] Wizard has 4 steps (Source → Extract [path A only] → JD → Template → Processing)
- [ ] JD step has textarea (max 4k chars), simple job title + company fields, and a visible "Skip" button
- [ ] Template step is required (Next disabled without selection)
- [ ] Template cards show iframe hover preview
- [ ] Config passed to `/resume/editor` includes `jobDescription`, `jobTitle`, `company`, `templateId`, `templateCode`
- [ ] ResumeEditor `JDTailorPanel` textarea is pre-filled with `jobDescription` from config
- [ ] Resume title defaults to `"{jobTitle} – {company}"` when both are provided
- [ ] Zero TypeScript errors after implementation
- [ ] No new npm packages added
