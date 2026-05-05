# Resume Module — Context & State Document
*Last updated: May 2026*

This document captures the current state of all resume-related features so work can be resumed without re-reading the full codebase.

---

## Architecture Summary

The resume module spans two distinct sub-flows:

| Flow | Purpose | Key Files |
|------|---------|-----------|
| **Upload flow** | Upload PDF/DOC, parse, ATS-score, cover letter | `resume.service.ts`, `resume.controller.ts`, `resume.router.ts` |
| **Builder flow** | AI-assisted wizard → editor → export → complete | `resume.builder.service.ts`, `resume.builder.controller.ts`, `resume.router.ts` |

---

## Backend — Feature Module

**Location:** `/Users/hiddenmindsolutions/Projects/scribeshade-01-backend/src/features/resume/`

### Files
| File | Purpose |
|------|---------|
| `resume.service.ts` | Uploaded resume CRUD, ATS scoring, `getResumesByUser` (merged list) |
| `resume.builder.service.ts` | Builder CRUD, AI generate/enhance/tailor/extract, credit deduction |
| `resume.controller.ts` | HTTP handlers for upload flow |
| `resume.builder.controller.ts` | HTTP handlers for builder flow |
| `resume.router.ts` | All resume routes under `/api/resume/` |
| `resume.types.ts` | Shared TypeScript interfaces |

