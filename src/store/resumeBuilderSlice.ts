import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectionId =
  | "personalInfo"
  | "summary"
  | "experience"
  | "skills"
  | "projects"
  | "education"
  | "certifications"
  | "publications";

export interface SectionDef {
  id: SectionId;
  label: string;
  required: boolean; // if true, cannot be removed
  enabled: boolean;  // whether it's shown in the list
}

/** Flat record of every editable field in the resume. */
export interface ResumeFields {
  // Personal Info
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  links: string;
  // Summary
  summary: string;
  // Work Experience (raw multiline text)
  experience: string;
  // Skills
  skillsLanguages: string;
  skillsFrameworks: string;
  skillsDatabases: string;
  skillsTools: string;
  // Projects (raw multiline – blocks separated by double newline)
  projects: string;
  // Education (raw multiline)
  education: string;
  // Optional sections
  certifications: string;
  publications: string;
}

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";
export type BottomTab = "editor" | "ats" | "jdtailor" | "coverletter";
export type TemplateId = "classic" | "modern" | "minimal";

export interface ResumeBuilderState {
  resumeTitle: string;
  templateId: TemplateId;
  zoom: number;
  activeSection: SectionId;
  sections: SectionDef[];
  fields: ResumeFields;
  /** Fields that are read-only (rendered with a lock icon + disabled input). */
  lockedFields: Partial<Record<keyof ResumeFields, boolean>>;
  // AI Enhance
  aiSuggestion: string | null;
  aiSectionId: SectionId | null;
  isEnhancing: boolean;
  // Undo / Redo history (stores snapshots of `fields`)
  past: ResumeFields[];
  future: ResumeFields[];
  // Persistence
  autoSaveStatus: AutoSaveStatus;
  isDirty: boolean;
  // Bottom tab mode
  activeBottomTab: BottomTab;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY = 20;

export const DEFAULT_SECTIONS: SectionDef[] = [
  { id: "personalInfo",  label: "Personal Info",   required: true,  enabled: true  },
  { id: "summary",       label: "Summary",          required: true,  enabled: true  },
  { id: "experience",    label: "Work Experience",  required: true,  enabled: true  },
  { id: "skills",        label: "Skills",           required: true,  enabled: true  },
  { id: "projects",      label: "Projects",         required: false, enabled: true  },
  { id: "education",     label: "Education",        required: true,  enabled: true  },
  { id: "certifications",label: "Certifications",   required: false, enabled: false },
  { id: "publications",  label: "Publications",     required: false, enabled: false },
];

export const EMPTY_FIELDS: ResumeFields = {
  name: "",
  role: "",
  email: "",
  phone: "",
  location: "",
  links: "",
  summary: "",
  experience: "",
  skillsLanguages: "",
  skillsFrameworks: "",
  skillsDatabases: "",
  skillsTools: "",
  projects: "",
  education: "",
  certifications: "",
  publications: "",
};

const initialState: ResumeBuilderState = {
  resumeTitle: "My Resume",
  templateId: "classic",
  zoom: 1,
  activeSection: "personalInfo",
  sections: DEFAULT_SECTIONS,
  fields: EMPTY_FIELDS,
  lockedFields: { name: true, email: true },
  aiSuggestion: null,
  aiSectionId: null,
  isEnhancing: false,
  past: [],
  future: [],
  autoSaveStatus: "idle",
  isDirty: false,
  activeBottomTab: "editor",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Push current fields to the undo stack and clear redo. */
function pushHistory(state: ResumeBuilderState) {
  state.past = [...state.past.slice(-MAX_HISTORY + 1), { ...state.fields }];
  state.future = [];
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const resumeBuilderSlice = createSlice({
  name: "resumeBuilder",
  initialState,
  reducers: {
    /** Rename the resume. */
    setResumeTitle(state, action: PayloadAction<string>) {
      state.resumeTitle = action.payload;
      state.isDirty = true;
    },

    /** Switch the active template. */
    setTemplate(state, action: PayloadAction<TemplateId>) {
      state.templateId = action.payload;
      state.isDirty = true;
    },

    /** Zoom the live preview (clamped 0.5 – 2.0). */
    setZoom(state, action: PayloadAction<number>) {
      state.zoom = Math.max(0.5, Math.min(2, +action.payload.toFixed(2)));
    },

    /** Switch which section is being edited in the centre panel. */
    setActiveSection(state, action: PayloadAction<SectionId>) {
      state.activeSection = action.payload;
      state.aiSuggestion = null;
      state.aiSectionId = null;
    },

    /** Enable or disable an optional section. */
    toggleSection(state, action: PayloadAction<SectionId>) {
      const sec = state.sections.find((s) => s.id === action.payload);
      if (!sec || sec.required) return;
      sec.enabled = !sec.enabled;
      // If we just disabled the currently-active section, fall back to first enabled.
      if (!sec.enabled && state.activeSection === action.payload) {
        const first = state.sections.find((s) => s.enabled);
        if (first) state.activeSection = first.id;
      }
      state.isDirty = true;
    },

    /** Reorder sections: move one slot up. */
    moveSectionUp(state, action: PayloadAction<SectionId>) {
      const idx = state.sections.findIndex((s) => s.id === action.payload);
      if (idx > 0) {
        const temp = state.sections[idx - 1];
        state.sections[idx - 1] = state.sections[idx];
        state.sections[idx] = temp;
      }
    },

    /** Reorder sections: move one slot down. */
    moveSectionDown(state, action: PayloadAction<SectionId>) {
      const idx = state.sections.findIndex((s) => s.id === action.payload);
      if (idx < state.sections.length - 1) {
        const temp = state.sections[idx + 1];
        state.sections[idx + 1] = state.sections[idx];
        state.sections[idx] = temp;
      }
    },

    /** Update a single field value (locked fields are silently ignored). */
    updateField(
      state,
      action: PayloadAction<{ field: keyof ResumeFields; value: string }>,
    ) {
      const { field, value } = action.payload;
      if (state.lockedFields[field]) return;
      pushHistory(state);
      state.fields[field] = value;
      state.isDirty = true;
    },

    /** Set the AI suggestion result for a section. */
    setAiSuggestion(
      state,
      action: PayloadAction<{ sectionId: SectionId; suggestion: string } | null>,
    ) {
      if (action.payload) {
        state.aiSuggestion = action.payload.suggestion;
        state.aiSectionId = action.payload.sectionId;
      } else {
        state.aiSuggestion = null;
        state.aiSectionId = null;
      }
    },

    setIsEnhancing(state, action: PayloadAction<boolean>) {
      state.isEnhancing = action.payload;
    },

    /** Apply the current AI suggestion to the fields. */
    applyAiSuggestion(state) {
      if (!state.aiSuggestion || !state.aiSectionId) return;
      pushHistory(state);
      switch (state.aiSectionId) {
        case "summary":
          state.fields.summary = state.aiSuggestion;
          break;
        case "experience":
          state.fields.experience = state.aiSuggestion;
          break;
        case "skills": {
          const lines = state.aiSuggestion.split("\n").filter(Boolean);
          if (lines[0]) state.fields.skillsLanguages = lines[0];
          if (lines[1]) state.fields.skillsFrameworks = lines[1];
          break;
        }
        case "projects":
          state.fields.projects = state.aiSuggestion;
          break;
        case "education":
          state.fields.education = state.aiSuggestion;
          break;
        case "certifications":
          state.fields.certifications = state.aiSuggestion;
          break;
        case "publications":
          state.fields.publications = state.aiSuggestion;
          break;
        default:
          break;
      }
      state.aiSuggestion = null;
      state.aiSectionId = null;
      state.isDirty = true;
    },

    discardAiSuggestion(state) {
      state.aiSuggestion = null;
      state.aiSectionId = null;
    },

    /** Step back one change in history. */
    undo(state) {
      if (state.past.length === 0) return;
      const prev = state.past[state.past.length - 1];
      state.future = [{ ...state.fields }, ...state.future.slice(0, MAX_HISTORY - 1)];
      state.past = state.past.slice(0, -1);
      state.fields = prev;
    },

    /** Step forward one change in history. */
    redo(state) {
      if (state.future.length === 0) return;
      const next = state.future[0];
      state.past = [...state.past.slice(-MAX_HISTORY + 1), { ...state.fields }];
      state.future = state.future.slice(1);
      state.fields = next;
    },

    setAutoSaveStatus(state, action: PayloadAction<AutoSaveStatus>) {
      state.autoSaveStatus = action.payload;
      if (action.payload === "saved") state.isDirty = false;
    },

    setActiveBottomTab(state, action: PayloadAction<BottomTab>) {
      state.activeBottomTab = action.payload;
    },

    /**
     * Initialise (or reset) the editor from a parsed resume config.
     * Called when the page mounts with location.state.config.
     */
    initFromConfig(
      state,
      action: PayloadAction<{
        title?: string;
        fields?: Partial<ResumeFields>;
        templateId?: TemplateId;
        lockedFields?: Partial<Record<keyof ResumeFields, boolean>>;
      }>,
    ) {
      const { title, fields, templateId, lockedFields } = action.payload;
      if (title) state.resumeTitle = title;
      if (templateId) state.templateId = templateId;
      state.fields = { ...EMPTY_FIELDS, ...(fields ?? {}) };
      state.lockedFields = lockedFields ?? { name: true, email: true };
      state.past = [];
      state.future = [];
      state.isDirty = false;
      state.autoSaveStatus = "idle";
      state.activeSection = "personalInfo";
      state.aiSuggestion = null;
      state.aiSectionId = null;
      state.activeBottomTab = "editor";
    },
  },
});

export const {
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
} = resumeBuilderSlice.actions;

export default resumeBuilderSlice.reducer;
