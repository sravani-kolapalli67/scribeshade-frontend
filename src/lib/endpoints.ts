/**
 * Centralized API endpoint factory.
 * All backend URLs are derived from VITE_BACKEND_URL so there is exactly
 * one place to change the base URL across the entire frontend.
 */

const api = () => import.meta.env.VITE_BACKEND_URL as string;

export const ENDPOINTS = {
  // ── Auth ────────────────────────────────────────────────────────────────
  authMe: () => `${api()}/api/auth/me`,

  // ── Credits ─────────────────────────────────────────────────────────────
  creditsBalance:       () => `${api()}/api/credits/balance`,
  creditsBrackets:      () => `${api()}/api/credits/brackets`,
  creditsPlans:         (currency = "INR") =>
    `${api()}/api/credits/plans?currency=${currency}`,
  creditsLedger:        (page = 1, limit = 20) =>
    `${api()}/api/credits/ledger?page=${page}&limit=${limit}`,
  creditsPurchaseOrder: () => `${api()}/api/credits/purchase/order`,
  creditsPurchaseVerify: () => `${api()}/api/credits/purchase/verify`,
  creditsPurchases:     () => `${api()}/api/credits/purchases`,

  // ── Sessions ────────────────────────────────────────────────────────────
  sessionCreate:      () => `${api()}/api/session/create-session`,
  sessionList: (
    userId: string,
    params?: { search?: string; from?: string; to?: string },
  ) => {
    const url = new URL(`${api()}/api/session/list`);
    url.searchParams.set("userId", userId);
    if (params?.search) url.searchParams.set("search", params.search);
    if (params?.from)   url.searchParams.set("from_date", params.from);
    if (params?.to)     url.searchParams.set("to_date", params.to);
    return url.toString();
  },
  sessionGet:           (id: string) => `${api()}/api/session/${id}`,
  sessionDelete:        (id: string) => `${api()}/api/session/${id}`,
  sessionActivate:      (id: string) => `${api()}/api/session/${id}/activate`,
  sessionHeartbeat:     (id: string) => `${api()}/api/session/${id}/heartbeat`,
  sessionDeactivate:    (id: string) => `${api()}/api/session/${id}/deactivate`,
  sessionAnalyzeScreen: (id: string) => `${api()}/api/session/${id}/analyze-screen`,
  sessionAiAnswer:      (id: string) => `${api()}/api/session/${id}/ai-answer`,
  sessionSaveMessage:   (id: string) => `${api()}/api/session/${id}/save-message`,
  sessionAnalytics:     (id: string) => `${api()}/api/session/${id}/analytics`,

  // ── Resume – upload flow ─────────────────────────────────────────────────
  resumeUpload:              () => `${api()}/api/resume/upload`,
  resumeList:   (userId: string) => `${api()}/api/resume/list?userId=${userId}`,
  resumeDelete: (id: string)     => `${api()}/api/resume/${id}`,
  resumeATSScore:            () => `${api()}/api/resume/ats-score`,
  resumeAllATS: (userId: string) => `${api()}/api/resume/all-ats?userId=${userId}`,
  resumeGenerateCoverLetter: () => `${api()}/api/resume/generate-cover-letter`,
  resumeAllTemplates:        () => `${api()}/api/resume/all-templates`,

  // ── Resume – builder flow ────────────────────────────────────────────────
  resumeBuilderSave:           () => `${api()}/api/resume/builder/save`,
  resumeBuilderList: (userId: string) =>
    `${api()}/api/resume/builder/list?userId=${userId}`,
  resumeBuilderGet:      (id: string) => `${api()}/api/resume/builder/${id}`,
  resumeBuilderDelete:   (id: string) => `${api()}/api/resume/builder/${id}`,
  resumeBuilderComplete: (id: string) => `${api()}/api/resume/builder/${id}/complete`,
  resumeBuilderGenerate:       () => `${api()}/api/resume/builder/generate`,
  resumeBuilderExtractFields:  () => `${api()}/api/resume/builder/extract-fields`,
  resumeBuilderEnhanceSection: () => `${api()}/api/resume/builder/enhance-section`,
  resumeBuilderValidateSection: () => `${api()}/api/resume/builder/validate-section`,
  resumeBuilderTailor:         () => `${api()}/api/resume/builder/tailor`,
  resumeBuilderExportPdf:      () => `${api()}/api/resume/builder/export-pdf`,

  // ── Documents ────────────────────────────────────────────────────────────
  documentUpload:           () => `${api()}/api/document/upload`,
  documentList: (userId: string) => `${api()}/api/document/list?userId=${userId}`,
  documentDelete: (id: string)   => `${api()}/api/document/${id}`,

  // ── AI / Projects ─────────────────────────────────────────────────────────
  aiProjectGeneration: () => `${api()}/api/ai/project-generation`,
  projectCategories:   (roleType?: string) =>
    `${api()}/api/project-categories${roleType ? `?role_type=${roleType}` : ""}`,
  projectsGenerate:       () => `${api()}/api/projects/generate`,
  projectsList:  (userId: string) => `${api()}/api/projects/user/${userId}`,
  projectsGet:        (id: string) => `${api()}/api/projects/${id}`,
  projectsDelete:     (id: string) => `${api()}/api/projects/${id}`,
  projectsUpdate:          (id: string) => `${api()}/api/projects/${id}`,
  projectsReplaceProjects: (id: string) => `${api()}/api/projects/${id}/projects`,
  projectsVersions:        (id: string) => `${api()}/api/projects/${id}/versions`,
  projectsRollback:  (id: string, versionId: string) => `${api()}/api/projects/${id}/versions/${versionId}/rollback`,
  projectsEditComponent: (id: string) => `${api()}/api/projects/${id}/edit-component`,
} as const;
