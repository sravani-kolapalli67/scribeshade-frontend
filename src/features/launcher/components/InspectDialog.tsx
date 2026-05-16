import React, { useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, SlidersHorizontal } from "lucide-react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { InspectAuthContext } from "./InspectAuthContext";
import { InspectTab } from "./InspectTab";
import type { InspectAuthPayload } from "@/services/tauriEvents";

interface InspectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InspectDialog({ open, onClose }: InspectDialogProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [authPayload, setAuthPayload] = useState<InspectAuthPayload>({
    token: null,
    email: "—",
    userId: "—",
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setAuthPayload({ token: null, email: "—", userId: "—" });
      return;
    }
    let cancelled = false;
    const sync = async () => {
      const token = await getToken();
      if (cancelled) return;
      setAuthPayload({
        token,
        email:
          user?.primaryEmailAddress?.emailAddress ??
          user?.emailAddresses?.[0]?.emailAddress ??
          "—",
        userId: localStorage.getItem("userId") ?? "—",
      });
    };
    sync();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken, user]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="inspect-dialog"
          initial={{ opacity: 0, scale: 0.95, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.95, x: 20 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "fixed",
            top: 80,
            right: 20,
            width: 360,
            maxHeight: "calc(100vh - 120px)",
            background: "#ffffff",
            borderRadius: 16,
            boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 2px 10px rgba(0,0,0,0.08)",
            overflow: "hidden",
            pointerEvents: "auto",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e4e4e7",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-zinc-500" />
              <span className="text-sm font-bold text-zinc-800">ScribeShade – Inspect</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
              aria-label="Close Inspect"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <InspectAuthContext.Provider value={authPayload}>
              <InspectTab />
            </InspectAuthContext.Provider>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}