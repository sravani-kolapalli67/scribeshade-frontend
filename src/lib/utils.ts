import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns true only when running inside the Tauri desktop runtime. */
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI__" in window;
