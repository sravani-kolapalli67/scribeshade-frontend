import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { ClerkProvider } from "@clerk/clerk-react";
import { store } from "@/store/store";
import { InspectTab } from "@/features/launcher/components/InspectTab";
import "@/App.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function InspectApp() {
  if (!PUBLISHABLE_KEY) {
    return <div className="p-4 text-xs text-red-500">Missing Clerk key</div>;
  }
  return (
    <Provider store={store}>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        allowedRedirectProtocols={["tauri:", "http:", "https:"]}
      >
        <div className="h-full overflow-y-auto bg-white">
          <InspectTab />
        </div>
      </ClerkProvider>
    </Provider>
  );
}

createRoot(document.getElementById("inspect-root")!).render(
  <React.StrictMode>
    <InspectApp />
  </React.StrictMode>,
);