### DB Models (Prisma)
```prisma
model Resume {
  id            String    @id @default(uuid())
  userId        String
  filename      String
  path          String
  size          Int?
  resumeContext String?   @db.Text
  uploadedAt    DateTime  @default(now())
  ats           Boolean   @default(false)
  atsAnalysis   Json?
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model BuiltResume {
  id             String    @id @default(uuid())
  userId         String
  title          String
  templateId     String
  fields         Json
  sections       Json
  jobDescription String?   @db.Text
  jobTitle       String?
  company        String?
  status         String    @default("draft")   // "draft" | "completed"
  downloadedAt   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

### Routes (all under `/api/resume`)

| Method | Path | Auth | Credits | Description |
|--------|------|------|---------|-------------|
| `POST` | `/upload` | ✓ | 2 | Upload + parse PDF/DOC |
| `GET` | `/list?userId=` | ✓ | — | Both uploaded + completed built resumes |
| `DELETE` | `/:id` | ✓ | — | Delete uploaded resume |
| `POST` | `/ats-score` | ✓ | — | ATS score (FREE) |
| `GET` | `/all-ats?userId=` | ✓ | — | All ATS results |
| `POST` | `/generate-cover-letter` | ✓ | 3 | AI cover letter |
| `GET` | `/all-templates` | — | — | Template list |
| `POST` | `/builder/save` | ✓ | — | Upsert built resume |
| `GET` | `/builder/list?userId=` | ✓ | — | List built resumes (drafts + completed) |
| `GET` | `/builder/:id` | ✓ | — | Get single built resume |
| `DELETE` | `/builder/:id` | ✓ | — | Delete built resume |
| `POST` | `/builder/generate` | ✓ | 1 | AI populate template |
| `POST` | `/builder/enhance-section` | ✓ | 0.5 | AI enhance section |
| `POST` | `/builder/tailor` | ✓ | 1 | AI tailor to JD |
| `POST` | `/builder/export-pdf` | ✓ | — | Export HTML → download URL |
| `POST` | `/builder/extract-fields` | ✓ | 0.5 | AI parse resume text → structured fields |
| `POST` | `/builder/:id/complete` | ✓ | — | Mark status=completed + set downloadedAt |

### `GET /api/resume/list` — Merged Response Shape
```json
{
  "id": "uuid",
  "filename": "My Resume.html",
  "path": "",
  "size": null,
  "resumeContext": null,
  "uploadedAt": "2026-05-01T...",
  "userId": "uuid",
  "ats": false,
  "atsAnalysis": null,
  "source": "builder",          // "uploaded" | "builder"
  "templateId": "modern-blue",
  "jobTitle": "Backend Engineer",
  "company": "Acme Corp",
  "builtResumeId": "uuid"
}
```

Only `status = "completed"` built resumes appear in this list.

### Credit Costs (Resume Builder)
| Operation | Cost |
|-----------|------|
| AI populate template | 1 credit |
| AI enhance section | 0.5 credits |
| AI tailor to JD | 1 credit |
| AI extract fields from text | 0.5 credits |

---

## Frontend — Components & Pages

**Location:** `/Users/hiddenmindsolutions/Projects/scribeshade-01-frontend/src/`

### Key Pages
| Route | File | Purpose |
|-------|------|---------|
| `/resume/all` | `pages/Resume/AllResume/page.tsx` | Grid of all uploaded + built resumes |
| `/resume/ats-analysis` | `pages/Resume/ATSAnalysis/page.tsx` | ATS scores |
| `/resume/build` | `pages/Resume/BuildResume/page.tsx` | Wizard launch pad |
| `/resume/editor` | `pages/Resume/ResumeEditor/page.tsx` | Full editor with live preview |
| `/resume/cover-letter` | `pages/Resume/CoverLetter/page.tsx` | Cover letter tool |

### Key Components
| Component | File | Notes |
|-----------|------|-------|
| `BuildResumeDialog` | `components/Resume/BuildResumeDialog.tsx` | 4-step wizard. On complete → saves draft `BuiltResume` → navigates to editor. Uses `getToken()` for auth. |
| `TemplateSelectionStep` | `components/Resume/BuildResume/TemplateSelectionStep.tsx` | Step 4 of wizard |
| `ExtractionStep` | `components/Resume/BuildResume/ExtractionStep.tsx` | Step 2 of wizard |
| `ProcessingStep` | `components/Resume/BuildResume/ProcessingStep.tsx` | Step 3. Accepts `status`, `error`, `onRetry`, `onSkip` props |
| `ResumeSelector` | `components/Resume/ResumeSelector.tsx` | Dropdown to pick existing uploaded resume |

### Redux Slice — `resumeBuilderSlice`
**File:** `src/store/resumeBuilderSlice.ts`

Key state fields:
- `savedResumeId: string | null` — backend UUID for the current `BuiltResume`
- `isDirty: boolean` — unsaved changes flag
- `autoSaveStatus: "idle" | "saving" | "saved" | "error"`
- `fields: ResumeFields` — personal info, summary, experience, education, skills, projects, certifications
- `sections: ResumeSection[]` — ordered list of sections visible in editor
- `jobDescription`, `jobTitle`, `company` — JD context
- `templateId`, `templateCode` — active template

Key actions: `initFromConfig`, `updateField`, `setSavedResumeId`, `setAutoSaveStatus`, `setIsDirty`, etc.

### Wizard → Editor Config Shape
```typescript
{
  sourceType: "builder" | "scratch" | "template",
  resumeId?: string,          // existing uploaded resume ID (for extraction path)
  resumeContext?: string,     // raw text of uploaded resume
  fields?: ResumeFields,      // pre-populated by AI extraction
  extractionOptions: { ... },
  jobDescription?: string,
  jobTitle?: string,
  company?: string,
  resumeTitle: string,
  templateId?: string,
  templateCode?: string,
}
```

### Mark-Complete Flow
1. Wizard completes → `navigateToEditor(fields?)` (async) → saves draft via `POST /builder/save` → gets `savedResumeId`
2. User edits in editor → auto-save keeps `BuiltResume` updated
3. User clicks Export PDF → `POST /builder/export-pdf` → opens download URL
4. **If** `savedResumeId` exists **AND** `isDirty === false` → calls `POST /builder/:id/complete`
5. `BuiltResume.status` set to `"completed"` + `downloadedAt = now()`
6. Record now appears in `GET /api/resume/list`

### Endpoints (frontend)
All builder endpoints are in `src/lib/endpoints.ts` under `ENDPOINTS.resumeBuilder*`:
- `resumeBuilderSave()`
- `resumeBuilderList(userId)`
- `resumeBuilderGet(id)`
- `resumeBuilderGenerate()`
- `resumeBuilderEnhanceSection()`
- `resumeBuilderTailor()`
- `resumeBuilderExportPdf()`
- `resumeBuilderExtractFields()`
- `resumeBuilderComplete(id)`

---

## What's Done vs. Pending

### ✅ Completed
- Schema: `BuiltResume` has `status` + `downloadedAt` fields
- Backend: All 16 endpoints listed above
- Backend: `GET /resume/list` merges both uploaded + completed built resumes
- Frontend: `BuildResumeDialog` saves draft before navigating
- Frontend: `ResumeEditor` calls mark-complete after export if `!isDirty`
- Frontend: `ProcessingStep` has error/retry/skip UI
- Both projects pass `tsc --noEmit`

### ❌ Pending / Future Work
- Version history for built resumes
- Preview mode (read-only) for built resumes from the list page
- Template apply (1 credit) vs template switch (free)
- Bulk keyword inject endpoint (2 credits)
- Skill injection endpoint (1 credit)

---

## Auth Pattern (important)
- All non-auth endpoints use **DB UUID** from `localStorage.getItem("userId")`
- Bearer token from `getToken()` (`useAuth` hook) is sent as `Authorization` header
- Clerk ID ≠ DB UUID — never use Clerk `userId` for DB queries directly
- `useSyncUser` hook syncs Clerk user to DB on mount and sets `userId` in localStorage

---

## Credit Deduction Pattern (Backend)
```typescript
// Local helper in each service file
async function deductCredits(userId, amount: Prisma.Decimal, operation: string) {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.userCreditBalance.findUnique({ where: { userId } });
    if (!balance || new Prisma.Decimal(balance.totalAvailable.toString()).lt(amount)) {
      throw new AppError(402, `Insufficient credits. Required: ${amount}`);
    }
    const after = new Prisma.Decimal(balance.totalAvailable.toString()).minus(amount);
    await tx.userCreditBalance.update({ where: { userId }, data: { totalAvailable: after } });
    await tx.creditLedger.create({
      data: { userId, type: "DEBIT", amount, balanceBefore: ..., balanceAfter: after,
              description: operation, source: "FEATURE" }
    });
  });
}
```
