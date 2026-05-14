import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface SessionInitPayload {
  sessionId: string | undefined;
  isFree: boolean;
  aiModel: string;
  language: string;
  companyName: string;
  startedAt: string | null;
  maxAllowedMinutes: number | null;
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
} as const;
