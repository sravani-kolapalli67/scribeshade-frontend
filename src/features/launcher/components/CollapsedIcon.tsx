import React from "react";
import { motion } from "framer-motion";
import { APP_NAME } from "@/features/launcher/constants";

/**
 * Tiny circular floating button shown when the launcher is collapsed.
 * Dragging and clicking are wired externally via the parent's onMouseDown/onClick.
 */
export function CollapsedIcon() {
  return (
    <motion.div
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{
        width: 60,
        height: 60,
        borderRadius: "50%",
        background: "white",
        boxShadow:
          "0 4px 24px rgba(0,0,0,0.14), 0 1px 6px rgba(0,0,0,0.07)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <img
        src="/src-tauri/icons/icon.png"
        alt={APP_NAME}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          pointerEvents: "none",
          userSelect: "none",
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    </motion.div>
  );
}
