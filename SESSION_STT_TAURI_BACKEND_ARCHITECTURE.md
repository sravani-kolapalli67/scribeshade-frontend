# ScribeShade Session, STT, Tauri, Backend, Redis, Prisma Architecture

Current as of 2026-06-12.

This document describes the current working architecture across:

- Frontend React active session page and floating Tauri overlay
- Tauri desktop windows and native Rust commands
- Speech-to-text paths using Deepgram
- Backend Express session module
- OpenRouter AI answer streaming
- Prisma/PostgreSQL persistence
- Redis/BullMQ queues and Redis session memory
- Real-time transport paths: SSE, HTTP streaming, Tauri events, Deepgram WebSockets, and local native audio WebSockets

## Repository Roots

| Area | Location |
|---|---|
| Backend repo | `/Users/hiddenmindsolutions/Projects/scribeshade-01-backend` |
| Frontend repo | `/Users/hiddenmindsolutions/Projects/scribeshade-01-frontend` |
| Backend session module | `/Users/hiddenmindsolutions/Projects/scribeshade-01-backend/src/features/session` |
| Frontend active session UI | `/Users/hiddenmindsolutions/Projects/scribeshade-01-frontend/src/pages/Sessions/ActiveSession` |
| Frontend floating session hook | `/Users/hiddenmindsolutions/Projects/scribeshade-01-frontend/src/features/session/hooks/useFloatingSession.ts` |
| Tauri Rust shell | `/Users/hiddenmindsolutions/Projects/scribeshade-01-frontend/src-tauri/src/lib.rs` |
| Tauri Deepgram transport | `/Users/hiddenmindsolutions/Projects/scribeshade-01-frontend/src-tauri/src/deepgram.rs` |

## High Level Topology

```text
User
  |
  | desktop/web interaction
  v
React frontend
  |
  | web app mode
  | - main React dashboard: index.html -> App.tsx
  | - ActiveSession page handles transcript, AI answer, screen analysis
  |
  | desktop mode
  | - launcher window: launcher.html -> WidgetApp.tsx
  | - mini overlay window: floating.html -> FloatingApp.tsx
  | - main dashboard window: index.html -> App.tsx, created lazily by Tauri
  v
Tauri Rust layer
  |
  | native commands and events
  | - window positioning / overlay / private mode
  | - screen capture
  | - native mic/system audio capture
  | - Rust-owned Deepgram WebSocket STT
  v
Backend Express API
  |
  | REST + chunked streaming + SSE
  v
Session service
  |
  | Prisma writes and reads
  v
PostgreSQL

Session service
  |
  | BullMQ jobs and Redis memory/vector state
  v
Redis

Session service
  |
  | OpenRouter model calls
  v
OpenRouter

Frontend or Tauri Rust
  |
  | Deepgram realtime WebSocket
  v
Deepgram
```

## Main Runtime Components

| Component | Responsibility | Main files |
|---|---|---|
| Backend Express app | CORS, JSON parsing, Clerk auth, route mounting, error middleware | `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/routes/index.ts` |
| Backend session router/controller | HTTP API surface for create/activate/deactivate/heartbeat/events/AI answer/screen analysis/messages | `backend/src/features/session/session.router.ts`, `backend/src/features/session/session.controller.ts` |
| Backend session service | Session lifecycle, context building, AI prompts, streaming, persistence, memory jobs | `backend/src/features/session/session.service.ts` |
| Backend prompt builder | System/runtime/task prompt contract | `backend/src/shared/lib/prompt.ts` |
| Backend context/router services | Deterministic routing, live request sanitizer, follow-up binding, topic/intent policy | `backend/src/features/session/session-context-router.service.ts`, `backend/src/features/session/ai-answer-context-guards.ts`, `backend/src/features/session/answer-quality.ts`, `backend/src/features/session/answer-policy.ts`, `backend/src/features/session/state/live-request-sanitizer-v4.ts` |
| Backend memory/RAG | Redis session state, turn/topic/code/scenario memory, RAG indexing/retrieval | `backend/src/features/session/memory/*`, `backend/src/features/session/rag/*`, `backend/src/features/jobs/session-memory.job.ts`, `backend/src/features/jobs/session-rag.job.ts` |
| Backend queues | Redis/BullMQ queues and workers | `backend/src/features/jobs/queue.ts`, `backend/src/features/jobs/*.job.ts` |
| Frontend active session page | Full dashboard session UI, web STT, Tauri event listeners, overlay sync, AI answer dispatch | `frontend/src/pages/Sessions/ActiveSession/page.tsx` |
| Frontend floating session hook | Desktop mini overlay session runtime, Rust STT listeners, transcript persistence, AI answer dispatch | `frontend/src/features/session/hooks/useFloatingSession.ts` |
| Frontend AI chat hook | Builds `/ai-answer` payloads, streams responses into cards, handles screen analysis/custom queries/regenerate | `frontend/src/hooks/useAIChat.ts` |
| Frontend adaptive context | Builds `currentQuestion`, transcript window, speaker-separated transcript, previous AI answer metadata | `frontend/src/features/session/context/adaptiveAiContext.ts` |
| Frontend STT hooks | Browser Deepgram mic/tab audio and native display-audio bridge hooks | `frontend/src/hooks/useDeepgram.ts`, `frontend/src/hooks/useNativeTabTranscription.ts`, `frontend/src/hooks/useNativeAudio.ts` |
| Tauri Rust app | Window lifecycle, capture, audio commands, Deepgram native STT commands, event bridge | `frontend/src-tauri/src/lib.rs` |
| Tauri Deepgram module | Shared Rust WebSocket transport to Deepgram | `frontend/src-tauri/src/deepgram.rs` |

## Backend Application Architecture

### Server Bootstrap

Files:

- `backend/src/server.ts`
- `backend/src/app.ts`
- `backend/src/routes/index.ts`

Flow:

