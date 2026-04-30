# ScribeShade – Agent Instructions

## Project Overview

ScribeShade is a **desktop-first productivity app** built with **Tauri v2 + React + TypeScript + Vite**. The desktop experience consists of three windows and is _not_ a traditional single-page app:

| Window label | HTML entry | Purpose |
|---|---|---|
| `launcher` | `launcher.html` → `WidgetApp.tsx` | Always-visible floating widget |
| `mini` | `floating.html` | Active-session transcription overlay |
| `main` | `index.html` → `App.tsx` | Full dashboard (lazily created) |

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4, shadcn/ui |
| Desktop shell | Tauri v2 |
| Auth | Clerk (`@clerk/clerk-react`) |
| State | Redux Toolkit (`src/store/slices/`) |
| API | REST via `VITE_BACKEND_URL`; real-time events via SSE |
| Payments | Razorpay (permitted to load inside the main webview) |
| Deploy (web) | Vercel |

## Build & Dev Commands

```bash
pnpm install          # install all deps
pnpm tauri dev        # Tauri + Vite HMR (desktop)
pnpm tauri build      # production desktop build
pnpm build            # web-only Vite build (for Vercel)
pnpm lint             # ESLint
```

## Critical Architecture Decisions

1. **No dashboard at startup.** `tauri.conf.json` declares only `mini` and `launcher` windows, both `visible: false`. The dashboard `"main"` window does not exist until the `open_main_dashboard` Tauri command is invoked. See [tauri-browser-redirect.instructions.md](.github/instructions/tauri-browser-redirect.instructions.md).

2. **External URLs and dashboard navigation open in the system browser, never the webview.** The launcher widget uses `open()` from `@tauri-apps/plugin-opener` for all dashboard links (sign-in, dashboard, sessions, billing). A `FRONTEND_URL` constant in `WidgetApp.tsx` holds the production Vercel URL. The `on_navigation` guard inside `open_main_dashboard` (in `src-tauri/src/lib.rs`) intercepts navigations in the main window and routes non-internal URLs to `tauri-plugin-opener`.

3. **Tauri detection is runtime-only.** Use `isTauri()` from `src/lib/utils.ts` (`"__TAURI__" in window`). Never use `process.env`, `import.meta.env`, or user-agent sniffing.

4. **Three HTML entry points.** Each window loads its own HTML file. `index.html` is the full React app. `launcher.html` and `floating.html` each mount their own lightweight React roots.

5. **Cross-platform Rust rules.** All `src-tauri/` code must compile on Windows, macOS, and Linux. See [tauri-cross-platform.instructions.md](.github/instructions/tauri-cross-platform.instructions.md).

6. **Clerk must include `"tauri:"` in `allowedRedirectProtocols`** in both `main.tsx` and `WidgetApp.tsx` or Clerk will block desktop redirect URIs.

## Directory Guide

| Path | Contents |
|---|---|
| `src-tauri/src/lib.rs` | All Tauri commands and app setup (single large file) |
| `src-tauri/tauri.conf.json` | Window declarations, deep-link scheme (`craftvita://`) |
| `src/pages/Launcher/WidgetApp.tsx` | Floating launcher widget (~1400 lines) |
| `src/pages/Sessions/ActiveSession/` | Session recording / transcription page |
| `src/components/GoogleOAuthButton.tsx` | OAuth via `tauri-plugin-oauth` + `tauri-plugin-opener` |
| `src/App.tsx` | Main app router; handles `craftvita://` deep links |
| `src/lib/utils.ts` | `isTauri()` helper and shared utilities |
| `src/store/slices/` | Redux slices |
| `.github/docs/` | API reference, frontend integration guide, pricing docs |

## Documentation

- [API Reference](.github/docs/api-reference.md)
- [Frontend Integration Guide](.github/docs/frontend-integration-guide.md)
- [Real-time Events Guide](.github/docs/realtime-events-guide.md)
- [Pricing & Credits](.github/docs/ScribeShade%20Pricing%20%26%20Credits.md)
