import React from "react";
import { useAuth, useClerk, useUser } from "@clerk/clerk-react";
import {
  clearPersistedDesktopSession,
  emitDesktopAuthStateChanged,
  listenDesktopAuthStateChanged,
  persistDesktopSession,
  readPersistedDesktopSession,
} from "@/lib/desktopAuthSession";
import { isTauri } from "@/lib/utils";

interface DesktopAuthHydratorProps {
  children: React.ReactNode;
  source: string;
  loadingFallback?: React.ReactNode;
}

export function DesktopAuthHydrator({ children, source, loadingFallback }: DesktopAuthHydratorProps) {
  const { isLoaded, isSignedIn } = useUser();
  const { sessionId } = useAuth();
  const { setActive, signOut } = useClerk();

  const [hydrated, setHydrated] = React.useState<boolean>(() => !isTauri());
  const restoreAttemptedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isTauri()) {
      setHydrated(true);
      return;
    }
    if (!isLoaded || restoreAttemptedRef.current) return;

    restoreAttemptedRef.current = true;

    (async () => {
      try {
        const persistedSessionId = await readPersistedDesktopSession();
        console.info("[auth/hydrator] restore attempt", {
          source,
          hasPersistedSession: !!persistedSessionId,
          isSignedIn,
        });

        if (!isSignedIn && persistedSessionId) {
          await setActive({ session: persistedSessionId });
          console.info("[auth/hydrator] session restored", { source });
        }
      } catch (error) {
        console.warn("[auth/hydrator] session restore failed", { source, error });
      } finally {
        setHydrated(true);
      }
    })();
  }, [isLoaded, isSignedIn, setActive, source]);

  React.useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    listenDesktopAuthStateChanged(async (payload) => {
      if (payload.source === source || !isLoaded) return;

      console.info("[auth/sync] inbound", {
        source,
        from: payload.source,
        signedIn: payload.signedIn,
        hasSession: !!payload.sessionId,
      });

      try {
        if (payload.sessionId && !isSignedIn) {
          await setActive({ session: payload.sessionId });
        } else if (!payload.sessionId && isSignedIn) {
          await signOut();
        }
      } catch (error) {
        console.warn("[auth/sync] inbound apply failed", { source, error });
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => {
        console.warn("[auth/sync] listener setup failed", { source, error });
      });

    return () => unlisten?.();
  }, [isLoaded, isSignedIn, setActive, signOut, source]);

  React.useEffect(() => {
    if (!isTauri() || !isLoaded) return;

    (async () => {
      try {
        if (sessionId) {
          await persistDesktopSession(sessionId);
          await emitDesktopAuthStateChanged({ source, sessionId, signedIn: true });
          console.info("[auth/persist] saved", { source });
          return;
        }

        if (hydrated && !isSignedIn) {
          await clearPersistedDesktopSession();
          await emitDesktopAuthStateChanged({ source, sessionId: null, signedIn: false });
          console.info("[auth/persist] cleared", { source });
        }
      } catch (error) {
        console.warn("[auth/persist] update failed", { source, error });
      }
    })();
  }, [hydrated, isLoaded, isSignedIn, sessionId, source]);

  if (!isLoaded || !hydrated) {
    return (
      <>
        {loadingFallback ?? (
          <div className="min-h-screen bg-white flex items-center justify-center p-4">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
              <p className="text-slate-600 text-sm font-medium">Restoring your session...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}