1. `server.ts` imports `createApp()` from `app.ts`.
2. `server.ts` creates an HTTP server and listens on `env.PORT`.
3. During startup it imports and keeps references to BullMQ workers:
   - `creditDeductionWorker`
   - `sessionWatchdogWorker`
   - `holdExpiryWorker`
   - `candidateDigestWorker`
   - `sessionMemoryWorker`
   - `sessionRagWorker`
   - `questionBankExtractionWorker`
4. `scheduleWatchdog()` schedules the recurring `session-watchdog` tick every 60 seconds.
5. `warmBrowser()` pre-warms Chromium for resume/PDF flows.
6. `validateAiConfig()` validates AI configuration.

Express middleware in `app.ts`:

1. `morgan("dev")`
2. CORS with configured origins plus Tauri origins:
   - `tauri://localhost`
   - `https://tauri.localhost`
3. `express.json()`
4. `express.urlencoded()`
5. static uploads from `/uploads`
6. `resolveUserId`
7. global Clerk middleware `clerkAuth`
8. `/api` router
9. global error middleware

Route mounting in `routes/index.ts`:

| Route prefix | Router |
|---|---|
| `/api/auth` | `authRouter` |
| `/api/resume` | `resumeRouter` |
| `/api/session` | `sessionRouter` |
| `/api/document` | `documentRouter` |
| `/api/qa` | `qaRouter` |
| `/api/company` | `companyRouter` |
| `/api/projects` | `projectsRouter` |
| `/api/credits` | `creditsRouter` |
| `/api/policy` | `policyRouter` |
| `/api/session-notes` | `sessionNotesRouter` |
| `/api/ask-ai` | `askAiRouter` |
| `/api/assistant` | `assistantRouter` |
| `/api/question-bank` | `questionBankRouter` |
| `/api/updates` | `updatesRouter` |
| `/api/health` | health check |

## Backend Session Module

### Session API Surface

File: `backend/src/features/session/session.router.ts`

| Method | Path | Controller | Purpose |
|---|---|---|---|
| `POST` | `/api/session/create-session` | `createSession` | Create PRE_CHECK session. |
| `GET` | `/api/session/list` | `listSessions` | List sessions by user. |
| `GET` | `/api/session/:id` | `getSession` | Load one session. Hides transcript/messages if `saveTranscription=false`. |
| `DELETE` | `/api/session/:id` | `deleteSession` | Delete allowed terminal/PRE_CHECK sessions. |
| `POST` | `/api/session/:id/activate` | `activateSession` | Move session to ACTIVE and compute paid credit cap. |
| `POST` | `/api/session/:id/deactivate` | `deactivateSession` | Move session to COMPLETING/COMPLETED and enqueue billing. |
| `POST` | `/api/session/:id/heartbeat` | `sessionHeartbeat` | 60 second active-session credit and liveness tick. |
| `GET` | `/api/session/:id/events` | `subscribeToEvents` | SSE channel for credit/session events. |
| `POST` | `/api/session/:id/analyze-screen` | `analyzeScreen` | Upload screenshot and stream OpenRouter vision answer. |
| `POST` | `/api/session/:id/ai-answer` | `getAIAnswer` | Stream answer from transcript/manual query/context payload. |
| `POST` | `/api/session/:id/save-message` | `saveMessage` | Persist transcript/AI/user message. |
| `PATCH` | `/api/session/:id/transcript/:messageId` | `patchTranscriptMessage` | Persist edited transcript text. |
| `PATCH/GET/POST` | `/api/session/:sessionId/answers/:messageId...` | `post-session-answer.controller.ts` | Post-session answer editing/revisions. |
| `GET/POST` | `/api/session/:id/analytics...` | analytics controllers | Existing/generate session analytics. |

### Session Lifecycle

Primary file: `backend/src/features/session/session.service.ts`

#### Create Session

Function: `createSession(data)`

What happens:

1. Enforces one open session per user by checking ACTIVE, PAUSED, DISCONNECTED.
2. Resolves or creates `Company`.
3. Creates `Session` with status `PRE_CHECK`.
4. Stores session configuration:
   - resume/document IDs
   - language and simple language preference
   - extra context/instructions
   - auto-generate flag
   - save transcript flag
   - selected project IDs
   - question bank contribution opt-in
5. Enqueues candidate digest warmup through `enqueueCandidateDigestWarmup`.

#### Activate Session

Function: `activateSession(id, settings)`

What happens:

1. Loads session.
2. Allows idempotent ACTIVE reconnect.
3. Allows `PRE_CHECK -> ACTIVE` and `DISCONNECTED -> ACTIVE`.
4. For paid sessions, reads `UserCreditBalance`.
5. Calls `creditsService.computeMaxAllowedMinutes`.
6. Updates session in a Prisma transaction:
   - `status=ACTIVE`
   - `startedAt` if first activation
   - `lastHeartbeatAt`
   - `maxAllowedMinutes`
   - `bracketConfigSnapshot`
   - clears `disconnectedAt`

#### Heartbeat

Controller: `sessionHeartbeat` in `session.controller.ts`

What happens every 60 seconds from frontend:

1. Load session.
2. If not ACTIVE, return `action: "NONE"`.
3. Update `lastHeartbeatAt`.
4. Compute backend elapsed active minutes from `startedAt` minus paused duration.
5. Compare against `maxAllowedMinutes`.
6. If exhausted:
   - call `creditExhaustionClose`
   - return `CREDIT_EXHAUSTED`
7. If close to cap:
   - send SSE `CREDIT_WARNING`
   - return `CREDIT_WARNING`

#### Deactivate Session

Function: `deactivateSession(id, aiUsage, transcript)`

What happens:

1. Validates session state.
2. Transitions open sessions to `COMPLETING`.
3. Flushes transcript snapshot when transcript saving is enabled.
4. If paid session has bracket snapshot, enqueue `credit-deduction`.
5. If free session, marks `COMPLETED` synchronously.
6. Enqueues question-bank extraction when transcript saving is enabled.

#### Credit Exhaustion Close

Function: `creditExhaustionClose(sessionId, dbUserId)`

What happens:

