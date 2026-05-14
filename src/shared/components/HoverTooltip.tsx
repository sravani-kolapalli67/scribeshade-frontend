import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface HoverTooltipProps {
  text: string;
  children: React.ReactNode;
  side?: "bottom" | "top";
  className?: string;
}

export function HoverTooltip({
  text,
  children,
  side = "bottom",
  className,
}: HoverTooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          className={cn(
            "absolute z-50 px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium leading-snug whitespace-pre-line shadow-xl pointer-events-none",
            "left-1/2 -translate-x-1/2 max-w-[260px] w-max text-center",
            side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}
