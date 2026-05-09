import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ClerkProvider,
  useUser,
  useAuth,
  useClerk,
  useSignIn,
} from "@clerk/clerk-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { start, cancel } from "@fabianlars/tauri-plugin-oauth";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";
import { checkForUpdates } from "@/lib/updater";
import { cn } from "@/lib/utils";
import {
  MoreVertical,
  Move,
  ChevronUp,
  ChevronDown,
  X,
  Coins,
  Play,
  Zap,
  Loader2,
  ExternalLink,
  LogIn,
  LogOut,
  LayoutDashboard,
  Info,
  Plus,
  Minus,
  RotateCcw,
  User as UserIcon,
  Briefcase,
  FileText,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Cpu,
  History,
  Sparkles,
  Paperclip,
  Folder,
  Globe,
  Settings,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import "@/App.css";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const _rawFrontendUrl: string =
  import.meta.env.VITE_FRONTEND_URL ??
  "https://app.scribeshade.org";
const FRONTEND_URL = _rawFrontendUrl.startsWith("http")
  ? _rawFrontendUrl
  : `https://${_rawFrontendUrl}`;
const WIDGET_W = 460;
const APP_NAME = "ScribeShade";
const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";
const ZOOM_KEY = "scribeshade.widget.zoom";
const PRIVATE_KEY = "scribeshade.widget.private";
const AUTODETECT_KEY = "scribeshade.widget.autodetect";
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;

// Safe JSON parser — WKWebView throws "The string did not match the expected
// pattern" when Response.json() receives non-JSON (e.g. HTML error pages).
async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    console.warn("[WidgetApp] Non-JSON response from", res.url, "—", text.slice(0, 120));
    return null;
  }
}

const JOB_DESCRIPTION_REGEX = /^.{2,}/im;

type SessionKind = "free" | "premium";
type Tab = "create" | "past";

interface Resume {
  id: string;
  filename: string;
  uploadedAt: string;
}

interface Document {
  id: string;
  filename: string;
  uploadedAt: string;
}

interface AIProject {
  id: string;
  position: string;
  jobDescription: string;
  createdAt: string;
  projects: Array<{ projectHeader?: { title?: string } }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCredits(raw: string | null | undefined): string {
  if (!raw) return "0";
  const n = parseFloat(raw);
  if (isNaN(n)) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  // Show up to 1 decimal place, strip trailing zero only for whole numbers
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
}

function hasCredits(
  balance: ReturnType<typeof useCreditsBalance>["balance"],
): boolean {
  if (!balance) return false;
  const total = parseFloat(balance.totalAvailable ?? "0");
  return !isNaN(total) && total > 0;
}

// ─── Tooltip (lightweight inline) ─────────────────────────────────────────────

function HoverTooltip({
  text,
  children,
  side = "bottom",
  className,
}: {
  text: string;
  children: React.ReactNode;
  side?: "bottom" | "top";
  className?: string;
}) {
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

// ─── CreditsBadge ─────────────────────────────────────────────────────────────

function CreditsBadge() {
  const { isSignedIn } = useAuth();
  const { balance, isLoading } = useCreditsBalance();

  if (!isSignedIn) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-zinc-900 text-white text-xs font-semibold">
        <Loader2 className="w-3 h-3 animate-spin" />
      </div>
    );
  }

  const creditsOk = hasCredits(balance);
  const total = balance ? formatCredits(balance.totalAvailable) : "0";

  const badge = (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-zinc-900 text-white text-xs font-semibold select-none cursor-default">
      <Coins
        className={cn("w-3 h-3", creditsOk ? "text-amber-400" : "opacity-50")}
      />
      <span>{creditsOk ? `${total} Credits` : "No Credits"}</span>
    </div>
  );

  if (!creditsOk) {
    return (
      <HoverTooltip
        text={`You don't have any interview credits.\nBuy some to start a paid session.`}
      >
        {badge}
      </HoverTooltip>
    );
  }
  return badge;
}

// ─── RadioDot ─────────────────────────────────────────────────────────────────

function RadioDot({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all",
        active ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 bg-white",
      )}
    >
      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
    </div>
  );
}

// ─── TabPills ─────────────────────────────────────────────────────────────────