1. `ACTIVE -> CREDIT_EXHAUSTED`.
2. Stamps `endedAt` and `creditExhaustedAt`.
3. Flushes transcript.
4. Sends SSE `SESSION_CLOSED` with reason `CREDIT_EXHAUSTED`.
5. Enqueues `credit-deduction` with `isExhausted=true`.

## Prisma/PostgreSQL Data Model

Schema file: `backend/prisma/schema.prisma`

Primary session models:

| Model | Purpose |
|---|---|
| `Session` | Session lifecycle/config/timing/credit state plus legacy `messages` and `transcript` JSON arrays. |
| `TranscriptChunk` | Durable normalized transcript chunks and AI assistant turns. Used by memory/RAG/composer. |
| `QA` | Stored question/answer record per generated answer. |
| `SessionAIAnswerLedger` | Authoritative ledger of streamed/saved AI answers. Used to recover latest successful answer for follow-ups. |
| `SessionAnswerRevision` | Post-session answer edit history. |
| `SessionFeedback` | Session analytics/feedback. |
| `SessionNotes` | Post-session notes. |
| `SessionTopicMemory` | Durable topic memory. |
| `SessionTurnMemory` | Durable turn memory. |
| `CandidateContextDigest` | Candidate digest for session context. |

Important `Session` fields:

| Field | Meaning |
|---|---|
| `status` | `PRE_CHECK`, `ACTIVE`, `PAUSED`, `DISCONNECTED`, `COMPLETING`, `COMPLETED`, `ABANDONED`, `FORCE_ENDED`, `CREDIT_EXHAUSTED`, `AUTO_ENDED`. |
| `startedAt`, `endedAt`, `durationSeconds` | Timing and billing duration. |
| `lastHeartbeatAt`, `disconnectedAt` | Watchdog liveness tracking. |
| `maxAllowedMinutes`, `bracketConfigSnapshot`, `creditsDeducted`, `deductionReason` | Credit billing state. |
| `saveTranscription` | If false, message/transcript persistence is skipped or cleared at finalization. |
| `messages`, `transcript` | Legacy JSON arrays. Newer durable memory uses `TranscriptChunk`. |
| `projectIds`, `primaryProjectId` | Selected project context. |

Important `SessionAIAnswerLedger` fields:

| Field | Meaning |
|---|---|
| `question` | Question answered by the AI card. |
| `answerText` | Generated answer text. |
| `topic` | Derived topic. |
| `intent` | Request kind/intent. |
| `answerStatus` | `STREAMED`, `SAVED`, `SKIPPED`, `FAILED`, `STREAMED_VALID_SAVE_FAILED`. |
| `messageId`, `qaId` | Links to persisted message/QA when available. |
| `failureReason` | Why a streamed answer could not be saved. |

## Redis and BullMQ

Redis connection file:

- `backend/src/features/jobs/queue.ts`

Queues:

| Queue | Producer/Worker | Purpose |
|---|---|---|
| `credit-deduction` | `creditDeductionQueue`, `credit-deduction.job.ts` | Deduct credits and finalize session billing. |
| `session-watchdog` | `sessionWatchdogQueue`, `session-watchdog.job.ts` | Recurring liveness and credit safety checks. |
| `hold-expiry` | `holdExpiryQueue`, `hold-expiry.job.ts` | PRE_CHECK hold cleanup. |
| `candidate-digest` | `candidateDigestQueue`, `candidate-digest.job.ts` | Warm candidate profile digest. |
| `session-memory` | `sessionMemoryQueue`, `session-memory.job.ts` | Update session state, trusted answers, scenarios, code tasks in Redis. |
| `session-rag` | `sessionRagQueue`, `session-rag.job.ts` | Index transcript/QA/memory docs and question vectors. |
| `question-bank-extraction` | `question-bank-extraction.queue.ts`, `question-bank-extraction.job.ts` | Extract reusable question bank items from completed sessions. |

Redis memory/state files:

| File | Purpose |
|---|---|
| `backend/src/features/session/memory/session-memory-v3.service.ts` | Reads/writes Redis `SessionMemoryV3` with 6 hour TTL. |
| `backend/src/features/session/state/session-state-v3.service.ts` | Reads/writes Redis `SessionStateV3` with 6 hour TTL. |
| `backend/src/features/session/question-composer.service.ts` | Redis intent ledger, answer ledger, active answer plan, composer debounce/lock. |
| `backend/src/features/session/rag/redis-vector-store.service.ts` | Redis-backed memory documents and question embeddings with 24 hour TTL. |

Redis is not the final source of truth for session records. PostgreSQL/Prisma is the durable source of truth. Redis is used for:

- BullMQ job transport
- temporary session memory
- intent and answer ledgers
- active answer plan
- RAG/vector cache
- debouncing and locking composer work

## Real-Time Transports

| Transport | Where | Purpose |
|---|---|---|
| HTTP JSON | Frontend -> backend | CRUD/session lifecycle/message save. |
| HTTP chunked streaming | Backend -> frontend | `/ai-answer` and `/analyze-screen` stream plain text chunks. |
| SSE | Backend -> frontend | `/api/session/:id/events` for `CREDIT_WARNING` and `SESSION_CLOSED`. |
| Browser WebSocket | Frontend -> Deepgram | `useDeepgram.ts` sends WebM/Opus mic/tab audio directly to Deepgram. |
| Rust WebSocket to Deepgram | Tauri Rust -> Deepgram | `deepgram.rs` owns native Deepgram STT sessions and emits Tauri events. |
| Localhost WebSocket | Tauri Rust -> frontend | `start_audio_stream` and `start_display_audio_stream` expose PCM over localhost for JS-owned Deepgram paths. |
| Tauri event bus | Rust/windows <-> frontend windows | `session-init`, `stt:*`, `overlay-*`, auth/private-mode/window events. |

There is no backend WebSocket used for session realtime events. The backend realtime channel is SSE.

## AI Answer Flow

Primary frontend files:

- `frontend/src/hooks/useAIChat.ts`
- `frontend/src/features/session/context/adaptiveAiContext.ts`
- `frontend/src/pages/Sessions/ActiveSession/page.tsx`
- `frontend/src/features/session/hooks/useFloatingSession.ts`

