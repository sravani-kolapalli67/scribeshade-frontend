# AGENTS.md

Quick instructions for AI coding agents working in this repository.

## Project Snapshot
- Stack: Vite + React 19 + TypeScript frontend with Tauri v2 Rust backend.
- Package manager: pnpm (lockfile present; CI uses pnpm 10 + Node 20).
- Primary docs: [README.md](README.md)
- React performance guidance skill: [.agents/skills/vercel-react-best-practices/AGENTS.md](.agents/skills/vercel-react-best-practices/AGENTS.md)

## Reliable Commands
- Install deps: `pnpm install`
- Frontend dev: `pnpm dev`
- Type-check + web build: `pnpm build`
- Tauri CLI passthrough: `pnpm tauri`
- Desktop dev (if needed): `pnpm tauri dev`
- Desktop build (if needed): `pnpm tauri build`

## Architecture Pointers
- React entry: [src/main.tsx](src/main.tsx)
- App routes and auth/deep-link flow: [src/App.tsx](src/App.tsx)
- Vite multi-entry (`index.html` + `floating.html`) and alias config: [vite.config.ts](vite.config.ts)
- Tauri app/build/window/deep-link config: [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)
- Rust crate and plugin deps: [src-tauri/Cargo.toml](src-tauri/Cargo.toml)

## Repo-Specific Conventions
- Path alias: `@/* -> src/*` (see [tsconfig.json](tsconfig.json)). Prefer alias imports for app code.
- Dev server port is fixed to `1420` with `strictPort: true`; avoid changing it casually because Tauri expects this port.
- Deep-link scheme is `craftvita://`; OAuth callback handling is implemented in [src/App.tsx](src/App.tsx).
- `VITE_CLERK_PUBLISHABLE_KEY` is required at startup (app throws if missing in [src/main.tsx](src/main.tsx)).
- This repo contains directory names with spaces (for example under `src/components` and `src/pages/QuestionBank`); quote paths in terminal commands.

## Editing Guidance
- Keep changes focused and minimal; avoid broad refactors unless asked.
- Preserve existing routing structure and auth guards in [src/App.tsx](src/App.tsx) when adding pages.
- For UI changes, follow patterns in `src/components/ui` and existing feature folders in `src/pages`.
- If adding Tauri functionality, keep JS and Rust sides aligned and verify in both web (`pnpm dev`) and desktop (`pnpm tauri dev`) flows when applicable.

## Validation Guidance
- There is no dedicated lint/test script in `package.json`; default validation is `pnpm build`.
- For Tauri-related changes, also validate with `pnpm tauri build` when feasible.
