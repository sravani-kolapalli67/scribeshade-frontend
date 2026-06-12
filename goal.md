Goal: Upgrade ScribeShade live AI answers to match or exceed Parakeet AI across answer quality, question understanding, architecture depth, follow-up handling, code reasoning, performance, token efficiency, markdown output, and interview realism.

Act like a senior 10+ year software architect and production engineer. Think deeply before changing code. Work with engineering discipline: understand the current system, identify the bottleneck, apply minimal but high-impact changes, validate with tests, and avoid creating parallel duplicate logic.

Before coding, fully understand the current ScribeShade session architecture:

* React active session page
* Tauri floating overlay and multi-window behavior
* Deepgram STT paths
* `useAIChat`
* `adaptiveAiContext`
* floating session hook
* backend `/ai-answer` pipeline
* context router
* live request sanitizer
* answer policy
* prompt builder
* OpenRouter streaming
* Prisma answer ledger
* Redis memory/RAG
* screen-analysis flow
* transcript persistence
* follow-up binding
* selected project / resume fallback behavior

Do not redesign the full platform. Improve the existing pipeline only. Reuse existing modules where possible. Do not create duplicate routers, duplicate memory layers, duplicate transcript classifiers, or conflicting prompt builders.

Core objective:
ScribeShade must behave like a real-time candidate-side interview intelligence engine, not a generic assistant. It must understand what the interviewer is asking from raw/noisy transcript input, handle incomplete or evolving questions, decide the best answerable intent, fetch only the right context, and answer as the candidate would answer in a real interview: accurate, confident, practical, technically deep, markdown-formatted, and grounded in available evidence.

Critical live-interview rule:
Whenever the user clicks AI Answer, ScribeShade must return a useful answer. Do not block the response just because static detection is uncertain, the transcript is partial, or the question is still forming. In a real interview, every second matters. The system must produce the best possible candidate-side answer from the available transcript, previous context, selected screen context, resume/project context, and session memory.

Important transcript-routing principle:
Do not rely only on static keyword checks, regex rules, or brittle transcript heuristics for understanding the interviewer’s question. Static checks may be used only as fast guards, cleanup steps, confidence signals, or safety fallbacks. The system must support AI-assisted transcript decisioning for ambiguous, noisy, partial, multi-question, follow-up, and project/context-sensitive cases while keeping cost, tokens, and latency as low as possible.

Main engineering goals:

1. Correct question understanding

The system must detect the real interviewer intent from noisy STT transcript.

It must correctly handle:

* filler words
* repeated transcript chunks
* incomplete questions
* questions still being spoken
* interviewer interruptions
* old answered questions
* stale `currentQuestion`
* stale selected answer/card metadata
* mixed user/interviewer transcript
* transcript pollution
* multiple questions in one transcript window
* vague follow-ups like “explain”, “example”, “continue”, “how”, “why”
* project-specific questions
* resume/experience questions
* system-design questions
* architecture questions
* coding questions
* code explanation questions
* debugging questions
* behavioral/scenario questions
* screen-analysis questions

Success condition:
The backend must resolve the best answerable `TARGET_QUESTION` or `TARGET_INTENT` before calling the final answer model. If the transcript is incomplete, the system should infer the most likely interview intent from available evidence and answer in a way that remains useful, grounded, and safe.

2. AI-assisted transcript decisioning

Improve transcript understanding using a hybrid decision system.

Rules:

* Static checks must not be the final source of truth for complex transcript understanding.
* Use deterministic logic for cheap cleanup, dedupe, transcript windowing, known sentinels, and safety guards.
* Use AI-based decisioning when transcript intent is ambiguous, noisy, partial, multi-question, follow-up-like, project-related, or likely polluted by old context.
* The AI decision step must be compact, bounded, and structured.
* The AI decision step should return machine-readable output such as:

  * resolved target question or target intent
  * request intent
  * confidence
  * whether it is a follow-up
  * bound previous answer ID when applicable
  * transcript evidence span used
  * context sources needed
  * whether the current click should answer using partial/evolving transcript context
* Keep this decision step low-token and low-latency.
* Do not pass full transcript history to the AI decision step.
* Use only the smallest recent transcript window plus compact previous-answer metadata.
* Apply timeout and fallback behavior so live streaming is not blocked.
* Cache or reuse decision outputs where safe.
* Run independent context fetches in parallel where possible.

Success condition:
ScribeShade must understand the best answerable interviewer intent using AI-level reasoning when static rules are insufficient, without making the live answer feel slow or expensive.

3. Always-answer AI Answer behavior

The AI Answer button must always produce a useful answer.

Rules:

* Do not suppress the answer because transcript detection confidence is low.
* Do not return empty/sentinel responses to the frontend.
* If the transcript contains a partial question, answer the likely intended question and keep the response adaptable.
* If the interviewer is mid-question, provide a useful structured answer based on the current available wording.
* If there are multiple possible interpretations, answer the most likely one and include a concise framing line.
* If the latest transcript is vague, use the nearest relevant interviewer context, previous answer ledger, project/resume context, or screen context.
* If the user clicks repeatedly while the question is still evolving, each click should produce or update toward the best current interpretation instead of failing or duplicating stale answers.