Primary backend files:

- `backend/src/features/session/session.controller.ts`
- `backend/src/features/session/session.service.ts`
- `backend/src/features/session/ai-answer.dto.ts`
- `backend/src/features/session/session-context-router.service.ts`
- `backend/src/features/session/ai-answer-context-guards.ts`
- `backend/src/features/session/answer-quality.ts`
- `backend/src/features/session/answer-policy.ts`
- `backend/src/shared/lib/prompt.ts`

### Frontend Request Assembly

`useAIChat.ts` handles:

1. Placeholder AI card creation.
2. Request ID creation.
3. Latest successful AI answer context:
   - `previousAiAnswer`
   - `previousAiAnswers`
   - `previousCodeBlocks`
   - `latestAnswerId`
   - `latestAnswerQuestion`
   - `latestAnswerText`
   - `latestAnswerTopic`
4. Manual query type classification:
   - `full_question`
   - `short_followup`
   - `command`
   - `unknown`
5. Payload sanitization through `sanitizeAIAnswerPayload`.
6. `POST /api/session/:id/ai-answer`.
7. Streaming response parsing with `consumeSegmentedStream`.
8. Splitting multiple AI response cards on `===NEXT_QUESTION===`.
9. Handling backend sentinels:
   - `===NO_NEW_QUESTION===`
   - `===QUESTION_META=...===`
   - `===SNAPSHOT_ID=...===`

`adaptiveAiContext.ts` builds:

- current question from recent transcript
- recent transcript window
- speaker-separated transcript
- previous AI answer list
- latest previous answer/code blocks

It has time-window logic to reduce old answered-question pollution.

### Backend `/ai-answer` Controller

File: `backend/src/features/session/session.controller.ts`

`getAIAnswer` does:

1. Normalize body using `normalizeAIAnswerRequestBody`.
2. Acquire in-flight lock through `acquireInFlight`.
3. Validate transcript evidence or snapshot ID.
4. Log raw and normalized request in development.
5. Call `sessionService.getAIAnswer`.
6. Set streaming headers:
   - `Content-Type: text/plain; charset=utf-8`
   - `Transfer-Encoding: chunked`
   - `X-Accel-Buffering: no`
7. Stream each `chunk.text` to the response.
8. Release in-flight lock in `finally`.

### Backend AI Answer Service Pipeline

Function: `getAIAnswer` in `backend/src/features/session/session.service.ts`

Current deterministic-first pipeline:

1. Load session with company/user/context fields.
2. Start loading live answer history from durable transcript chunks/messages.
3. For non-regenerate requests:
   - read Redis intent ledger
   - read Redis answer ledger
   - read latest successful AI answer from `SessionAIAnswerLedger`
   - rebuild Redis ledgers from durable state if empty
4. Build transcript evidence using `buildTranscriptEvidenceV3`.
5. Sanitize request with `sanitizeLiveRequestContext`.
6. Resolve clean final question with `resolveCleanQuestionForContext`.
7. Normalize transcript/question text.
8. Convert history to answer history with `toAnswerHistory`.
9. If DB latest answer is missing, try backend memory fallback.
10. Route request with `routeAIAnswerSessionContext`.
11. For short follow-ups, bind to exactly one latest successful answer when available.
12. Read/build `SessionStateV3`.
13. Route context with `routeAnswerContextV3`.
14. Build optimized CIE context with `buildOptimizedContext`.
15. Guard current question with `guardCurrentQuestion`.
16. Classify conversation intent with `classifyConversationIntent`.
17. Resolve follow-up target with `resolveFollowupTarget`.
18. Build deterministic AI session decision with `fallbackAISessionDecision`.
19. Build effective metadata with `buildEffectiveLiveContextMetadata`.
20. Build request-scoped answer policy with `buildRequestScopedPolicy`.
21. Retrieve RAG evidence with `retrieveSessionSupportingEvidence`.
22. Apply context router with `applyContextRouterV3`.
23. Build:
   - system prompt via `buildSystemMessage`
   - runtime context via `buildAnswerRuntimeContext`
   - task prompt via `buildActiveTaskV3`
24. Call OpenRouter with `ai.callModel`.
25. Return `processAIStream`.

### Prompt Contract

File: `backend/src/shared/lib/prompt.ts`

The active-task prompt includes hard sections:

```text
TARGET_QUESTION:
BOUND_PREVIOUS_ANSWER:
EVIDENCE_ONLY_TRANSCRIPT:
```

The intent is:

- `TARGET_QUESTION` is the final question to answer.
- `BOUND_PREVIOUS_ANSWER` is the only previous answer anchor for follow-up continuity.
- `EVIDENCE_ONLY_TRANSCRIPT` is evidence only, not a raw merged question source.

### Stream Post-Processing

Function: `processAIStream` in `backend/src/features/session/session.service.ts`

After streaming completes:

1. Extracts generated question/answer pairs from model output.
2. Filters persistable answer pairs with `selectPersistableAnswerPairs`.
3. Validates each answer with `validateAnswerForMemory`.
4. For invalid answers:
   - writes `SessionAIAnswerLedger` with `SKIPPED`
5. For valid non-regenerate answers:
   - creates `SessionAIAnswerLedger` with `STREAMED`
   - creates `QA`
   - optionally creates generation snapshot
   - appends AI assistant message through `appendMessage`
   - marks ledger `SAVED` if append succeeds
   - marks ledger `STREAMED_VALID_SAVE_FAILED` if streaming was valid but persistence failed
6. Writes turn/topic memory.
7. Records answer in Redis ledgers.
8. Enqueues:
   - `session-memory` memory update
   - `session-rag` QA summary indexing
   - code-task memory update when request kind is code-related
   - scenario memory update when request kind is scenario

## Short Follow-Up Binding

Files:

- `backend/src/features/session/short-followup.ts`
- `backend/src/features/session/session-context-router.service.ts`
- `backend/src/features/session/session.service.ts`
- `frontend/src/types/ai-answer.ts`
- `frontend/src/hooks/useAIChat.ts`

