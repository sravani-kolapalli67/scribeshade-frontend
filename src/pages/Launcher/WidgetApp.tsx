import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
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
} from "lucide-react";
import "@/App.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const WIDGET_W = 460;
const APP_NAME = "CraftVita";
const ZOOM_KEY = "craftvita.widget.zoom";
const PRIVATE_KEY = "craftvita.widget.private";
const AUTODETECT_KEY = "craftvita.widget.autodetect";
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;

type SessionKind = "free" | "premium";
type Tab = "create" | "past";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCredits(raw: string | null | undefined): string {
  if (!raw) return "0";
  const n = parseFloat(raw);
  if (isNaN(n)) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

function hasCredits(balance: ReturnType<typeof useCreditsBalance>["balance"]): boolean {
  if (!balance) return false;
  const total = parseFloat(balance.totalAvailable ?? "0");
  return !isNaN(total) && total > 0;
}

// ─── Tooltip (lightweight inline) ─────────────────────────────────────────────
//
//  Cannot use portal-based tooltips because the Tauri window is exact-fit
//  to card size; portals would clip. This stays inside the cardRef tree.

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
      <Coins className={cn("w-3 h-3", creditsOk ? "text-amber-400" : "opacity-50")} />
      <span>{creditsOk ? `${total} Credits` : "No Credits"}</span>
    </div>
  );

  if (!creditsOk) {
    return (
      <HoverTooltip text={`You don't have any interview credits.\nBuy some to start a paid session.`}>
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
        <span className="text-sm font-bold text-zinc-800">Select Session Type</span>
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
            <div className="text-sm font-medium text-zinc-800">Free session</div>
            <div className="text-xs text-zinc-400 mt-0.5">10 min · no credits required</div>
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
            <div className="text-sm font-medium text-zinc-800">Premium session</div>
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
  selected,
}: {
  balance: ReturnType<typeof useCreditsBalance>["balance"];
  isLoadingBalance: boolean;
  selected: SessionKind;
}) {
  const [launchingFree, setLaunchingFree] = useState(false);
  const [launchingRight, setLaunchingRight] = useState(false);
  const noCreditState = !hasCredits(balance) && !isLoadingBalance;

  // The "Right" button mirrors the selected session type unless the user has
  // no credits — in which case it switches to "Buy Credits".
  const rightIsBuyCredits = noCreditState;

  const handleFreeSession = useCallback(async () => {
    setLaunchingFree(true);
    try {
      await invoke("open_main_dashboard", { route: "/sessions", showCreate: true, isFree: true });
    } catch (e) {
      console.error(e);
    } finally {
      setLaunchingFree(false);
    }
  }, []);

  const handleRightButton = useCallback(async () => {
    if (rightIsBuyCredits) {
      await invoke("open_main_dashboard", { route: "/billing" }).catch(console.error);
      return;
    }
    setLaunchingRight(true);
    try {
      await invoke("open_main_dashboard", {
        route: "/sessions",
        showCreate: true,
        isFree: selected === "free",
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLaunchingRight(false);
    }
  }, [rightIsBuyCredits, selected]);

  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-2">
      <button
        onClick={handleFreeSession}
        disabled={launchingFree}
        className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl border border-zinc-200 bg-white text-zinc-800 text-sm font-semibold hover:bg-zinc-50 hover:border-zinc-300 transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {launchingFree ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        Free Session
      </button>

      <button
        onClick={handleRightButton}
        disabled={launchingRight || isLoadingBalance}
        className={cn(
          "flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed",
          rightIsBuyCredits
            ? "bg-amber-500 hover:bg-amber-600 text-white"
            : "bg-zinc-900 hover:bg-zinc-800 text-white",
        )}
      >
        {launchingRight ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : rightIsBuyCredits ? (
          <Coins className="w-3.5 h-3.5" />
        ) : (
          <Zap className="w-3.5 h-3.5" />
        )}
        {rightIsBuyCredits ? "Buy Credits" : "Full Session"}
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
        onClick={() => invoke("open_main_dashboard", { route: "/sessions" }).catch(console.error)}
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
      <h2 className="text-lg font-bold text-zinc-900 text-center">{APP_NAME}</h2>
      <p className="text-sm text-zinc-500 text-center leading-snug">
        Login to your {APP_NAME} account to start your interview.
      </p>
      <button
        onClick={() => invoke("open_main_dashboard", { route: "/sign-in" }).catch(console.error)}
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
        <span className={cn("text-sm font-medium", disabled ? "text-zinc-400" : "text-zinc-700")}>{label}</span>
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
//
//  Rendered INLINE (not portal) so the Tauri window grows to fit it via the
//  ResizeObserver that drives `win.setSize()`.

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
      // NOTE: native screen-capture protection hookup is wired up in the
      // Tauri backend separately; the persisted flag is read at next launch.
    },
    [setPrivateMode],
  );

  const adjustZoom = useCallback(
    (delta: number) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(zoom + delta).toFixed(2)));
      setZoom(next);
    },
    [zoom, setZoom],
  );

  const resetZoom = useCallback(() => setZoom(1), [setZoom]);

  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;

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
          invoke("open_main_dashboard", { route: "/dashboard" }).catch(console.error);
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
      </div>

      <div className="h-px bg-zinc-100" />

      <div className="flex items-center justify-between px-3 py-2">
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
      </div>

      {isSignedIn && (
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
      )}
    </div>
  );
}

// ─── WidgetContent ────────────────────────────────────────────────────────────

function WidgetContent() {
  const { isLoaded, isSignedIn } = useUser();
  const { balance, isLoading: isLoadingBalance } = useCreditsBalance();
  const [selected, setSelected] = useState<SessionKind>("free");
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
        entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height ?? 0,
      );
      const w = Math.ceil(
        entries[0]?.borderBoxSize?.[0]?.inlineSize ?? entries[0]?.contentRect.width ?? WIDGET_W,
      );
      if (h > 0) win.setSize(new LogicalSize(w || WIDGET_W, h)).catch(console.error);
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
  const handleClose = useCallback(() => win.close().catch(console.error), [win]);

  // ── Sign-out broadcast from main window ───────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<void>("auth:signed-out", () => {
      setSelected("free");
      setTab("create");
      setMenuOpen(false);
    })
      .then((fn) => { unlisten = fn; })
      .catch(console.error);
    return () => { unlisten?.(); };
  }, []);

  const creditsOk = hasCredits(balance);

  return (
    <div className="w-full select-none">
      {/*
        cardRef is observed by ResizeObserver → drives the Tauri window size.
        Width is explicitly set; height is intrinsic. Zoom uses CSS transform
        with origin top-left, and the card scales the parent's measured box.
      */}
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
              <span className="text-sm font-semibold text-zinc-800 truncate">{APP_NAME}</span>
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
                {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
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

                  {tab === "create" ? (
                    <>
                      <SessionSelector
                        selected={selected}
                        onSelect={setSelected}
                        creditsOk={creditsOk}
                        isLoadingBalance={isLoadingBalance}
                      />
                      <ActionButtons
                        balance={balance}
                        isLoadingBalance={isLoadingBalance}
                        selected={selected}
                      />
                    </>
                  ) : (
                    <PastSessionsTab />
                  )}
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
