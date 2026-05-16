import React, { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { store } from "@/store/store";
import { InspectTab } from "@/features/launcher/components/InspectTab";
import type { InspectAuthPayload } from "@/services/tauriEvents";
import "@/App.css";

// ── Auth context ──────────────────────────────────────────────────────────────
// The inspect window has no Clerk session (each webview has isolated storage).
// Auth data is pushed from the launcher via two mechanisms:
//   1. URL query params on initial open (immediate, no race condition)
//   2. "inspect:auth" Tauri events for ongoing updates (token refresh, sign-out)

const defaultAuth: InspectAuthPayload = { token: null, email: "—", userId: "—" };

function parseAuthFromUrl(): InspectAuthPayload {
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get("token") || null,
    email: params.get("email") || "—",
    userId: params.get("userId") || "—",
  };
}

const initialAuth = parseAuthFromUrl();

export const InspectAuthContext = createContext<InspectAuthPayload>(initialAuth);

export function useInspectAuth(): InspectAuthPayload {
  return useContext(InspectAuthContext);
}

// ── Root component ────────────────────────────────────────────────────────────

function InspectApp() {
  // Start with auth data from URL params (passed by launcher on window creation)
  // so we never show a flash of "—" while waiting for the event handshake.
  const [auth, setAuth] = useState<InspectAuthPayload>(initialAuth);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const requestAuth = () => {
      emit("inspect:request-auth").catch(console.error);
    };

    // 1. Register listener before emitting request so we never miss the reply.
    listen<InspectAuthPayload>("inspect:auth", (event) => {
      setAuth(event.payload);
    })
      .then((fn) => {
        unlisten = fn;
        // 2. Tell the launcher this window is ready and wants auth data.
        requestAuth();
      })
      .catch(console.error);

    const handleFocus = () => requestAuth();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestAuth();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      unlisten?.();
    };
  }, []);

  return (
    <Provider store={store}>
      <InspectAuthContext.Provider value={auth}>
        <div className="h-full overflow-y-auto bg-white">
          <InspectTab />
        </div>
      </InspectAuthContext.Provider>
    </Provider>
  );
}

createRoot(document.getElementById("inspect-root")!).render(
  <React.StrictMode>
    <InspectApp />
  </React.StrictMode>,
);