Short follow-up commands include:

```text
example
explain
explain it
give example
give me example
show example
more
why
how
continue
elaborate
```

Behavior:

1. Frontend always sends latest successful AI answer metadata.
2. Backend treats PostgreSQL `SessionAIAnswerLedger` as authoritative.
3. If the current question is a short command and no selected answer exists:
   - bind to exactly one latest successful answer
   - set request kind to follow-up path
   - do not merge multiple previous questions
4. Frontend metadata is fallback only when backend persistence has not caught up.
5. Bare `example` is not classified as code generation unless explicit code-writing keywords exist.
6. React hooks (`useEffect`, `useRef`, `useState`, `useMemo`, `useCallback`) derive topic `react`.

## Screen Analysis Flow

Frontend:

- `frontend/src/hooks/useAIChat.ts`
- `frontend/src/pages/Sessions/ActiveSession/page.tsx`

Backend:

- `backend/src/features/session/session.controller.ts`
- `backend/src/features/session/session.service.ts`

Flow:

1. User clicks Analyze Screen in main UI or overlay.
2. Frontend captures screenshot:
   - Tauri path can invoke `capture_screen`.
   - Browser path can use screen capture utilities.
3. Frontend sends multipart request to:
   - `POST /api/session/:id/analyze-screen`
4. Backend compresses image with `sharp` unless already small JPEG.
5. Backend builds screen context with `buildOptimizedContext`.
6. Backend builds screen prompts:
   - `buildScreenSystemMessage`
   - `buildRuntimeContextMessage`
   - `buildScreenAnalysisMessage`
7. Backend sends image data URL to OpenRouter vision model.
8. Backend streams the model answer as plain text.
9. Same `processAIStream` post-processing persists valid generated answers.

## Transcript and Message Persistence

Primary function:

- `appendMessage` in `backend/src/features/session/session.service.ts`

When a message is saved:

1. Load session and check `saveTranscription`.
2. If `saveTranscription=false`, skip persistence and return `saved=false`.
3. Create `TranscriptChunk`.
4. Enqueue session-memory job.
5. Enqueue session-rag document indexing.
6. If interviewer question, enqueue question vector indexing.
7. Append segmenter memory.
8. Schedule legacy transcript JSON flush.

Frontend save paths:

- Web active session page saves final transcript chunks through `/save-message` when `saveTranscriptEnabled` and not Tauri.
- Floating Tauri session hook saves transcript chunks itself.
- Manual custom query saves a `USER` message before asking AI.
- Transcript edits call `PATCH /api/session/:id/transcript/:messageId`.

## Frontend Session Architecture

### Active Session Page

File: `frontend/src/pages/Sessions/ActiveSession/page.tsx`

Responsibilities:

- Active dashboard session UI.
- Transcript state for `User` and `Interviewer`.
- Browser mic STT through `useDeepgram`.
- Browser tab/window audio STT through `useDeepgram(inputStream)`.
- Tauri STT event listeners for `stt:mic` and `stt:system-audio`.
- AI Answer button and auto-answer flow.
- Screen analysis flow.
- Session heartbeat.
- SSE listener.
- Overlay open/sync events.
- Transcript patching.
- End-session dialog and deactivation.

Important hooks used:

| Hook | Purpose |
|---|---|
| `useDeepgram` | Browser mic or browser MediaStream audio -> Deepgram. |
| `useNativeTabTranscription` | Local Rust PCM WebSocket -> JS Deepgram path, currently a separate/native bridge path. |
| `useAIChat` | AI answer/screen/custom/regenerate streaming. |
| `useSessionHeartbeat` | Calls backend heartbeat every 60 seconds. |
| `useSessionEvents` | Opens SSE EventSource. |
| `useScreenShare` | Browser screen/tab capture. |

### Floating Mini Session

Main files:

- `frontend/src/pages/Sessions/ActiveSession/FloatingApp.tsx`
- `frontend/src/features/session/hooks/useFloatingSession.ts`
- `frontend/src/features/session/slices/floatingSessionSlice.ts`
- `frontend/src/features/session/selectors/floatingSessionSelectors.ts`

Responsibilities:

- Runs inside `floating.html` / Tauri `mini` window.
- Owns a separate Redux slice because launcher, mini, and main are separate JS contexts.
- Listens for `session-init`.
- Stores session init payload in `sessionStorage` for HMR/reload recovery.
- Starts system audio STT after `captureArmed`.
- Listens to Rust-native STT events:
  - `stt:system-audio`
  - `stt:status:system`
  - `stt:health:system`
  - `stt:mic`
  - `stt:status:mic`
- Deduplicates and merges transcript chunks.
- Saves transcript messages to backend.
- Builds adaptive AI context.
- Calls `useAIChat.handleAiAnswer`.
- Handles screen analysis from overlay.
- Runs heartbeat and SSE listeners.
- Ends session through `endSessionThunk`.

## Tauri Desktop Window Architecture

Config file:

- `frontend/src-tauri/tauri.conf.json`

Declared windows:

| Window label | HTML entry | Purpose |
|---|---|---|
| `launcher` | `launcher.html` | Always-visible floating widget. |
| `mini` | `floating.html` | Active session overlay/floating UI. |

The `main` dashboard window is not declared in `tauri.conf.json`. It is created lazily by:

- `open_main_dashboard` in `frontend/src-tauri/src/lib.rs`

### Tauri Window Commands

File: `frontend/src-tauri/src/lib.rs`

| Command | Purpose |
|---|---|
| `show_launcher_widget` | Expands launcher to fullscreen transparent host and positions widget in React. |
| `show_mini_top_center` | Creates/shows fullscreen transparent mini overlay host. |
| `open_main_dashboard` | Lazily creates or navigates main dashboard window. |
| `handle_launcher_click` | Brings launcher or mini forward depending on active session state. |
| `set_session_active` | Tracks global native session-active state and stops all audio when false. |
| `stop_all_audio_transcription` | Stops mic/system/display/native audio paths. |
| `toggle_content_protection` | Enables/disables OS-level content protection for private mode. |
| `capture_screen` | Captures current screen, temporarily hides/protects app windows, resizes and JPEG-encodes output. |
| `set_cursor_passthrough` | Toggles click-through behavior for overlay windows. |
| `get_cursor_position` | Gets global cursor position. |

