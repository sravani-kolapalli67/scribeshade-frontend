import { emit, emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface SessionInitPayload {
  sessionId: string | undefined;
  isFree: boolean;
  aiModel: string;
  language: string;
  companyName: string;
  startedAt: string | null;
  maxAllowedMinutes: number | null;
}

export interface InspectAuthPayload {
  token: string | null;
  email: string;
  userId: string;
}

/**
 * Typed wrappers for Tauri events used by the launcher.
 * Centralizes all emit/listen calls so feature code doesn't import
 * directly from @tauri-apps/api/event.
 */
export const tauriEvents = {
  emitSessionInit: (payload: SessionInitPayload): Promise<void> =>
    emit("session-init", payload),

  onAuthSignedOut: (cb: () => void): Promise<UnlistenFn> =>
    listen<void>("auth:signed-out", cb),

  onSessionReset: (cb: () => void): Promise<UnlistenFn> =>
    listen<void>("session:reset", cb),

  onOAuthCallback: (cb: (url: string) => void): Promise<UnlistenFn> =>
    listen<string>("oauth://url", (e) => cb(e.payload)),

  // ── Inspect window auth handshake ─────────────────────────────────────────
  // The inspect window emits "inspect:request-auth" on mount.
  // The launcher listens, fetches a fresh Clerk token, and responds via
  // emitTo("inspect", "inspect:auth", payload) so the inspect webview
  // never needs its own ClerkProvider.
  onInspectRequestAuth: (cb: () => void): Promise<UnlistenFn> =>
    listen<void>("inspect:request-auth", cb),

  emitInspectAuth: (payload: InspectAuthPayload): Promise<void> =>
    emitTo("inspect", "inspect:auth", payload),
} as const;