Success condition:
Every explicit AI Answer click results in a meaningful candidate-side response that helps the user in the live interview.

4. Multiple-click and evolving-question handling

Handle repeated AI Answer clicks during the same interviewer question.

Required behavior:

* Detect when multiple clicks belong to the same evolving interviewer question.
* Avoid creating duplicate answer cards with conflicting interpretations.
* Reuse or update the active answer plan when the transcript has only slightly changed.
* If the later transcript completes the question, prefer the fuller/latest transcript and generate a better answer.
* If an answer is already streaming, define clear behavior:

  * ignore duplicate clicks within a short debounce window, or
  * attach the newer transcript snapshot to the next generation, or
  * cancel/restart only when the new transcript materially changes the question.
* Do not bind a repeated click to stale selected-card context unless the user explicitly selected that card.
* Track request IDs, transcript snapshot IDs, target question hash, and active answer plan to avoid race conditions.
* Main window and Tauri floating overlay must behave consistently.

Success condition:
Repeated clicks during a real live question should improve answer accuracy or preserve the current useful answer, not cause missed answers, duplicate cards, wrong follow-ups, or stale context leakage.

5. Dynamic intent routing

Improve routing so every request is classified before prompt construction.

Required classifications:

* new standalone question
* follow-up to latest answer
* follow-up to explicitly selected answer
* project-related question
* resume/experience question
* system-design / architecture question
* code-generation question
* code-explanation question
* debugging / error-fix question
* behavioral / scenario question
* screen-analysis question
* clarification-style question
* partial/evolving interviewer question

Success condition:
The selected route must control context fetching, prompt policy, output format, memory binding, click behavior, and persistence behavior.

6. Follow-up correctness

Follow-up handling must be reliable.

Rules:

* If the interviewer asks a follow-up, bind it to exactly one previous answer/question.
* Use Prisma `SessionAIAnswerLedger` as the authoritative source.
* Use Redis answer ledger only as fast memory/cache.
* Use frontend latest-answer metadata only as safe fallback when backend persistence has not caught up.
* Do not merge multiple old answers.
* Do not use stale selected-card context unless the user explicitly triggered selected-answer follow-up mode.
* Short commands like “example”, “explain”, “continue”, “how”, and “why” must resolve to the correct latest successful answer.
* For ambiguous follow-ups, prefer AI-assisted decisioning over static keyword matching alone.

Success condition:
Follow-up answers must be grounded in the correct previous answer and must not accidentally answer an older or unrelated card.

7. Project and resume context handling

Improve candidate context selection.

Rules:

* If selected projects exist, use only relevant selected projects.
* If no selected projects exist, safely fall back to resume projects and candidate digest.
* If the question is project-related, fetch the most relevant project context only.
* If the question is resume/experience-related, fetch only relevant resume facts.
* Never invent company names, project names, years of experience, tools, metrics, responsibilities, or achievements.
* Use candidate-specific facts only from resume, selected projects, supporting documents, transcript evidence, session memory, or durable stored context.

Success condition:
Answers must feel personalized but never hallucinated.

8. Architecture and system-design quality

For architecture/system-design questions, produce answers better than Parakeet AI.

Every architecture answer must include:

* direct candidate-style opener
* high-level architecture explanation
* ASCII diagram in fenced `text`
* request/data flow
* component responsibilities
* API/backend design
* database choice
* cache strategy
* queue/background job strategy
* storage strategy where relevant
* scaling approach
* failure handling
* observability/logging
* security considerations
* tradeoffs
* candidate-style verbal explanation

Success condition:
Architecture answers must be interview-ready, structured, technically correct, and senior-engineer level.

9. Code answer quality

For coding, debugging, and implementation questions, answer like a senior engineer.

Required behavior:

* Understand the exact coding task before generating code.
* Explain the approach briefly before code.
* Produce clean, production-grade code.
* Use correct language/framework conventions.
* Avoid unnecessary complexity.
* Add edge-case handling where relevant.
* Mention time and space complexity when useful.
* For debugging questions, identify root cause first, then provide fix.
* For system code changes, prefer minimal safe patches over broad rewrites.
* Maintain type safety.
* Avoid breaking existing APIs.
* Avoid adding untested abstractions.

Success condition:
Code answers must be accurate, optimized, readable, and directly usable in production-style interviews.

10. Candidate-style answer behavior

The AI must answer as if the candidate is speaking in the interview.

The answer should be:

* practical
* confident
* human
* technically accurate
* concise but complete
* context-aware
* grounded in candidate profile
* not robotic
* not generic
* not written like documentation unless the interviewer asked for documentation
* not using “as an AI” language

Success condition:
The output should sound like a strong candidate explaining their thought process, not like a chatbot.

11. Markdown output contract

Every answer must use clean markdown.

Required format:

* short direct opening
* bullets where useful
* sections only when useful
* fenced code blocks for code
* fenced `text` blocks for diagrams
* no messy long paragraphs
* no unsupported claims
* no fake confidence
* no unnecessary headings
* no irrelevant theory