### Overlay Window Policy

Tauri/Rust code applies OS-specific policies:

- macOS:
  - uses `NSApplication` and `NSWindow` APIs
  - sets high window level
  - joins all spaces
  - keeps overlay stationary
  - uses `orderFrontRegardless` for passive mini overlay so it does not steal focus
- Windows:
  - uses main-thread window operations for topmost/pin/border removal
  - installs subclass procedure for transparent hit testing
- Linux:
  - uses Tauri window APIs directly

The mini and launcher windows are fullscreen transparent host windows. React positions the visible card/UI inside them. This avoids OS clipping for popovers and menus.

## Tauri Event Architecture

Frontend service:

- `frontend/src/services/tauriEvents.ts`

Common events:

| Event | Direction | Meaning |
|---|---|---|
| `session-init` | main/launcher -> mini | Start or hydrate floating session. |
| `session-init-ack` | mini -> sender | Acknowledge session-init received. |
| `overlay-update` | main -> mini | Send transcript/status/model/timer to overlay. |
| `overlay-ai-response` | main -> mini | Send streamed AI answer state to overlay. |
| `overlay-ai-answer` | mini -> main | Trigger AI Answer from overlay. |
| `overlay-analyze-screen` | mini -> main | Trigger Analyze Screen from overlay. |
| `overlay-ai-query` | mini -> main | Send manual query from overlay. |
| `overlay-model-change` | mini -> main | Change model. |
| `overlay-toggle-mic` | mini -> main | Toggle mic. |
| `overlay-clear-transcript` | mini -> main | Clear transcript. |
| `auth:state-changed` | Rust/frontend | Cross-window auth sync. |
| `overlay:private-mode-changed` | any window -> all | Private mode setting sync. |

Rust-native STT events:

| Event | Source | Meaning |
|---|---|---|
| `stt:system-audio` | Rust Deepgram session | Interviewer/system audio transcript payload. |
| `stt:mic` | Rust Deepgram session | User/microphone transcript payload. |
| `stt:status:system` | Rust Deepgram session | system STT lifecycle status. |
| `stt:status:mic` | Rust Deepgram session | mic STT lifecycle status. |
| `stt:health:system` | Rust system capture | system capture health and PCM counters. |

## STT Architecture

There are multiple STT paths in the codebase.

### Path A: Browser/Web Deepgram

File:

- `frontend/src/hooks/useDeepgram.ts`

Used by:

- `frontend/src/pages/Sessions/ActiveSession/page.tsx`

Flow:

```text
Browser getUserMedia mic or getDisplayMedia audio
  -> MediaRecorder WebM/Opus chunks
  -> Browser WebSocket to Deepgram
  -> Deepgram Results frames
  -> onTranscript(text, isFinal)
  -> ActiveSession.handleTranscript
  -> frontend transcript state
  -> optional /save-message
```

Important behavior:

- Selects preferred mic device.
- Caches mic stream to avoid repeated permission prompts.
- Sends Deepgram KeepAlive every 8 seconds.
- Retries abnormal WebSocket closes with exponential backoff.
- Uses WebSocket subprotocol auth: `["token", apiKey]`.
- Uses `nova-3` by default.
- Adds `keyterm` parameters for Nova 3.

### Path B: Rust-Native Deepgram STT

Files:

- `frontend/src-tauri/src/lib.rs`
- `frontend/src-tauri/src/deepgram.rs`
- `frontend/src/features/session/hooks/useFloatingSession.ts`
- `frontend/src/pages/Sessions/ActiveSession/page.tsx`

Flow:

```text
macOS ScreenCaptureKit system audio or CPAL mic
  -> Rust PCM broadcast channel
  -> Rust-owned Deepgram WebSocket in deepgram.rs
  -> Tauri event stt:system-audio or stt:mic
  -> Floating/main window listener
  -> transcript state
  -> backend /save-message and /ai-answer
```

Rust commands:

| Command | Platform | Purpose |
|---|---|---|
| `start_system_audio_transcription` | macOS/Windows | Native system audio capture -> Rust Deepgram. |
| `stop_system_audio_transcription` | macOS/Windows | Stop system STT. |
| `start_mic_transcription` | macOS/Windows | Native mic capture -> Rust Deepgram. |
| `stop_mic_transcription` | macOS/Windows | Stop mic STT. |

The Rust Deepgram module:

- validates model/language/sample rate/channels/API key
- builds a proper WebSocket handshake with `IntoClientRequest`
- adds `Authorization: Token <key>`
- forwards PCM frames to Deepgram
- sends Deepgram KeepAlive
- parses transcript results
- emits Tauri transcript/status events
- resets running flags on stop/error

### Path C: Rust Localhost PCM Bridge to JS Deepgram

Files:

- `frontend/src-tauri/src/lib.rs`
- `frontend/src/hooks/useNativeAudio.ts`
- `frontend/src/hooks/useNativeTabTranscription.ts`

Flow variants:

```text
Rust CPAL input
  -> local axum WebSocket ws://127.0.0.1:{port}
  -> frontend converts PCM to MediaStream
  -> useDeepgram
```

or:

```text
Rust ScreenCaptureKit display audio
  -> local axum WebSocket ws://127.0.0.1:{port}
  -> frontend forwards linear16 PCM to Deepgram WebSocket
```

Commands:

| Command | Purpose |
|---|---|
| `start_audio_stream` | Start CPAL input stream and expose PCM on localhost WebSocket. |
| `stop_audio_stream` | Stop CPAL local PCM stream. |
| `start_display_audio_stream` | Start display/system audio stream and expose PCM on localhost WebSocket. |
| `stop_display_audio_stream` | Stop display/system local PCM stream. |