function TabPills({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="px-3 pt-2">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-zinc-100">
        {(["create", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={cn(
              "py-2 rounded-xl text-sm font-semibold transition-colors",
              tab === t
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            {t === "create" ? "Create" : "Past Sessions"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── SessionSelector ──────────────────────────────────────────────────────────

function SessionSelector({
  selected,
  onSelect,
  creditsOk,
  isLoadingBalance,
}: {
  selected: SessionKind;
  onSelect: (k: SessionKind) => void;
  creditsOk: boolean;
  isLoadingBalance: boolean;
}) {
  const premiumDisabled = !creditsOk && !isLoadingBalance;

  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-sm font-bold text-zinc-800">
          Select Session Type
        </span>
        <HoverTooltip text="Free sessions are limited to 5 minutes.\nPremium sessions use 0.5 credits per minute and unlock AI responses.">
          <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help" />
        </HoverTooltip>
      </div>
    </div>
  );
}

// ─── ActionButtons ────────────────────────────────────────────────────────────

function ActionButtons({
  balance,
  isLoadingBalance,
  onStart,
}: {
  balance: ReturnType<typeof useCreditsBalance>["balance"];
  isLoadingBalance: boolean;
  onStart: (isFree: boolean) => void;
}) {
  const noCreditState = !hasCredits(balance) && !isLoadingBalance;

  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-2">
      <button
        onClick={() => onStart(true)}
        className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl border border-zinc-200 bg-white text-zinc-800 text-sm font-semibold hover:bg-zinc-50 hover:border-zinc-300 transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Play className="w-3.5 h-3.5" />
        Free Session
      </button>

      <button
        onClick={async () => {
          if (noCreditState) {
            openUrl(`${FRONTEND_URL}/billing`).catch(console.error);
          } else {
            onStart(false);
          }
        }}
        disabled={isLoadingBalance}
        className={cn(
          "flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed",
          noCreditState
            ? "bg-amber-500 hover:bg-amber-600 text-white"
            : "bg-zinc-900 hover:bg-zinc-800 text-white",
        )}
      >
        {noCreditState ? (
          <Coins className="w-3.5 h-3.5" />
        ) : (
          <Zap className="w-3.5 h-3.5" />
        )}
        {noCreditState ? "Buy Credits" : "Full Session"}
      </button>
    </div>
  );
}

// ─── PastSessionsTab ──────────────────────────────────────────────────────────

interface PastSession {
  id: string;
  companyName?: string;
  position?: string;
  status: string;
  createdAt: string;
  isFree: boolean;
}

function sessionStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case "COMPLETED":    return { label: "Completed",     color: "text-emerald-600 bg-emerald-50" };
    case "ACTIVE":       return { label: "Active",        color: "text-blue-600 bg-blue-50" };
    case "PAUSED":       return { label: "Paused",        color: "text-amber-600 bg-amber-50" };
    case "ABANDONED":    return { label: "Abandoned",     color: "text-zinc-500 bg-zinc-100" };
    case "FORCE_ENDED":  return { label: "Force Ended",   color: "text-zinc-500 bg-zinc-100" };
    case "AUTO_ENDED":   return { label: "Auto Ended",    color: "text-zinc-500 bg-zinc-100" };
    case "CREDIT_EXHAUSTED": return { label: "Credits Used Up", color: "text-red-600 bg-red-50" };
    default:             return { label: status,          color: "text-zinc-500 bg-zinc-100" };
  }
}

function formatRelativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60)  return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function PastSessionsTab() {
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState<PastSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        let userId = localStorage.getItem("userId");
        if (!userId) {
          const token = await getToken();
          if (token) {
            const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (meRes.ok) {
              const meData = await safeJson<{ id: string }>(meRes);
              if (meData?.id) {
                userId = meData.id;
                localStorage.setItem("userId", userId);
              }
            }
          }
        }
        if (!userId || cancelled) return;

        const token = await getToken();
        const res = await fetch(
          `${BACKEND_URL}/api/session/list?userId=${userId}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok || cancelled) return;
        const data = await safeJson<unknown>(res);
        const all: PastSession[] = Array.isArray(data)
          ? data
          : (data as any)?.data ?? [];
        if (!cancelled) setSessions(all.slice(0, 3));
      } catch (e) {
        console.error("[PastSessionsTab] fetch error", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [getToken]);

  const openSession = (id: string) =>
    openUrl(`${FRONTEND_URL}/sessions/${id}`).catch(console.error);

  return (
    <div className="flex flex-col gap-2 px-3 pt-3 pb-4">
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
            <History className="w-4 h-4 text-zinc-400" />
          </div>
          <p className="text-xs text-zinc-500 text-center leading-snug">
            No past sessions yet. Start your first one!
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide px-0.5">
            Recent Sessions
          </p>
          {sessions.map((s) => {
            const { label, color } = sessionStatusLabel(s.status);
            const title = [s.position, s.companyName].filter(Boolean).join(" @ ") || "Session";
            return (
              <button
                key={s.id}
                onClick={() => openSession(s.id)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 hover:border-zinc-200 transition-all active:scale-[0.98] text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-zinc-200 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-3.5 h-3.5 text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-800 truncate">{title}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {formatRelativeDate(s.createdAt)}
                    {s.isFree ? " · Free" : " · Premium"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", color)}>
                    {label}
                  </span>
                  <ExternalLink className="w-3 h-3 text-zinc-400" />
                </div>
              </button>
            );
          })}
        </>
      )}
      <button
        onClick={() => openUrl(`${FRONTEND_URL}/sessions`).catch(console.error)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition-all active:scale-[0.97] mt-1"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        View All Sessions
      </button>
    </div>
  );
}

// ─── WidgetSelect (inline dropdown — no portal, window auto-resizes) ────────────
// Renders the option list inline so the ResizeObserver sees the extra height
// and win.setSize() expands the Tauri window.  No Radix portal = no aria-hidden.

const AI_MODELS_WIDGET = [
  { value: "google/gemma-4-26b-a4b-it", label: "Gemma 4 (26B)" },
  {
    value: "google/gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
  },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "anthropic/claude-sonnet-4.6", label: "Claude 4.6 Sonnet" },
];

function WidgetSelect({
  value,
  onValueChange,
  placeholder,
  options,
  isLoading = false,
  emptyMessage = "Nothing uploaded yet",
  className,
  listClassName,
}: {
  value: string;
  onValueChange: (val: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  listClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className={cn("flex-1 min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 h-11 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-800 hover:bg-zinc-50 transition-colors"
      >
        <span
          className={cn(
            "truncate min-w-0 text-left",
            !selected && "text-zinc-400",
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-1 rounded-xl border border-zinc-200 bg-white shadow-md overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
            </div>
          ) : options.length === 0 ? (
            <p className="py-3 text-center text-xs text-zinc-400">
              {emptyMessage}
            </p>
          ) : (
            <div className={cn("max-h-44 overflow-y-auto", listClassName)}>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 text-sm truncate hover:bg-zinc-50 transition-colors",
                    opt.value === value &&
                      "bg-zinc-100 font-medium text-zinc-900",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AuthScreen (signed-out) ──────────────────────────────────────────────────

// ─── AuthScreen ───────────────────────────────────────────────────────────────
// Opens the SYSTEM BROWSER at the web sign-in page.
// The web page, after sign-in, calls the backend to create a Clerk sign-in
// ticket and redirects to scribeshade://auth-callback?ticket=TOKEN.
// Rust's on_open_url handler emits "auth:tauri-ticket" to this webview.
// The useEffect in WidgetContent listens for that event and signs in here.
//
// ⚠️  BACKEND REQUIREMENT:
//   Add endpoint  POST /api/auth/tauri-ticket  (authenticated)
//   Backend impl: clerk.signInTokens.createSignInToken({ userId })
//   Response:     { ticket: string }
// Fixed port for the Tauri auth callback server.
// This does NOT need to be whitelisted in Clerk because we are not using
// authenticateWithRedirect — we call the backend for a sign-in ticket and
// then navigate the browser to http://127.0.0.1:PORT directly.
const TAURI_AUTH_PORT = 10002;

// Module-level ref so the active server port survives re-renders and can be
// cancelled before a new one is started (handles the reload-and-retry case).
let _activeAuthPort: number | undefined;

const AUTH_CALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>ScribeShade – Signed In</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f0f12;font-family:-apple-system,sans-serif;color:#e5e7eb}.card{background:#1a1a24;border:1px solid #2d2d3a;border-radius:16px;padding:40px 48px;text-align:center;max-width:400px;width:90%}.icon{width:56px;height:56px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}.icon svg{width:28px;height:28px}h1{font-size:1.4rem;font-weight:600;color:#f9fafb;margin-bottom:8px}p{font-size:.9rem;color:#9ca3af}</style>
</head>
<body><div class="card"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><h1>You're signed in!</h1><p>Switch back to the ScribeShade app to continue.</p></div></body>
</html>`;

function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn: clerkSignIn, setActive: clerkSetActive } = useSignIn();

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    let port: number | undefined;
    let unlisten: (() => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = async () => {
      clearTimeout(timeoutId);
      unlisten?.();
      if (port !== undefined) {
        await cancel(port).catch(() => undefined);
        _activeAuthPort = undefined;
        port = undefined;
      }
    };

    try {
      // 1. Cancel any leftover server from a previous attempt (reload-and-retry)
      if (_activeAuthPort !== undefined) {
        await cancel(_activeAuthPort).catch(() => undefined);
        _activeAuthPort = undefined;
      }

      // 2. Start local HTTP server on fixed port
      port = await start({
        ports: [TAURI_AUTH_PORT],
        response: AUTH_CALLBACK_HTML,
      });
      _activeAuthPort = port;

      // 2. Listen for the oauth://url event that fires when the browser hits our server
      const authPromise = new Promise<string>((resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Login timed out — please try again")),
          120_000,
        );
        listen<string>("oauth://url", (event) => {
          clearTimeout(timeoutId);
          try {
            const ticket = new URL(event.payload).searchParams.get("ticket");
            if (ticket) resolve(ticket);
            else reject(new Error("Auth callback missing ticket"));
          } catch {
            reject(new Error("Invalid callback URL"));
          }
        }).then((fn) => {
          unlisten = fn;
        });
      });

      // 3. Open system browser at sign-in page with port param
      await openUrl(`${FRONTEND_URL}/sign-in?from=tauri&port=${port}`);

      // 4. Wait for the ticket to come back via the local server
      const ticket = await authPromise;

      // 5. Sign in to Clerk with the ticket
      if (!clerkSignIn || !clerkSetActive) throw new Error("Clerk not ready");
      const result = await clerkSignIn.create({ strategy: "ticket", ticket });
      if (result.status === "complete") {
        await clerkSetActive({ session: result.createdSessionId });
      } else {
        throw new Error("Unexpected sign-in status: " + result.status);
      }
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message ?? "Login failed");
      setLoading(false);
    } finally {
      await cleanup();
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 px-5 pt-3 pb-5">
      <h2 className="text-lg font-bold text-zinc-900 text-center">
        {APP_NAME}
      </h2>
      <p className="text-sm text-zinc-500 text-center leading-snug">
        Login to your {APP_NAME} account to start your interview.
      </p>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <button
        onClick={handleLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-1 rounded-2xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors active:scale-[0.97] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <LogIn className="w-3.5 h-3.5" />
        )}
        {loading ? "Waiting for browser…" : "Login"}
      </button>
    </div>
  );
}

// ─── MenuToggle (for Private / Auto-detect rows) ──────────────────────────────

function MenuToggle({
  label,
  tooltip,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  tooltip: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-2 rounded-xl",
        disabled ? "opacity-50" : "hover:bg-zinc-50",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-sm font-medium",
            disabled ? "text-zinc-400" : "text-zinc-700",
          )}
        >
          {label}
        </span>
        <HoverTooltip text={tooltip}>
          <Info className="w-3 h-3 text-zinc-400 cursor-help" />
        </HoverTooltip>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-9 h-5 rounded-full transition-colors",
          checked && !disabled ? "bg-zinc-900" : "bg-zinc-200",
          disabled && "cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

// ─── HeaderMenu (the 3-dot dropdown body) ─────────────────────────────────────

function HeaderMenu({
  onClose,
  zoom,
  setZoom,
  privateMode,
  setPrivateMode,
}: {
  onClose: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  privateMode: boolean;
  setPrivateMode: (v: boolean) => void;
}) {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [autoDetect, setAutoDetect] = useState<boolean>(() => {
    return localStorage.getItem(AUTODETECT_KEY) === "true";
  });

  const handleAutoDetect = useCallback((v: boolean) => {
    setAutoDetect(v);
    localStorage.setItem(AUTODETECT_KEY, v ? "true" : "false");
  }, []);

  const handlePrivate = useCallback(
    (v: boolean) => {
      setPrivateMode(v);
      localStorage.setItem(PRIVATE_KEY, v ? "true" : "false");
    },
    [setPrivateMode],
  );

  const adjustZoom = useCallback(
    (delta: number) => {
      const next = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, +(zoom + delta).toFixed(2)),
      );
      setZoom(next);
    },
    [zoom, setZoom],
  );

  const resetZoom = useCallback(() => setZoom(1), [setZoom]);

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress;

  return (
    <div className="mx-3 mb-3 rounded-2xl bg-white border border-zinc-100 shadow-lg overflow-hidden">
      {isSignedIn && email && (
        <>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <UserIcon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
            <span className="text-xs text-zinc-600 truncate">{email}</span>
          </div>
          <div className="h-px bg-zinc-100" />
        </>
      )}

      <button
        onClick={() => {
          openUrl(`${FRONTEND_URL}/dashboard`).catch(console.error);
          onClose();
        }}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-700">Dashboard</span>
        </div>
        <ExternalLink className="w-3 h-3 text-zinc-400" />
      </button>

      <div className="h-px bg-zinc-100" />

      {isSignedIn && (
        <>
          <div className="h-px bg-zinc-100" />
          <button
            onClick={async () => {
              onClose();
              // Pass redirectUrl of the current page so Clerk does NOT navigate
              // the webview anywhere after sign-out (no new window, no webview redirect).
              localStorage.removeItem("userId");
              await signOut({ redirectUrl: window.location.href }).catch(
                console.error,
              );
            //   localStorage.removeItem(`scribeshade-launcher-${user?.id}`);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-red-50 text-red-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </>
      )}
    </div>
  );
}

// ─── WidgetContent ────────────────────────────────────────────────────────────

function WidgetContent() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [tab, setTab] = useState<Tab>("create");
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoom, setZoomState] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY) ?? "1");
    return isNaN(v) ? 1 : v;
  });
  const [privateMode, setPrivateModeState] = useState<boolean>(() => {
    return localStorage.getItem(PRIVATE_KEY) === "true";
  });
  const [autoDetect, setAutoDetect] = useState<boolean>(() => {
    return localStorage.getItem(AUTODETECT_KEY) === "true";
  });

  const [selectedKind, setSelectedKind] = useState<SessionKind>("premium");

  // Flow State
  const [creationStep, setCreationStep] = useState<0 | 1 | 2>(0);
  const [sessionInfo, setSessionInfo] = useState({
    companyName: "",
    jobDescription: "",
    resumeId: "",
    documentId: "",
    language: "English",
    simpleLanguage: false,
    extraContext: "",
    aiModel: "google/gemma-4-26b-a4b-it",
    autoGenerateAI: true,
    saveTranscript: true,
    isFree: false,
    projectIds: [] as string[],
  });
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [aiProjects, setAIProjects] = useState<AIProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const {
    balance,
    isLoading: isLoadingBalance,
    refresh: refreshBalance,
  } = useCreditsBalance();

  const win = getCurrentWindow();
  const cardRef = useRef<HTMLDivElement>(null);

  // Persist zoom whenever it changes
  const setZoom = useCallback((z: number) => {
    setZoomState(z);
    localStorage.setItem(ZOOM_KEY, String(z));
  }, []);

  // ── Auto-update check on launch ────────────────────────────────────────────
  useEffect(() => {
    checkForUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dynamic window height ─────────────────────────────────────────────────
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = Math.ceil(
        entries[0]?.borderBoxSize?.[0]?.blockSize ??
          entries[0]?.contentRect.height ??
          0,
      );
      const w = Math.ceil(
        entries[0]?.borderBoxSize?.[0]?.inlineSize ??
          entries[0]?.contentRect.width ??
          WIDGET_W,
      );
      // Ignore zero-height frames — these happen when Clerk is mid-transition
      // (isLoaded flips false briefly), which would collapse the window.
      if (h === 0) return;
      // Only call setSize when dimensions actually changed (avoids jitter).
      const last = lastKnownSizeRef.current;
      if (last && last.w === (w || WIDGET_W) && last.h === h) return;
      lastKnownSizeRef.current = { w: w || WIDGET_W, h };
      win.setSize(new LogicalSize(w || WIDGET_W, h)).catch(console.error);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [win]);

  // ── Drag ─────────────────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      win.startDragging().catch(console.error);
    },
    [win],
  );

  const handleCollapseToggle = useCallback(() => setCollapsed((c) => !c), []);
  const handleClose = useCallback(
    () => win.close().catch(console.error),
    [win],
  );

  // ── Sign-out broadcast from main window ───────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<void>("auth:signed-out", () => {
      setSelectedKind("free");
      setTab("create");
      setMenuOpen(false);
      setCreationStep(0);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);
    return () => {
      unlisten?.();
    };
  }, []);

  // ── Session ended — reset creation state so launcher reopens at step 0 ────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<void>("session:reset", () => {
      setCreationStep(0);
      setIsCreating(false);
      setSessionInfo({
        companyName: "",
        jobDescription: "",
        resumeId: "",
        documentId: "",
        language: "English",
        simpleLanguage: false,
        extraContext: "",
        aiModel: "google/gemma-4-26b-a4b-it",
        autoGenerateAI: true,
        saveTranscript: true,
        isFree: false,
        projectIds: [],
      });
      setTab("create");
      setCollapsed(false);
    })
      .then((fn) => { unlisten = fn; })
      .catch(console.error);
    return () => { unlisten?.(); };
  }, []);

  // Fetch resumes and documents
  useEffect(() => {
    if (!isSignedIn || !user?.id) return;

    let cancelled = false;

    const fetchData = async () => {
      setIsLoadingResumes(true);
      setIsLoadingDocs(true);
      setIsLoadingProjects(true);

      try {
        // Resolve the backend internal userId — the Clerk user.id is NOT the same.
        // On a fresh client machine localStorage may be empty, so we call /api/auth/me
        // with the Clerk Bearer token to get and cache the correct DB userId.
        let userId = localStorage.getItem("userId");
        if (!userId) {
          const token = await getToken();
          if (token) {
            const meRes = await fetch(
              `${BACKEND_URL}/api/auth/me`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (meRes.ok) {
              const meData = await safeJson<{ id: string }>(meRes);
              if (meData?.id) {
                userId = meData.id as string;
                localStorage.setItem("userId", userId);
              }
            }
          }
        }

        if (!userId || cancelled) return;

        const token = await getToken();
        const authHeaders: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const [resumeRes, docRes, projectsRes] = await Promise.all([
          fetch(
            `${BACKEND_URL}/api/resume/list?userId=${userId}`,
            { headers: authHeaders },
          ),
          fetch(
            `${BACKEND_URL}/api/document/list?userId=${userId}`,
            { headers: authHeaders },
          ),
          fetch(
            `${BACKEND_URL}/api/projects/user/${userId}`,
            { headers: authHeaders },
          ),
        ]);

        if (!cancelled) {
          const resumeData = resumeRes.ok ? await safeJson<unknown>(resumeRes) : null;
          setResumes(
            Array.isArray(resumeData) ? resumeData : (resumeData as any)?.data || [],
          );

          const docData = docRes.ok ? await safeJson<unknown>(docRes) : null;
          setDocuments(Array.isArray(docData) ? docData : (docData as any)?.data || []);

          const projectsData = projectsRes.ok ? await safeJson<unknown>(projectsRes) : null;
          const rawProjects = Array.isArray(projectsData) ? projectsData : (projectsData as any)?.data || [];
          setAIProjects(rawProjects as AIProject[]);
        }
      } catch (err) {
        console.error("[WidgetApp] Failed to fetch resumes/documents:", err);
      } finally {
        if (!cancelled) {
          setIsLoadingResumes(false);
          setIsLoadingDocs(false);
          setIsLoadingProjects(false);
        }
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user?.id, getToken]);

  const handleStartFlow = (isFree: boolean) => {
    setSessionInfo((prev) => ({ ...prev, isFree }));
    setCreationStep(1);
  };

  const handleCreateSession = async () => {
    if (isCreating) return;
    setIsCreating(true);

    // Always use the cached backend userId; it was resolved during the resume fetch.
    const userId = localStorage.getItem("userId");
    if (!userId) {
       toast.error(
         "User session not initialized. Please try logging in again.",
       );
      setIsCreating(false);
      return;
    }

    try {
      // 1. Create Session
      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("free", sessionInfo.isFree.toString());
      formData.append("companyName", sessionInfo.companyName);
      formData.append("jobDescription", sessionInfo.jobDescription);
      formData.append("resumeId", sessionInfo.resumeId);
      formData.append("documentId", sessionInfo.documentId);
      formData.append("language", sessionInfo.language);
      formData.append("simpleLanguage", sessionInfo.simpleLanguage.toString());
      formData.append("extraContext", sessionInfo.extraContext);
      formData.append("aiModel", sessionInfo.aiModel);
      formData.append("autoGenerateAI", sessionInfo.autoGenerateAI.toString());
      formData.append("saveTranscript", sessionInfo.saveTranscript.toString());
      if (sessionInfo.projectIds.length > 0) {
        formData.append("projectIds", JSON.stringify(sessionInfo.projectIds));
      }

      const createRes = await fetch(
        `${BACKEND_URL}/api/session/create-session`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!createRes.ok) {
        if (createRes.status === 409) {
          const errData = await safeJson<{ message?: string }>(createRes);
          const msg = errData?.message ?? "";
          if (msg.startsWith("ACTIVE_SESSION_EXISTS")) {
            toast.error("You already have an active session. Please end it before starting a new one.", {
              action: {
                label: "View Session",
                onClick: () => openUrl(`${FRONTEND_URL}/sessions`).catch(console.error),
              },
              duration: 8000,
            });
            setIsCreating(false);
            return;
          }
        }
        throw new Error("Failed to create session");
      }
      const createData = await safeJson<{ id?: string; sessionId?: string }>(createRes);
      if (!createData) throw new Error("Invalid response from create session");
      const sessionId = createData.id || createData.sessionId;

      // 2. Activate Session
      const activateRes = await fetch(
        `${BACKEND_URL}/api/session/${sessionId}/activate`,
        {
          method: "POST",
        },
      );

      if (!activateRes.ok) {
        if (activateRes.status === 409) {
          const errData = await safeJson<{ message?: string }>(activateRes);
          const msg = errData?.message ?? "";
          if (msg.startsWith("ACTIVE_SESSION_EXISTS")) {
            toast.error("Another session became active. Please end it first.", {
              action: {
                label: "View Session",
                onClick: () => openUrl(`${FRONTEND_URL}/sessions`).catch(console.error),
              },
              duration: 8000,
            });
            setIsCreating(false);
            return;
          }
        }
        throw new Error("Failed to activate session");
      }
      const activateData = await safeJson<{ startedAt?: string; maxAllowedMinutes?: number }>(activateRes) ?? {};

      // 3. Send session context directly to the mini window via event
      await emit("session-init", {
        sessionId,
        isFree: sessionInfo.isFree,
        aiModel: sessionInfo.aiModel,
        language: sessionInfo.language,
        companyName: sessionInfo.companyName,
        startedAt: activateData.startedAt ?? null,
        maxAllowedMinutes: activateData.maxAllowedMinutes ?? null,
      });

      // 4. Trigger Mini Screen
      await invoke("show_mini_top_center");

      // 5. Close current launcher
      await getCurrentWindow().hide();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const creditsOk = hasCredits(balance);

  // Keep a ref to the last known size so the ResizeObserver ignores
  // zero-height flashes that happen while Clerk is loading / transitioning.
  const lastKnownSizeRef = useRef<{ w: number; h: number } | null>(null);

  return (
    <div className="w-full select-none">
      <div
        ref={cardRef}
        style={{
          width: WIDGET_W * zoom,
        }}
      >
        <div
          className="rounded-3xl bg-white shadow-2xl shadow-black/20 overflow-hidden"
          style={{
            width: WIDGET_W,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div
              className="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing"
              onMouseDown={handleDragStart}
            >
              <HoverTooltip text={APP_NAME}>
                <img
                  src="/src-tauri/icons/icon.png"
                  alt={APP_NAME}
                  className="w-6 h-6 rounded-lg flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </HoverTooltip>
            </div>

            <CreditsBadge />

            <div className="flex items-center gap-0.5 ml-1">
              <HoverTooltip text="Menu" side="bottom">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className={cn(
                    "p-1.5 rounded-xl transition-colors border",
                    menuOpen
                      ? "bg-zinc-100 border-zinc-200 text-zinc-700"
                      : "border-transparent hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600",
                  )}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </HoverTooltip>
              <HoverTooltip text="Drag" side="bottom">
                <button
                  onMouseDown={handleDragStart}
                  className="p-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700 transition-colors cursor-grab active:cursor-grabbing"
                >
                  <Move className="w-3.5 h-3.5" />
                </button>
              </HoverTooltip>
              <HoverTooltip text={collapsed ? "Expand" : "Collapse"} side="bottom">
                <button
                  onClick={handleCollapseToggle}
                  className="p-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  {collapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </HoverTooltip>
              <HoverTooltip text="Close" side="bottom">
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </HoverTooltip>
            </div>
          </div>

          {/* ── Inline header menu ────────────────────────────────────────── */}
          {menuOpen && (
            <HeaderMenu
              onClose={() => setMenuOpen(false)}
              zoom={zoom}
              setZoom={setZoom}
              privateMode={privateMode}
              setPrivateMode={setPrivateModeState}
            />
          )}

          {/* ── Body ────────────────────────────────────────────────────────── */}
          {!collapsed && (
            <>
              {!isLoaded && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
                </div>
              )}

              {isLoaded && !isSignedIn && <AuthScreen />}

              {isLoaded && isSignedIn && (
                <>
                  <TabPills tab={tab} onChange={setTab} />

                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    <div className="min-h-full">
                      {tab === "create" ? (
                        <>
                          {creationStep === 0 && (
                            <>
                              <SessionSelector
                                selected={selectedKind}
                                onSelect={setSelectedKind}
                                creditsOk={creditsOk}
                                isLoadingBalance={isLoadingBalance}
                              />
                              <ActionButtons
                                balance={balance}
                                isLoadingBalance={isLoadingBalance}
                                onStart={handleStartFlow}
                              />
                            </>
                          )}

                          {creationStep === 1 && (
                            <div className="p-4 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Briefcase className="w-4 h-4 text-zinc-600" />
                                    <Label className="text-sm font-bold text-zinc-800">
                                      Company
                                    </Label>
                                    <HoverTooltip text="The name of the company you are interviewing with.">
                                      <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                    </HoverTooltip>
                                  </div>
                                  <Input
                                    placeholder="Microsoft..."
                                    value={sessionInfo.companyName}
                                    onChange={(e) =>
                                      setSessionInfo((p) => ({
                                        ...p,
                                        companyName: e.target.value,
                                      }))
                                    }
                                    className="rounded-xl border-zinc-200 focus:ring-zinc-500 h-11"
                                  />
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <FileText className="w-4 h-4 text-zinc-600" />
                                    <Label className="text-sm font-bold text-zinc-800">
                                      Job Description
                                    </Label>
                                    <HoverTooltip text="Paste the job description or title here.">
                                      <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                    </HoverTooltip>
                                  </div>
                                  <Textarea
                                    placeholder="Software Engineer versed in Python, SQL, and AWS..."
                                    value={sessionInfo.jobDescription}
                                    onChange={(e) =>
                                      setSessionInfo((p) => ({
                                        ...p,
                                        jobDescription: e.target.value,
                                      }))
                                    }
                                    className="rounded-xl border-zinc-200 focus:ring-zinc-500 min-h-25 max-h-45 resize-none overflow-y-auto"
                                  />
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Paperclip className="w-4 h-4 text-zinc-600" />
                                    <Label className="text-sm font-bold text-zinc-800">
                                      Resume
                                    </Label>
                                    <HoverTooltip text="Select the resume you want to use for this session.">
                                      <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                    </HoverTooltip>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <WidgetSelect
                                      value={sessionInfo.resumeId}
                                      onValueChange={(val) =>
                                        setSessionInfo((p) => ({
                                          ...p,
                                          resumeId: val,
                                        }))
                                      }
                                      placeholder="Select resume"
                                      options={resumes.map((r) => ({
                                        value: r.id,
                                        label: r.filename,
                                      }))}
                                      isLoading={isLoadingResumes}
                                      emptyMessage="No resumes uploaded yet"
                                      listClassName="max-h-[80px]"
                                    />
                                    {sessionInfo.resumeId && (
                                      <button
                                        onClick={() =>
                                          setSessionInfo((p) => ({
                                            ...p,
                                            resumeId: "",
                                          }))
                                        }
                                        className="p-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 transition-colors"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Folder className="w-4 h-4 text-zinc-600" />
                                    <Label className="text-sm font-bold text-zinc-800">
                                      Documents
                                    </Label>
                                    <HoverTooltip text="Additional documents or materials for the session.">
                                      <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                    </HoverTooltip>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <WidgetSelect
                                      value={sessionInfo.documentId}
                                      onValueChange={(val) =>
                                        setSessionInfo((p) => ({
                                          ...p,
                                          documentId: val,
                                        }))
                                      }
                                      placeholder="Select documents"
                                      options={documents.map((d) => ({
                                        value: d.id,
                                        label: d.filename,
                                      }))}
                                      isLoading={isLoadingDocs}
                                      emptyMessage="No documents uploaded yet"
                                      listClassName="max-h-[80px]"
                                    />
                                    {sessionInfo.documentId && (
                                      <button
                                        onClick={() =>
                                          setSessionInfo((p) => ({
                                            ...p,
                                            documentId: "",
                                          }))
                                        }
                                        className="p-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 transition-colors"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-2">
                                <button
                                  onClick={() => setCreationStep(0)}
                                  className="py-2.5 rounded-2xl border border-zinc-200 bg-white text-zinc-800 text-sm font-bold hover:bg-zinc-50 transition-all active:scale-[0.98]"
                                >
                                  Back
                                </button>
                                {(() => {
                                  const jdTrimmed = sessionInfo.jobDescription.trim();
                                  const jdValid = !jdTrimmed || JOB_DESCRIPTION_REGEX.test(jdTrimmed);
                                  const canProceed =
                                    !!sessionInfo.companyName.trim() &&
                                    !!sessionInfo.resumeId &&
                                    jdValid;
                                  const tooltipMsg = !sessionInfo.companyName.trim()
                                    ? "Enter the company name to continue."
                                    : !sessionInfo.resumeId
                                      ? "Select a resume to continue."
                                      : !jdValid
                                        ? "Job description is too short — add more detail."
                                        : "";
                                  return (
                                <HoverTooltip text={tooltipMsg} side="top" className="w-full">
                                <button
                                  onClick={() => setCreationStep(2)}
                                  disabled={!canProceed}
                                  aria-disabled={!canProceed}
                                  className={cn(
                                    "w-full py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]",
                                    canProceed
                                      ? "bg-zinc-900 text-white hover:bg-zinc-800 shadow-lg shadow-black/10"
                                      : "bg-zinc-200 text-zinc-400 cursor-not-allowed",
                                  )}
                                >
                                  Next
                                </button>
                                </HoverTooltip>
                                  );
                                })()}
                              </div>
                            </div>
                          )}

                          {creationStep === 2 && (
                            <div className="p-4 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <Globe className="w-4 h-4 text-zinc-600" />
                                      <Label className="text-sm font-bold text-zinc-800">
                                        Language
                                      </Label>
                                      <HoverTooltip text="Preferred language for AI responses.">
                                        <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                      </HoverTooltip>
                                    </div>
                                    <WidgetSelect
                                      value={sessionInfo.language}
                                      onValueChange={(val) =>
                                        setSessionInfo((p) => ({
                                          ...p,
                                          language: val,
                                        }))
                                      }
                                      placeholder="Language"
                                      options={[
                                        { value: "English", label: "English" },
                                        { value: "Spanish", label: "Spanish" },
                                        { value: "French", label: "French" },
                                      ]}
                                    />
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <Label className="text-sm font-bold text-zinc-800">
                                          Simple Language
                                        </Label>
                                        <HoverTooltip text="Makes AI responses simpler and easier to understand.">
                                          <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                        </HoverTooltip>
                                      </div>
                                      <Switch
                                        checked={sessionInfo.simpleLanguage}
                                        onCheckedChange={(val) =>
                                          setSessionInfo((p) => ({
                                            ...p,
                                            simpleLanguage: val,
                                          }))
                                        }
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Settings className="w-4 h-4 text-zinc-600" />
                                    <Label className="text-sm font-bold text-zinc-800">
                                      Extra Context/Instructions
                                    </Label>
                                    <HoverTooltip text="Provide additional instructions for the AI assistant.">
                                      <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                    </HoverTooltip>
                                  </div>
                                  <Textarea
                                    placeholder="Use javascript, react, nodeJs for code generation"
                                    value={sessionInfo.extraContext}
                                    onChange={(e) =>
                                      setSessionInfo((p) => ({
                                        ...p,
                                        extraContext: e.target.value,
                                      }))
                                    }
                                    className="rounded-xl border-zinc-200 focus:ring-zinc-500 min-h-[60px] resize-none"
                                  />
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Cpu className="w-4 h-4 text-zinc-600" />
                                    <Label className="text-sm font-bold text-zinc-800">
                                      AI Model
                                    </Label>
                                    <HoverTooltip text="The AI model that will power your assistant.">
                                      <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                    </HoverTooltip>
                                  </div>
                                  <WidgetSelect
                                    value={sessionInfo.aiModel}
                                    onValueChange={(val) =>
                                      setSessionInfo((p) => ({
                                        ...p,
                                        aiModel: val,
                                      }))
                                    }
                                    placeholder="Select AI model"
                                    options={AI_MODELS_WIDGET}
                                    className="w-full"
                                  />
                                </div>

                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Sparkles className="w-4 h-4 text-zinc-600" />
                                      <Label className="text-sm font-medium text-zinc-700">
                                        Auto Generate AI Response
                                      </Label>
                                      <HoverTooltip text="Automatically generate responses based on the conversation.">
                                        <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                      </HoverTooltip>
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold shadow-sm shadow-emerald-500/10">
                                        New
                                      </span>
                                    </div>
                                    <Switch
                                      checked={sessionInfo.autoGenerateAI}
                                      onCheckedChange={(val) =>
                                        setSessionInfo((p) => ({
                                          ...p,
                                          autoGenerateAI: val,
                                        }))
                                      }
                                    />
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <History className="w-4 h-4 text-zinc-600" />
                                      <Label className="text-sm font-medium text-zinc-700">
                                        Save Transcript
                                      </Label>
                                      <HoverTooltip text="Save the full conversation transcript for later review.">
                                        <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                      </HoverTooltip>
                                    </div>
                                    <Switch
                                      checked={sessionInfo.saveTranscript}
                                      onCheckedChange={(val) =>
                                        setSessionInfo((p) => ({
                                          ...p,
                                          saveTranscript: val,
                                        }))
                                      }
                                    />
                                  </div>
                                </div>

                                {/* ── AI Projects context ── */}
                                {(aiProjects.length > 0 || isLoadingProjects) && (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <Folder className="w-4 h-4 text-zinc-600" />
                                      <Label className="text-sm font-bold text-zinc-800">
                                        AI Projects Context
                                      </Label>
                                      <HoverTooltip text="Select AI-generated projects to include as additional context. The AI will use these as real project experience when answering questions.">
                                        <Info className="w-3 h-3 text-zinc-400 cursor-help" />
                                      </HoverTooltip>
                                      <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
                                        Optional
                                      </span>
                                    </div>
                                    {isLoadingProjects ? (
                                      <div className="flex items-center gap-2 text-xs text-zinc-400 py-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Loading projects...
                                      </div>
                                    ) : (
                                      <div className="flex flex-col gap-1 max-h-[110px] overflow-y-auto pr-0.5">
                                        {aiProjects.map((proj) => {
                                          const isSelected = sessionInfo.projectIds.includes(proj.id);
                                          const firstTitle = proj.projects?.[0]?.projectHeader?.title;
                                          const label = firstTitle || proj.position || "AI Project";
                                          return (
                                            <button
                                              key={proj.id}
                                              type="button"
                                              onClick={() =>
                                                setSessionInfo((p) => ({
                                                  ...p,
                                                  projectIds: isSelected
                                                    ? p.projectIds.filter((id) => id !== proj.id)
                                                    : [...p.projectIds, proj.id],
                                                }))
                                              }
                                              className={cn(
                                                "flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all text-left",
                                                isSelected
                                                  ? "bg-violet-50 border-violet-300 text-violet-800"
                                                  : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                                              )}
                                            >
                                              <div
                                                className={cn(
                                                  "w-3.5 h-3.5 rounded-sm border-2 flex-shrink-0 flex items-center justify-center",
                                                  isSelected
                                                    ? "bg-violet-600 border-violet-600"
                                                    : "border-zinc-300",
                                                )}
                                              >
                                                {isSelected && (
                                                  <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                                                  </svg>
                                                )}
                                              </div>
                                              <span className="truncate">{label}</span>
                                              <span className="ml-auto flex-shrink-0 text-[10px] text-zinc-400">
                                                {proj.projects?.length ?? 0} project{(proj.projects?.length ?? 0) !== 1 ? "s" : ""}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-2">
                                <button
                                  onClick={() => setCreationStep(1)}
                                  className="py-2.5 rounded-2xl border border-zinc-200 bg-white text-zinc-800 text-sm font-bold hover:bg-zinc-50 transition-all active:scale-[0.98]"
                                >
                                  Back
                                </button>
                                <button
                                  onClick={handleCreateSession}
                                  disabled={isCreating}
                                  className="py-2.5 rounded-2xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-black/10"
                                >
                                  {isCreating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    `Create ${sessionInfo.isFree ? "Free" : "Premium"} Session`
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <PastSessionsTab />
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function WidgetApp() {
  if (!PUBLISHABLE_KEY) {
    return <div className="text-xs text-red-500 p-4">Missing Clerk key</div>;
  }
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      allowedRedirectProtocols={["tauri:", "http:", "https:"]}
    >
      <WidgetContent />
    </ClerkProvider>
  );
}

createRoot(document.getElementById("launcher-root")!).render(
  <React.StrictMode>
    <WidgetApp />
  </React.StrictMode>,
);
