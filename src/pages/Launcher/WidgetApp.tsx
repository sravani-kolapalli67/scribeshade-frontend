import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCreditsBalance } from "@/hooks/useCreditsBalance";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModelSelector } from "@/pages/Sessions/ActiveSession/components/ModelSelector";
import "@/App.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL ;
const WIDGET_W = 460;
const APP_NAME = "CraftVita";
const ZOOM_KEY = "craftvita.widget.zoom";
const PRIVATE_KEY = "craftvita.widget.private";
const AUTODETECT_KEY = "craftvita.widget.autodetect";
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;

const JOB_DESCRIPTION_REGEX = /^.{2,}$/i;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCredits(raw: string | null | undefined): string {
  if (!raw) return "0";
  const n = parseFloat(raw);
  if (isNaN(n)) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
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
}: {
  text: string;
  children: React.ReactNode;
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
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
        <HoverTooltip text="Free sessions are limited to 10 minutes.\nPremium sessions use 1 credit per minute and unlock AI responses.">
          <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help" />
        </HoverTooltip>
      </div>

      {/* <div className="flex flex-col gap-1.5">
        <button
          onClick={() => onSelect("free")}
          className={cn(
            "flex items-center justify-between px-3 py-2.5 rounded-2xl border text-left transition-all",
            selected === "free"
              ? "border-zinc-800 bg-zinc-50"
              : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/60",
          )}
        >
          <div>
            <div className="text-sm font-medium text-zinc-800">
              Free session
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              10 min · no credits required
            </div>
          </div>
          <RadioDot active={selected === "free"} />
        </button>

        <button
          onClick={() => !premiumDisabled && onSelect("premium")}
          disabled={premiumDisabled}
          className={cn(
            "flex items-center justify-between px-3 py-2.5 rounded-2xl border text-left transition-all",
            selected === "premium" && !premiumDisabled
              ? "border-zinc-800 bg-zinc-50"
              : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/60",
            premiumDisabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <div>
            <div className="text-sm font-medium text-zinc-800">
              Premium session
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              Unlimited · AI responses
              {premiumDisabled && (
                <span className="ml-2 text-[10px] font-semibold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                  No credits
                </span>
              )}
            </div>
          </div>
          <RadioDot active={selected === "premium" && !premiumDisabled} />
        </button>
      </div> */}
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

function PastSessionsTab() {
  return (
    <div className="flex flex-col items-center gap-3 px-3 pt-4 pb-4">
      <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
        <ExternalLink className="w-4 h-4 text-zinc-400" />
      </div>
      <p className="text-xs text-zinc-500 text-center leading-snug">
        Your past sessions live in the dashboard.
      </p>
      <button
        onClick={() => openUrl(`${FRONTEND_URL}/sessions`).catch(console.error)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition-all active:scale-[0.97]"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Open Past Sessions
      </button>
    </div>
  );
}

// ─── AuthScreen (signed-out) ──────────────────────────────────────────────────

function AuthScreen() {
  return (
    <div className="flex flex-col items-center gap-3 px-5 pt-3 pb-5">
      <h2 className="text-lg font-bold text-zinc-900 text-center">
        {APP_NAME}
      </h2>
      <p className="text-sm text-zinc-500 text-center leading-snug">
        Login to your {APP_NAME} account to start your interview.
      </p>
      <button
        onClick={() => openUrl(`${FRONTEND_URL}/sign-in`).catch(console.error)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-1 rounded-2xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors active:scale-[0.97]"
      >
        <LogIn className="w-3.5 h-3.5" />
        Login
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
{/* 
      <div className="px-1 py-1">
        <MenuToggle
          label="Private"
          tooltip="Hide the widget from screen recording and screen capture."
          checked={privateMode}
          onChange={handlePrivate}
        />
        <MenuToggle
          label="Auto-detect"
          tooltip="Auto-detect interview audio sources (coming soon)."
          checked={autoDetect}
          onChange={handleAutoDetect}
          disabled
        />
      </div> */}

      {/* <div className="h-px bg-zinc-100" /> */}

      {/* <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium text-zinc-700">Zoom</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => adjustZoom(ZOOM_STEP)}
            className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-600"
            title="Zoom in"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => adjustZoom(-ZOOM_STEP)}
            className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-600"
            title="Zoom out"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={resetZoom}
            className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-600"
            title="Reset zoom"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div> */}

      {/* {isSignedIn && (
        <>
          <div className="h-px bg-zinc-100" />
          <button
            onClick={async () => {
              await signOut().catch(console.error);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-red-50 text-red-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </>
      )} */}
    </div>
  );
}

// ─── WidgetContent ────────────────────────────────────────────────────────────

function WidgetContent() {
  const { isLoaded, isSignedIn, user } = useUser();
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
  });
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
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
      if (h > 0)
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

  // Fetch resumes and documents
  useEffect(() => {
    if (isSignedIn && user?.id) {
      setIsLoadingResumes(true);
      setIsLoadingDocs(true);
      const userId = localStorage.getItem("userId") || user.id;

      // Resumes
      fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/resume/list?userId=${userId}`,
      )
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : data.data || [];
          setResumes(list);
        })
        .catch(console.error)
        .finally(() => setIsLoadingResumes(false));

      // Documents
      fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/document/list?userId=${userId}`,
      )
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : data.data || [];
          setDocuments(list);
        })
        .catch(console.error)
        .finally(() => setIsLoadingDocs(false));
    }
  }, [isSignedIn, user?.id]);

  const handleStartFlow = (isFree: boolean) => {
    setSessionInfo((prev) => ({ ...prev, isFree }));
    setCreationStep(1);
  };

  const handleCreateSession = async () => {
    if (isCreating) return;
    setIsCreating(true);

    const userId = localStorage.getItem("userId") || user?.id;
    if (!userId) {
      console.error("No user ID found");
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

      const createRes = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/session/create-session`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!createRes.ok) throw new Error("Failed to create session");
      const createData = await createRes.json();
      const sessionId = createData.id || createData.sessionId;

      // 2. Activate Session
      const activateRes = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/session/${sessionId}/activate`,
        {
          method: "POST",
        },
      );

      if (!activateRes.ok) throw new Error("Failed to activate session");
      const activateData = await activateRes.json();

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

  if (!isLoaded) return null;

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
              <img
                src="/src-tauri/icons/icon.png"
                alt=""
                className="w-6 h-6 rounded-lg flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="text-sm font-semibold text-zinc-800 truncate">
                {APP_NAME}
              </span>
            </div>

            <CreditsBadge />

            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className={cn(
                  "p-1.5 rounded-xl transition-colors border",
                  menuOpen
                    ? "bg-zinc-100 border-zinc-200 text-zinc-700"
                    : "border-transparent hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600",
                )}
                title="Menu"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              <button
                onMouseDown={handleDragStart}
                className="p-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700 transition-colors cursor-grab active:cursor-grabbing"
                title="Drag"
              >
                <Move className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCollapseToggle}
                className="p-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700 transition-colors"
                title={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors ml-0.5"
                title="Close"
              >
                <X className="w-3 h-3" />
              </button>
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
                <div className="flex items-center justify-center py-8">
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
                                    className="rounded-xl border-zinc-200 focus:ring-zinc-500 min-h-[80px] resize-none"
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
                                    <Select
                                      value={sessionInfo.resumeId}
                                      onValueChange={(val) =>
                                        setSessionInfo((p) => ({
                                          ...p,
                                          resumeId: val,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="flex-1 min-w-0 rounded-xl border-zinc-200 h-11 bg-white [&>span:first-child]:truncate [&>span:first-child]:min-w-0">
                                        <SelectValue placeholder="Select resume" />
                                      </SelectTrigger>
                                      <SelectContent className="rounded-xl">
                                        {resumes.map((r) => (
                                          <SelectItem
                                            key={r.id}
                                            value={r.id}
                                            className="cursor-pointer max-w-85 truncate"
                                          >
                                            {r.filename}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
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
                                    <Select
                                      value={sessionInfo.documentId}
                                      onValueChange={(val) =>
                                        setSessionInfo((p) => ({
                                          ...p,
                                          documentId: val,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="flex-1 min-w-0 rounded-xl border-zinc-200 h-11 bg-white [&>span:first-child]:truncate [&>span:first-child]:min-w-0">
                                        <SelectValue placeholder="Select documents" />
                                      </SelectTrigger>
                                      <SelectContent className="rounded-xl">
                                        {documents.map((d) => (
                                          <SelectItem
                                            key={d.id}
                                            value={d.id}
                                            className="cursor-pointer max-w-85 truncate"
                                          >
                                            {d.filename}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
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
                                <button
                                  onClick={() => setCreationStep(2)}
                                  disabled={
                                    !sessionInfo.companyName.trim() ||
                                    !JOB_DESCRIPTION_REGEX.test(sessionInfo.jobDescription.trim())
                                  }
                                  className={cn(
                                    "py-2.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98]",
                                    sessionInfo.companyName.trim() &&
                                    JOB_DESCRIPTION_REGEX.test(sessionInfo.jobDescription.trim())
                                      ? "bg-zinc-900 hover:bg-zinc-800 shadow-lg shadow-black/10"
                                      : "bg-zinc-300 text-zinc-400 cursor-not-allowed",
                                  )}
                                >
                                  Next
                                </button>
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
                                    <Select
                                      value={sessionInfo.language}
                                      onValueChange={(val) =>
                                        setSessionInfo((p) => ({
                                          ...p,
                                          language: val,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="rounded-xl border-zinc-200 h-10">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="rounded-xl">
                                        <SelectItem value="English">
                                          English
                                        </SelectItem>
                                        <SelectItem value="Spanish">
                                          Spanish
                                        </SelectItem>
                                        <SelectItem value="French">
                                          French
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
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
                                  <ModelSelector
                                    value={sessionInfo.aiModel}
                                    onChange={(val) =>
                                      setSessionInfo((p) => ({
                                        ...p,
                                        aiModel: val,
                                      }))
                                    }
                                    isFullscreen={false}
                                    className="w-full h-11 bg-white border-zinc-200 text-zinc-800"
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
      afterSignOutUrl="/"
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