This path still exists, but the floating mini session primarily uses Rust-native Deepgram STT (`start_system_audio_transcription` and `start_mic_transcription`) so the webview does not own raw audio or the Deepgram socket in the main desktop overlay path.

### Backend Transcribe Endpoint

File:

- `backend/src/features/session/session.service.ts`

Function:

- `transcribe(file)`

Current state:

- The backend transcribe function is a placeholder returning `"Transcription placeholder (restored)"`.
- Live STT is currently handled on frontend/Tauri through Deepgram, not by backend audio upload transcription.

## Transcript Processing

Frontend transcript normalization:

- `frontend/src/features/session/transcript/stt-normalizer.ts`
- `frontend/src/pages/Sessions/ActiveSession/page.tsx`
- `frontend/src/features/session/hooks/useFloatingSession.ts`

Frontend processing includes:

- Deepgram interim/final transcript handling
- dedupe repeated chunks
- overlap removal for system audio
- cross-source echo suppression between mic and system audio
- stable transcript IDs
- auto-answer debounce/freeze windows
- multi-question segmentation
- active question detection
- adaptive context windows

Backend transcript processing includes:

- `backend/src/features/session/transcript-normalizer.service.ts`
- `backend/src/features/session/ai-answer-context-guards.ts`
- `backend/src/features/session/question-composer.service.ts`
- `backend/src/features/session/ai-answer-segmenter.service.ts`
- `backend/src/features/session/transcript/scenario-evidence-builder.ts`

Backend responsibilities:

- normalize noisy STT
- build transcript evidence
- detect scenarios
- avoid raw transcript merging into prompt target question
- preserve evidence-only transcript separately
- build intent and answer ledgers
- append transcript memory
- index transcript and QA into RAG

## Auto Answer Flow

Main active page:

- `frontend/src/pages/Sessions/ActiveSession/page.tsx`

Flow:

1. Final interviewer chunks arrive from STT.
2. `handleTranscript("Interviewer", text, true)` appends transcript state.
3. If `autoGenerateResponse` is enabled:
   - chunk is pushed into `pendingTranscriptRef`
   - transcript stabilizer receives joined text
4. Stabilizer waits for freeze window.
5. `handleStableTranscript` classifies transcript.
6. `shouldTriggerGeneration` decides whether to call AI.
7. `buildAdaptiveAiContext` builds payload context.
8. `handleAiAnswer` sends `/ai-answer`.

Floating overlay:

- `frontend/src/features/session/hooks/useFloatingSession.ts`

The floating path follows the same conceptual flow but runs in the mini window with Redux-backed state and Rust-native STT event listeners.

## Manual AI Answer Button Flow

Main active page and floating overlay both build a snapshot before dispatch.

Important frontend files:

- `frontend/src/pages/Sessions/ActiveSession/page.tsx`
- `frontend/src/features/session/hooks/useFloatingSession.ts`
- `frontend/src/hooks/useAIChat.ts`

Flow:

1. User clicks AI Answer.
2. Frontend freezes a transcript snapshot.
3. Active question detector tries to resolve current question.
4. If confidence is low, explicit click fallback sends raw/recent transcript evidence to backend composer.
5. `buildAdaptiveAiContext` creates:
   - `currentQuestion`
   - `recentTranscriptWindow`
   - `speakerSeparatedTranscript`
   - previous AI answer metadata
6. `useAIChat.handleAiAnswer` adds latest AI answer metadata and request ID.
7. Backend deterministic router decides request kind and context binding.
8. Backend streams answer.
9. Frontend updates AI answer card incrementally.

## Manual Custom Query Flow

File:

- `frontend/src/hooks/useAIChat.ts`

Flow:

1. User types a custom query.
2. Frontend saves user query to backend through `/save-message`.
3. Frontend builds prior AI answer context and transcript window.
4. Frontend classifies `manualQueryType`.
5. Frontend calls `/ai-answer` with `isCustomQuery=true`.
6. Backend treats short follow-up commands as follow-ups when appropriate.

## Regenerate Flow

Files:

- `frontend/src/hooks/useAIChat.ts`
- `backend/src/features/session/session.service.ts`
- `backend/src/features/session/cie.service.ts`

Flow:

1. Frontend selects existing AI card.
2. Frontend sends regenerate payload with snapshot/selected answer context.
3. Backend loads `AnswerGenerationSnapshot` when `snapshotId` exists.
4. Backend reuses original question and stored selected context.
5. Backend streams new answer.
6. Backend updates the target message answer for regenerate.

## Billing and Session Closure

Frontend:

- `frontend/src/hooks/useSessionHeartbeat.ts`
- `frontend/src/hooks/useSessionEvents.ts`

Backend:

- `backend/src/features/session/session.controller.ts`
- `backend/src/features/session/session.service.ts`
- `backend/src/features/jobs/credit-deduction.job.ts`
- `backend/src/features/jobs/session-watchdog.job.ts`

Flow:

1. Frontend heartbeat posts every 60 seconds.
2. Backend stamps `lastHeartbeatAt`.
3. Backend computes elapsed active minutes.
4. Backend returns:
   - `NONE`
   - `CREDIT_WARNING`
   - `CREDIT_EXHAUSTED`
5. SSE also sends:
   - `CREDIT_WARNING`
   - `SESSION_CLOSED`
6. On deactivation or exhaustion, `credit-deduction` worker:
   - calculates active duration
   - deducts credits
   - sets final status
   - clears transcript/messages if `saveTranscription=false`
   - enqueues question-bank extraction when allowed
7. Watchdog:
   - marks stale ACTIVE/PAUSED sessions `DISCONNECTED`
   - auto-ends long disconnected sessions as `AUTO_ENDED`
   - enforces credit exhaustion as a safety net

## Persistence Rules

| Setting/condition | Behavior |
|---|---|
| `saveTranscription=true` | Persist transcript chunks, messages, QA, AI answer cards, memory/RAG. |
| `saveTranscription=false` | Skip transcript/message persistence or clear at final status. |
| AI answer streamed but invalid | Create ledger row as `SKIPPED`. |
| AI answer streamed and valid but save failed | Mark ledger `STREAMED_VALID_SAVE_FAILED`. |
| AI answer saved | Mark ledger `SAVED`; latest successful answer can bind future short follow-ups. |
| Tauri mini active | Mini/floating hook owns transcript persistence to avoid duplicate saves from main window. |