Success condition:
The answer must be easy to read instantly inside the live interview UI.

12. Performance targets

Maintain or improve response performance.

Targets:

* backend pre-model decision/context-building path should stay under 500ms wherever possible
* first streamed token should start under 1 second in normal conditions
* AI-assisted transcript decisioning must be lightweight, bounded, and used only where it adds value
* avoid blocking on slow RAG/memory calls when safe fallback exists
* avoid fetching full transcript, full resume, full projects, or irrelevant memory
* avoid duplicate prompt sections
* keep context compact and route-specific
* use parallel async fetching for independent context sources
* use timeouts and graceful fallbacks for expensive context fetches
* measure latency before and after changes

Success condition:
Quality must improve without making the live AI feel slower.

13. Token optimization

Improve prompt/context efficiency.

The model should receive only:

* final resolved `TARGET_QUESTION` or `TARGET_INTENT`
* correct request classification
* relevant transcript evidence
* correct bound previous answer for follow-ups
* relevant project/resume/supporting facts
* compact memory/RAG evidence
* answer policy for the current route
* no duplicate old transcript
* no stale selected-card context
* no irrelevant candidate data

Success condition:
Lower token usage while improving answer correctness and specificity.

14. Memory correctness

Memory must improve continuity without polluting answers.

Rules:

* PostgreSQL/Prisma remains durable truth.
* `SessionAIAnswerLedger` remains authoritative for previous AI answers.
* Redis memory/RAG is fast temporary context, not the only truth.
* Rebuild Redis ledgers from durable state when empty.
* Keep previous answer binding explicit.
* Do not let memory override the current target question.
* Do not let old transcript pollute new answers.

Success condition:
Memory improves follow-ups and continuity but never causes wrong-question answers.

15. Tauri and frontend consistency

Main active session and Tauri floating overlay must produce the same quality.

Rules:

* Ensure both paths send equivalent AI context.
* Ensure floating overlay does not lose previous answer metadata.
* Ensure Tauri transcript chunks are normalized like web chunks.
* Ensure screen-analysis/custom-query/regenerate flows remain consistent.
* Ensure separate Tauri JS runtimes do not cause stale or missing context.
* Ensure repeated AI Answer clicks behave the same in main dashboard and floating overlay.

Success condition:
The same transcript/question should produce equivalent answer quality in main dashboard and floating overlay.

16. Implementation rules

Work like a senior production engineer.

Required approach:

* First inspect existing code and architecture.
* Identify the real quality bottleneck before changing code.
* Prefer deterministic cleanup and safety checks, but do not rely only on static transcript checks for final understanding.
* Add AI-assisted transcript decisioning where it improves correctness.
* Keep AI decisioning compact, structured, timeout-safe, and low-token.
* Improve routing, context binding, click handling, and prompt policy together.
* Keep changes minimal and focused.
* Reuse existing files and services.
* Do not create duplicate implementations.
* Do not break public API contracts.
* Do not remove existing persistence or billing behavior.
* Do not add expensive synchronous work to the hot path.
* Add logs only where useful for debugging route/context/click decisions.
* Keep logs safe and avoid leaking sensitive candidate data.

17. Required validation tests

Add or update replay tests for:

* Parakeet benchmark transcripts
* current ScribeShade bad-output examples
* noisy STT transcripts
* wrong-question cases
* stale selected-card cases
* static-check failure cases
* ambiguous transcript cases requiring AI decisioning
* partial interviewer questions
* repeated AI Answer clicks during one evolving question
* repeated AI Answer clicks while an answer is already streaming
* short follow-ups
* explicit selected-answer follow-ups
* project-related questions
* no-selected-project resume fallback
* resume/experience questions
* architecture/system-design questions
* coding questions
* code-explanation questions
* debugging questions
* behavioral/scenario questions
* screen-analysis questions
* Tauri overlay AI answer flow
* main active session AI answer flow

18. Required measurements

Validation must include:

* before/after answer comparison
* expected target question vs resolved target question/intent
* route classification result
* AI decision result where used
* click behavior result for repeated clicks
* context sources used
* token count comparison
* backend pre-model latency
* first-token streaming latency
* hallucination check
* markdown format check
* follow-up binding correctness
* project/resume grounding correctness

19. Completion requirements

Before marking complete, provide:

* exact files changed
* explanation of routing improvements
* explanation of AI-assisted transcript decisioning
* explanation of repeated-click/evolving-question handling
* explanation of memory/follow-up improvements
* explanation of prompt/context optimization
* explanation of performance improvements
* before/after output samples
* test evidence
* latency evidence
* token usage evidence
* type-check result
* test result
* build result
* honest remaining risks

Definition of done:
ScribeShade must always return a useful answer on explicit AI Answer click, understand partial and noisy interview questions with AI-assisted reasoning instead of brittle static-only checks, handle repeated clicks during evolving questions, bind follow-ups correctly, use the right candidate/project context, answer in polished interview-ready markdown, produce senior-level architecture/code answers, beat Parakeet benchmark quality, and still start streaming quickly enough for live interview use.
