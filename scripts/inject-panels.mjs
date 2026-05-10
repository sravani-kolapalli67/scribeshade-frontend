import { readFileSync, writeFileSync } from "fs";

const content = readFileSync("src/pages/Resume/ResumeEditor/page.tsx", "utf-8");

const marker = "}\n\n// \u2500\u2500\u2500 BottomTabsBar";
const idx = content.indexOf(marker);
if (idx === -1) { console.error("Marker not found"); process.exit(1); }

const newPanels = `

// \u2500\u2500\u2500 FullRewritePanel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function FullRewritePanel() {
  const dispatch       = useDispatch<AppDispatch>();
  const fields         = useSelector((s: RootState) => s.resumeBuilder.fields);
  const savedResumeId  = useSelector((s: RootState) => s.resumeBuilder.savedResumeId);
  const isRewriting    = useSelector((s: RootState) => s.resumeBuilder.isRewriting);
  const jobTitle       = useSelector((s: RootState) => s.resumeBuilder.jobTitle);
  const company        = useSelector((s: RootState) => s.resumeBuilder.company);
  const { getToken, userId: clerkUserId } = useAuth();
  const { refresh: refreshBalance } = useCreditsBalance();
  const { costFor } = useFeatureCosts();
  const rewriteCost = costFor(FEATURE_KEYS.RESUME_REWRITE, 4);

  const [targetTitle, setTargetTitle] = React.useState(jobTitle);
  const [targetCompany, setTargetCompany] = React.useState(company);
  const [targetLevel, setTargetLevel] = React.useState<string>("mid");
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => { setTargetTitle(jobTitle); }, [jobTitle]);
  React.useEffect(() => { setTargetCompany(company); }, [company]);

  const handleRewrite = React.useCallback(async () => {
    if (isRewriting || !targetTitle.trim()) return;
    setError(null); setDone(false);
    dispatch(setIsRewriting(true));
    const idempotencyKey = createIdempotencyKey();
    try {
      const userId = localStorage.getItem("userId") ?? clerkUserId;
      const token = await getToken();
      const payload: Record<string, unknown> = { userId, jobTitle: targetTitle.trim(), company: targetCompany.trim(), targetLevel };
      if (savedResumeId) payload.resumeId = savedResumeId; else payload.fields = fields;
      const { data, creditsUsed, creditsRemaining, cached } = await postCreditedAi<{ tailoredFields: Partial<ResumeFields> }>(
        ENDPOINTS.resumeBuilderRewrite(), payload, { token, idempotencyKey });
      dispatch(applyRewrittenFields({ fields: data.tailoredFields ?? {} }));
      dispatch(recordAiActivity({ operation: "resume_rewrite", label: "Full Rewrite", creditsUsed, cached, status: "success" }));
      if (!isNaN(creditsRemaining)) setOptimisticBalance(creditsRemaining);
      toast.success(cached ? "Rewrite from cache \u00b7 no credits used" : \`Resume rewritten \u00b7 \${creditsUsed} credit\${creditsUsed === 1 ? "" : "s"} used\`);
      setDone(true); refreshBalance();
    } catch (err) {
      setError(err instanceof InsufficientCreditsError
        ? \`Need \${rewriteCost} credits to rewrite. Top up to continue.\`
        : err instanceof Error ? err.message : "Rewrite failed.");
      dispatch(recordAiActivity({ operation: "resume_rewrite", label: "Full Rewrite", creditsUsed: 0, cached: false, status: "error", errorMessage: err instanceof Error ? err.message : String(err) }));
    } finally { dispatch(setIsRewriting(false)); }
  }, [isRewriting, targetTitle, targetCompany, targetLevel, savedResumeId, fields, getToken, clerkUserId, dispatch, refreshBalance, rewriteCost]);

  const LEVELS = ["junior", "mid", "senior", "lead"] as const;

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/60">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-violet-100 border border-violet-200/60 flex items-center justify-center shrink-0">
            <RefreshCw className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Full Resume Rewrite</h2>
            <p className="text-xs text-muted-foreground">Rewrite all sections to target a new role \u2014 no job description needed</p>
          </div>
          <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200/60 uppercase tracking-wide">{rewriteCost} credits</span>
        </div>
        <div className="bg-background rounded-2xl border border-border px-5 py-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Target Job Title <span className="text-destructive">*</span></label>
              <input type="text" value={targetTitle} onChange={(e) => setTargetTitle(e.target.value)} placeholder="e.g. Senior Data Engineer" className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Company (optional)</label>
              <input type="text" value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} placeholder="e.g. Netflix" className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Seniority Level</label>
            <div className="flex gap-2">
              {LEVELS.map((lvl) => (
                <button key={lvl} onClick={() => setTargetLevel(lvl)} className={cn("px-3 h-8 rounded-lg text-xs font-semibold border transition-all", targetLevel === lvl ? "bg-violet-600 text-white border-violet-600" : "bg-background text-muted-foreground border-border hover:border-violet-400")}>
                  {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">AI will rewrite your <strong>summary, experience bullets, skills, and projects</strong>. Employer names, job titles, and dates are never changed.</p>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={handleRewrite} disabled={!targetTitle.trim() || isRewriting} className={cn("flex items-center gap-2 px-6 h-10 rounded-xl text-sm font-semibold transition-all shadow-sm", targetTitle.trim() && !isRewriting ? "bg-violet-600 hover:bg-violet-700 text-white" : "bg-muted text-muted-foreground cursor-not-allowed")}>
            {isRewriting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isRewriting ? "Rewriting resume\u2026" : "Rewrite My Resume"}
          </button>
          {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</p>}
          {done && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resume rewritten{"\u0021"} <button onClick={() => dispatch(setActiveBottomTab("editor"))} className="underline underline-offset-2">Open Editor</button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// \u2500\u2500\u2500 InjectSkillsPanel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function InjectSkillsPanel() {
  const dispatch      = useDispatch<AppDispatch>();
  const fields        = useSelector((s: RootState) => s.resumeBuilder.fields);
  const savedResumeId = useSelector((s: RootState) => s.resumeBuilder.savedResumeId);
  const isInjecting   = useSelector((s: RootState) => s.resumeBuilder.isInjectingSkills);
  const jobTitle      = useSelector((s: RootState) => s.resumeBuilder.jobTitle);
  const jobDescription= useSelector((s: RootState) => s.resumeBuilder.jobDescription);
  const { getToken, userId: clerkUserId } = useAuth();
  const { refresh: refreshBalance } = useCreditsBalance();
  const { costFor } = useFeatureCosts();
  const injectCost = costFor(FEATURE_KEYS.RESUME_INJECT_SKILLS, 1);
  const [jd, setJd] = React.useState(jobDescription);
  const [error, setError] = React.useState<string | null>(null);
  const [addedSkills, setAddedSkills] = React.useState<string[]>([]);

  const handleInject = React.useCallback(async () => {
    if (isInjecting) return;
    setError(null); setAddedSkills([]);
    dispatch(setIsInjectingSkills(true));
    const idempotencyKey = createIdempotencyKey();
    try {
      const userId = localStorage.getItem("userId") ?? clerkUserId;
      const token = await getToken();
      const { data, creditsUsed, creditsRemaining, cached } = await postCreditedAi<{ injectedFields: Partial<ResumeFields>; suggestedSkills: string[] }>(
        ENDPOINTS.resumeBuilderInjectSkills(), { userId, resumeId: savedResumeId ?? undefined, jobDescription: jd || undefined, jobTitle: jobTitle || undefined, fields }, { token, idempotencyKey });
      dispatch(applyInjectedSkills({ injectedFields: data.injectedFields ?? {} }));
      setAddedSkills(data.suggestedSkills ?? []);
      dispatch(recordAiActivity({ operation: "resume_inject_skills", label: "Inject Skills", creditsUsed, cached, status: "success" }));
      if (!isNaN(creditsRemaining)) setOptimisticBalance(creditsRemaining);
      toast.success(cached ? "From cache \u00b7 no credits used" : \`\${creditsUsed} credit\${creditsUsed === 1 ? "" : "s"} used\`);
      refreshBalance();
    } catch (err) {
      setError(err instanceof InsufficientCreditsError ? \`Need \${injectCost} credits. Top up to continue.\` : err instanceof Error ? err.message : "Skill injection failed.");
      dispatch(recordAiActivity({ operation: "resume_inject_skills", label: "Inject Skills", creditsUsed: 0, cached: false, status: "error", errorMessage: err instanceof Error ? err.message : String(err) }));
    } finally { dispatch(setIsInjectingSkills(false)); }
  }, [isInjecting, jd, jobTitle, savedResumeId, fields, getToken, clerkUserId, dispatch, refreshBalance, injectCost]);

  const existingSkills = [fields.skillsLanguages, fields.skillsFrameworks, fields.skillsDatabases, fields.skillsTools]
    .flatMap((s) => s?.split(",").map((x) => x.trim()).filter(Boolean) ?? []);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/60">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-100 border border-emerald-200/60 flex items-center justify-center shrink-0"><Zap className="h-5 w-5 text-emerald-600" /></div>
          <div><h2 className="text-lg font-bold tracking-tight">Inject Skills</h2><p className="text-xs text-muted-foreground">Add missing role-relevant skills automatically</p></div>
          <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200/60 uppercase tracking-wide">{injectCost} credit</span>
        </div>
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30"><span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Job Description (optional)</span></div>
          <Textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste job description for targeted suggestions, or leave empty for general role skills\u2026" className="border-none rounded-none min-h-[140px] resize-none text-sm bg-background focus-visible:ring-0 focus-visible:ring-offset-0 px-5 py-4 placeholder:text-muted-foreground/40 leading-relaxed" />
        </div>
        <div className="bg-background rounded-xl border border-border p-4 shadow-sm space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Current skills</p>
          <div className="flex flex-wrap gap-1.5">
            {existingSkills.length > 0
              ? existingSkills.map((sk, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">{sk}</span>)
              : <span className="text-xs text-muted-foreground">No skills listed yet</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={handleInject} disabled={isInjecting} className="flex items-center gap-2 px-6 h-10 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {isInjecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {isInjecting ? "Injecting skills\u2026" : "Inject Missing Skills"}
          </button>
          {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</p>}
        </div>
        {addedSkills.length > 0 && (
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Added ({addedSkills.length})</p>
            <div className="flex flex-wrap gap-1.5">{addedSkills.map((sk, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">{sk}</span>)}</div>
            <button onClick={() => dispatch(setActiveBottomTab("editor"))} className="text-xs text-emerald-700 underline underline-offset-2 font-semibold">Review in Skills section \u2192</button>
          </div>
        )}
      </div>
    </main>
  );
}

// \u2500\u2500\u2500 InjectKeywordsPanel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function InjectKeywordsPanel() {
  const dispatch       = useDispatch<AppDispatch>();
  const fields         = useSelector((s: RootState) => s.resumeBuilder.fields);
  const savedResumeId  = useSelector((s: RootState) => s.resumeBuilder.savedResumeId);
  const isInjecting    = useSelector((s: RootState) => s.resumeBuilder.isInjectingKeywords);
  const jobDescription = useSelector((s: RootState) => s.resumeBuilder.jobDescription);
  const { getToken, userId: clerkUserId } = useAuth();
  const { refresh: refreshBalance } = useCreditsBalance();
  const { costFor } = useFeatureCosts();
  const injectCost = costFor(FEATURE_KEYS.RESUME_INJECT_KEYWORDS, 2);
  const [jd, setJd] = React.useState(jobDescription);
  const [error, setError] = React.useState<string | null>(null);
  const [injected, setInjected] = React.useState<string[]>([]);

  React.useEffect(() => { setJd(jobDescription); }, [jobDescription]);

  const handleInject = React.useCallback(async () => {
    if (isInjecting || jd.trim().length < 50) return;
    setError(null); setInjected([]);
    dispatch(setIsInjectingKeywords(true));
    const idempotencyKey = createIdempotencyKey();
    try {
      const userId = localStorage.getItem("userId") ?? clerkUserId;
      const token = await getToken();
      const { data, creditsUsed, creditsRemaining, cached } = await postCreditedAi<{ injectedFields: Partial<ResumeFields>; injectedKeywords: string[] }>(
        ENDPOINTS.resumeBuilderInjectKeywords(), { userId, resumeId: savedResumeId ?? undefined, jobDescription: jd, fields }, { token, idempotencyKey });
      dispatch(applyRewrittenFields({ fields: data.injectedFields ?? {} }));
      setInjected(data.injectedKeywords ?? []);
      dispatch(recordAiActivity({ operation: "resume_inject_keywords", label: "Bulk Keywords", creditsUsed, cached, status: "success" }));
      if (!isNaN(creditsRemaining)) setOptimisticBalance(creditsRemaining);
      toast.success(cached ? "From cache \u00b7 no credits used" : \`\${creditsUsed} credit\${creditsUsed === 1 ? "" : "s"} used\`);
      refreshBalance();
    } catch (err) {
      setError(err instanceof InsufficientCreditsError ? \`Need \${injectCost} credits. Top up to continue.\` : err instanceof Error ? err.message : "Keyword injection failed.");
      dispatch(recordAiActivity({ operation: "resume_inject_keywords", label: "Bulk Keywords", creditsUsed: 0, cached: false, status: "error", errorMessage: err instanceof Error ? err.message : String(err) }));
    } finally { dispatch(setIsInjectingKeywords(false)); }
  }, [isInjecting, jd, savedResumeId, fields, getToken, clerkUserId, dispatch, refreshBalance, injectCost]);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/60">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-100 border border-amber-200/60 flex items-center justify-center shrink-0"><Tag className="h-5 w-5 text-amber-600" /></div>
          <div><h2 className="text-lg font-bold tracking-tight">Bulk Keyword Injection</h2><p className="text-xs text-muted-foreground">Weave missing JD keywords naturally into your resume sections</p></div>
          <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200/60 uppercase tracking-wide">{injectCost} credits</span>
        </div>
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Job Description <span className="text-destructive font-medium normal-case tracking-normal">(required)</span></span>
            <span className="text-[10px] text-muted-foreground">{jd.length > 0 ? \`\${jd.length} chars\` : "Paste JD below"}</span>
          </div>
          <Textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full job description. AI will extract missing keywords and weave them naturally into your summary, experience, and project sections\u2026" className="border-none rounded-none min-h-[200px] resize-none text-sm bg-background focus-visible:ring-0 focus-visible:ring-offset-0 px-5 py-4 placeholder:text-muted-foreground/40 leading-relaxed" />
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={handleInject} disabled={isInjecting || jd.trim().length < 50} className={cn("flex items-center gap-2 px-6 h-10 rounded-xl text-sm font-semibold transition-all shadow-sm", !isInjecting && jd.trim().length >= 50 ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-muted text-muted-foreground cursor-not-allowed")}>
            {isInjecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
            {isInjecting ? "Injecting keywords\u2026" : "Inject Keywords"}
          </button>
          {jd.trim().length > 0 && jd.trim().length < 50 && <p className="text-xs text-muted-foreground">Paste at least 50 characters to continue</p>}
          {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</p>}
        </div>
        {injected.length > 0 && (
          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Keywords injected ({injected.length})</p>
            <div className="flex flex-wrap gap-1.5">{injected.map((kw, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">{kw}</span>)}</div>
            <button onClick={() => dispatch(setActiveBottomTab("editor"))} className="text-xs text-amber-700 underline underline-offset-2 font-semibold">Review changes in Editor \u2192</button>
          </div>
        )}
      </div>
    </main>
  );
}

// \u2500\u2500\u2500 KeywordMatchPanel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function KeywordMatchPanel() {
  const dispatch        = useDispatch<AppDispatch>();
  const fields          = useSelector((s: RootState) => s.resumeBuilder.fields);
  const isMatching      = useSelector((s: RootState) => s.resumeBuilder.isMatchingKeywords);
  const result          = useSelector((s: RootState) => s.resumeBuilder.keywordMatchResult);
  const jobDescription  = useSelector((s: RootState) => s.resumeBuilder.jobDescription);
  const { getToken }    = useAuth();
  const [jd, setJd] = React.useState(jobDescription);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { setJd(jobDescription); }, [jobDescription]);

  const handleMatch = React.useCallback(async () => {
    if (isMatching || jd.trim().length < 10) return;
    setError(null);
    dispatch(setIsMatchingKeywords(true));
    try {
      const token = await getToken();
      const res = await fetch(ENDPOINTS.resumeBuilderKeywordMatch(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },
        body: JSON.stringify({ jobDescription: jd, fields }),
      });
      if (!res.ok) throw new Error("Keyword match failed");
      const data = await res.json();
      dispatch(setKeywordMatchResult({ present: data.data?.present ?? [], missing: data.data?.missing ?? [], matchScore: data.data?.matchScore ?? 0 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Match analysis failed.");
    } finally { dispatch(setIsMatchingKeywords(false)); }
  }, [isMatching, jd, fields, getToken, dispatch]);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/60">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-blue-100 border border-blue-200/60 flex items-center justify-center shrink-0"><Search className="h-5 w-5 text-blue-600" /></div>
          <div><h2 className="text-lg font-bold tracking-tight">Keyword Match</h2><p className="text-xs text-muted-foreground">See which JD keywords your resume covers \u2014 completely free</p></div>
          <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200/60 uppercase tracking-wide">FREE</span>
        </div>
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30"><span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Job Description</span></div>
          <Textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the job description to analyse keyword coverage\u2026" className="border-none rounded-none min-h-[180px] resize-none text-sm bg-background focus-visible:ring-0 focus-visible:ring-offset-0 px-5 py-4 placeholder:text-muted-foreground/40 leading-relaxed" />
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={handleMatch} disabled={isMatching || jd.trim().length < 10} className={cn("flex items-center gap-2 px-6 h-10 rounded-xl text-sm font-semibold transition-all shadow-sm", !isMatching && jd.trim().length >= 10 ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-muted text-muted-foreground cursor-not-allowed")}>
            {isMatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {isMatching ? "Analysing\u2026" : "Analyse Keyword Match"}
          </button>
          {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</p>}
        </div>
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 bg-background rounded-2xl border border-border p-5 shadow-sm">
              <div className={cn("h-20 w-20 rounded-full border-4 flex items-center justify-center shrink-0 font-black text-2xl tabular-nums", result.matchScore >= 70 ? "border-emerald-400 text-emerald-700" : result.matchScore >= 40 ? "border-amber-400 text-amber-700" : "border-red-400 text-red-700")}>
                {result.matchScore}%
              </div>
              <div>
                <p className="font-bold text-base">Keyword Coverage</p>
                <p className="text-sm text-muted-foreground mt-0.5">{result.present.length} of {result.present.length + result.missing.length} JD keywords found in your resume</p>
                <p className="text-[11px] text-muted-foreground mt-1">Analysed {new Date(result.analysedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-white border border-emerald-200/60 p-3">
                <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 mb-1.5">Present ({result.present.length})</p>
                <div className="flex flex-wrap gap-1">{result.present.slice(0, 20).map((k) => <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{k}</span>)}{result.present.length > 20 && <span className="text-[10px] text-slate-500">+{result.present.length - 20}</span>}</div>
              </div>
              <div className="rounded-xl bg-white border border-red-200/60 p-3">
                <p className="text-[10px] uppercase tracking-wider font-bold text-red-700 mb-1.5">Missing ({result.missing.length})</p>
                <div className="flex flex-wrap gap-1">{result.missing.slice(0, 20).map((k) => <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">{k}</span>)}{result.missing.length > 20 && <span className="text-[10px] text-slate-500">+{result.missing.length - 20}</span>}</div>
              </div>
            </div>
            {result.missing.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => dispatch(setActiveBottomTab("jdtailor"))} className="text-xs font-semibold px-3 h-8 rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors">Fix with JD Tailor</button>
                <button onClick={() => dispatch(setActiveBottomTab("injectkeywords"))} className="text-xs font-semibold px-3 h-8 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors">Inject Keywords</button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

`;

const newContent = content.substring(0, idx + 1) + newPanels + content.substring(idx + 1);
writeFileSync("src/pages/Resume/ResumeEditor/page.tsx", newContent);
console.log("Done. File size:", newContent.length, "chars");