## API and Transport Summary

```text
Session creation:
frontend -> POST /api/session/create-session -> Prisma Session PRE_CHECK

Activation:
frontend -> POST /api/session/:id/activate -> Prisma ACTIVE + credit cap

Transcript save:
frontend -> POST /api/session/:id/save-message -> TranscriptChunk + Redis jobs

AI answer:
frontend -> POST /api/session/:id/ai-answer
backend -> OpenRouter
backend -> chunked text stream
backend post-process -> QA + TranscriptChunk + SessionAIAnswerLedger + Redis jobs

Screen analysis:
frontend/Tauri -> screenshot Blob
frontend -> POST /api/session/:id/analyze-screen
backend -> OpenRouter vision
backend -> chunked text stream

Credit/liveness:
frontend -> POST /api/session/:id/heartbeat every 60s
backend -> SSE /api/session/:id/events for warnings/closure

Desktop STT:
Tauri Rust -> Deepgram WebSocket
Rust -> Tauri event stt:system-audio/stt:mic
frontend -> transcript state -> backend save/AI answer

Web STT:
browser MediaRecorder -> Deepgram WebSocket
frontend -> transcript state -> backend save/AI answer
```

## Known Current Boundaries and Gaps

1. Backend `/transcribe` is not the live STT path.
   - Current function returns a placeholder.
   - Live STT is browser/Tauri Deepgram.

2. There are multiple STT paths still present.
   - Browser JS-owned Deepgram path is active for web.
   - Rust-native Deepgram path is primary for the desktop floating session.
   - Rust-localhost PCM bridge path still exists and may be used by some native bridge hooks.

3. Backend session realtime is SSE, not WebSocket.
   - WebSockets are used for Deepgram and local audio bridge only.

4. Session memory is split by durability.
   - PostgreSQL is durable truth.
   - Redis is temporary memory, active planning, vectors, queues, locks, and ledgers.

5. Legacy JSON `Session.messages` and `Session.transcript` still exist.
   - Newer durable flow uses `TranscriptChunk`, QA, answer ledger, Redis state, and RAG.

6. The frontend has separate JS runtimes per Tauri window.
   - Launcher, mini, and main do not share React state.
   - Cross-window sync uses Tauri events and sometimes `sessionStorage`.

## Fast File Index

### Backend

| Topic | File |
|---|---|
| Express app | `backend/src/app.ts` |
| Server and worker startup | `backend/src/server.ts` |
| Route mount | `backend/src/routes/index.ts` |
| Session routes | `backend/src/features/session/session.router.ts` |
| Session controllers | `backend/src/features/session/session.controller.ts` |
| Main session service | `backend/src/features/session/session.service.ts` |
| AI answer DTO/sanitize | `backend/src/features/session/ai-answer.dto.ts` |
| Deterministic AI router | `backend/src/features/session/session-context-router.service.ts` |
| Short follow-up commands | `backend/src/features/session/short-followup.ts` |
| Answer quality/intent/topic | `backend/src/features/session/answer-quality.ts` |
| Answer policy | `backend/src/features/session/answer-policy.ts` |
| Live request guards | `backend/src/features/session/ai-answer-context-guards.ts` |
| Live request sanitizer | `backend/src/features/session/state/live-request-sanitizer-v4.ts` |
| Prompt builder | `backend/src/shared/lib/prompt.ts` |
| SSE manager | `backend/src/shared/lib/sse.ts` |
| Prisma schema | `backend/prisma/schema.prisma` |
| Redis queues | `backend/src/features/jobs/queue.ts` |
| Credit worker | `backend/src/features/jobs/credit-deduction.job.ts` |
| Watchdog worker | `backend/src/features/jobs/session-watchdog.job.ts` |
| Memory worker | `backend/src/features/jobs/session-memory.job.ts` |
| RAG worker | `backend/src/features/jobs/session-rag.job.ts` |
| Redis session memory | `backend/src/features/session/memory/session-memory-v3.service.ts` |
| Redis session state | `backend/src/features/session/state/session-state-v3.service.ts` |
| Redis vector store | `backend/src/features/session/rag/redis-vector-store.service.ts` |

### Frontend

| Topic | File |
|---|---|
| Active session page | `frontend/src/pages/Sessions/ActiveSession/page.tsx` |
| Floating mini app | `frontend/src/pages/Sessions/ActiveSession/FloatingApp.tsx` |
| Floating session runtime hook | `frontend/src/features/session/hooks/useFloatingSession.ts` |
| AI chat streaming hook | `frontend/src/hooks/useAIChat.ts` |
| Adaptive context builder | `frontend/src/features/session/context/adaptiveAiContext.ts` |
| AI answer payload types/sanitizer | `frontend/src/types/ai-answer.ts` |
| Browser Deepgram hook | `frontend/src/hooks/useDeepgram.ts` |
| Native tab transcription hook | `frontend/src/hooks/useNativeTabTranscription.ts` |
| Native audio bridge hook | `frontend/src/hooks/useNativeAudio.ts` |
| Audio lifecycle controller | `frontend/src/features/session/audio/audioSessionController.ts` |
| Session runtime guard | `frontend/src/features/session/runtime/sessionRuntime.ts` |
| Session SSE hook | `frontend/src/hooks/useSessionEvents.ts` |
| Session heartbeat hook | `frontend/src/hooks/useSessionHeartbeat.ts` |
| Tauri event wrapper | `frontend/src/services/tauriEvents.ts` |
| Tauri overlay wrapper | `frontend/src/services/tauriOverlay.ts` |
| Tauri config | `frontend/src-tauri/tauri.conf.json` |
| Tauri commands/app setup | `frontend/src-tauri/src/lib.rs` |
| Tauri Deepgram transport | `frontend/src-tauri/src/deepgram.rs` |
