---
description: "Use when working on Tauri, Rust backend, capabilities, deep-linking, or desktop build/configuration tasks. Enforces preflight reading of AGENTS.md and project requirements before implementation."
name: "Tauri Preflight Requirements"
applyTo: "src-tauri/**"
---
# Tauri Preflight Requirements

Before making any change for Tauri-related work, complete this preflight:

1. Read AGENTS.md at the repository root.
2. Read project requirements relevant to the task (README.md sections, task prompt constraints, and any repo-specific architecture notes).
3. Confirm command and environment assumptions from AGENTS.md before editing or running commands.

Do not begin implementation until the preflight is complete.

## What counts as Tauri work

- Rust code under src-tauri/src
- Tauri configuration and capabilities files under src-tauri
- Tauri CLI workflows (tauri dev/build)
- Desktop-specific behavior tied to frontend + Tauri IPC integration

## Expected behavior in responses

- Briefly state that AGENTS.md and project requirements were reviewed before changes.
- Follow repo conventions documented in AGENTS.md unless the user explicitly overrides them.
