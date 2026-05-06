# ScribeShade

AI-powered interview assistant built as a **desktop-first** application using **Tauri v2 + React + TypeScript + Vite**. Also deployable as a web app on Vercel.

---

## What It Does

ScribeShade helps candidates during live interviews by providing:

- **Real-time AI coaching** — transcribes audio and generates contextual answers via an always-on-top floating overlay
- **Session management** — create, track, pause, and review interview sessions with full analytics
- **Resume tooling** — upload, ATS-score, build, and tailor resumes; generate cover letters
- **Document context** — attach supporting documents (portfolios, projects) that feed the AI during sessions
- **Q&A Bank** — browse and revisit AI-generated answers from past sessions
- **AI Project Suggestions** — generate project ideas based on role and skill level
- **Credit billing** — Razorpay-powered credit purchase and ledger system

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19, TypeScript |
| Build tool | Vite |
| Desktop shell | Tauri v2 (Rust) |
| Styling | Tailwind CSS v4, shadcn/ui |
| Auth | Clerk (`@clerk/clerk-react`) |
| State | Redux Toolkit |
| Data fetching | TanStack React Query |
| Real-time | Server-Sent Events (SSE) |
| Payments | Razorpay |
| Web deploy | Vercel |

---

## Window Architecture

The desktop app runs **three independent windows** — not a traditional SPA:

| Window label | Entry point | Purpose |
|---|---|---|
| `launcher` | `launcher.html` → `WidgetApp.tsx` | Always-visible floating launcher widget |
| `mini` | `floating.html` | Active-session transcription overlay (always on top) |
| `main` | `index.html` → `App.tsx` | Full dashboard (lazily created on demand) |

Only `mini` and `launcher` are declared in `tauri.conf.json`. The `main` window is created programmatically via the `open_main_dashboard` Tauri command.

---

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm
- Rust toolchain (for desktop builds) — [rustup.rs](https://rustup.rs)
- Tauri CLI v2

### Install

```bash
pnpm install
```

### Environment

Copy `.env` and fill in your values:

```bash
cp .env .env.local
```

Key variables:

| Variable | Purpose |
|---|---|
| `VITE_BACKEND_URL` | Backend API base URL (dev) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `VITE_DEEPGRAM_API_KEY` | Deepgram speech-to-text key |
| `VITE_RAZORPAY_KEY_ID` | Razorpay key (dev/test) |
| `VITE_FRONTEND_URL` | Public frontend URL (used in desktop redirects) |

Production overrides live in `.env.production` and are applied automatically by Vite during `pnpm build`.

### Commands

```bash
pnpm dev            # Vite dev server (web only, http://localhost:1420)
pnpm tauri dev      # Tauri desktop app with HMR
pnpm build          # Web-only build (Vercel deployment)
pnpm tauri build    # Production desktop build (current platform)
pnpm build:mac      # Universal macOS binary (arm64 + x86_64)
pnpm build:win      # Windows x64 binary
pnpm lint           # ESLint
```

---

## Project Structure

```
src/
├── App.tsx                   # Main router + deep-link handler
├── main.tsx                  # React root for main window
├── pages/
│   ├── Launcher/WidgetApp.tsx  # Floating launcher widget
│   ├── Sessions/               # Session list + active session
│   ├── Resume/                 # Resume upload + builder
│   ├── Billing/                # Credit plans + purchase
│   ├── Dashboard/              # Overview dashboard
│   ├── Analytics/              # Usage analytics
│   ├── AIProjects/             # AI project suggestions
│   ├── QuestionBank/           # Saved Q&A bank
│   └── Document/               # Supporting documents
├── components/               # Shared UI components
├── hooks/                    # Custom React hooks
├── store/slices/             # Redux slices
├── lib/
│   ├── endpoints.ts          # Centralized API endpoint factory
│   └── utils.ts              # isTauri() and shared helpers
└── services/                 # API service wrappers

src-tauri/
├── src/lib.rs                # All Tauri commands and app setup
├── tauri.conf.json           # Window config, deep-link scheme (ScribeShade://)
└── capabilities/             # Tauri v2 permission declarations
```

---

## Key Architecture Notes

- **Tauri detection** — always use `isTauri()` from `src/lib/utils.ts`. Never rely on `process.env` or user-agent.
- **External links** — all external/dashboard URLs open in the system browser via `@tauri-apps/plugin-opener`, never inside a webview.
- **API base URL** — all backend calls are routed through `src/lib/endpoints.ts`. The single `VITE_BACKEND_URL` variable is the only place to change the base URL.
- **Real-time** — session events use SSE (`GET /session/:id/events`). There is no WebSocket.
- **Clerk + Tauri** — `"tauri:"` must be listed in `allowedRedirectProtocols` in both `main.tsx` and `WidgetApp.tsx`.

---

## Deployment

### Web (Vercel)

Push to the connected branch. Vercel runs `pnpm build` automatically. Production env vars are set in the Vercel dashboard and in `.env.production`.

### Desktop

```bash
pnpm build:mac   # macOS universal binary → src-tauri/target/universal-apple-darwin/release/bundle/
pnpm build:win   # Windows installer → src-tauri/target/x86_64-pc-windows-msvc/release/bundle/
```

---

## Related

- [Backend repo](../ScribeShade-01-backend/) — Express 5 + Prisma + BullMQ API server
- [API Reference](.github/docs/api-reference.md)
- [Frontend Integration Guide](.github/docs/frontend-integration-guide.md)
- [Real-time Events Guide](.github/docs/realtime-events-guide.md)
- [Pricing & Credits](.github/docs/ScribeShade%20Pricing%20%26%20Credits.md)
