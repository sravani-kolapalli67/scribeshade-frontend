import { useEffect, type RefObject } from "react";
import { tauriOverlay } from "@/services/tauriOverlay";

interface UseCursorPassthroughOptions {
  isDraggingRef: RefObject<boolean>;
  forceInteractive?: boolean;
  forcePassthrough?: boolean;
}

/**
 * Polls the OS cursor position and toggles Tauri's setIgnoreCursorEvents
 * based on whether the cursor overlaps a [data-interactive] element.
 *
 * CRITICAL: WKWebView/WebView2 receives ZERO mouse events while pass-through
 * is ON, so we cannot use mousemove for entry detection. We poll a Rust
 * command on a setTimeout chain.
 *
 * While passthrough is OFF (interactive mode), the window DOES receive mouse
 * events. We install a mousemove listener at that point for instant exit
 * detection — the moment the cursor leaves all [data-interactive] rects,
 * passthrough is enabled immediately without waiting for the next poll tick.
 *
 * Key design constraints:
 *
 * 1. Loop immortality — the continuation MUST be in the outermost finally block
 *    so the loop survives every exit path: early return (forcePassthrough /
 *    isDragging), exceptions, and concurrent-skip guards.
 *
 * 2. setTimeout, not RAF — WKWebView pauses requestAnimationFrame callbacks
 *    while ScribeShade is not the active macOS application. setTimeout keeps
 *    firing while deactivated, so the cursor poll continues and passthrough
 *    recovers BEFORE the user's first click back.
 *
 * 3. macOS watchdog — every REASSERT_INTERVAL_MS the desired native state is
 *    re-applied even if our cached JS value is unchanged. Disabled on Windows
 *    (would reintroduce DWM surface flicker from excessive setIgnoreCursorEvents
 *    churn, WN1/WN6).
 *
 * 4. Blur cache invalidation — on app deactivation we drop the window-bounds /
 *    scale cache and clear lastPassthrough so the very next poll re-asserts
 *    native state from scratch, eliminating any desync without waiting for the
 *    watchdog.
 */
export function useCursorPassthrough({
  isDraggingRef,
  forceInteractive = false,
  forcePassthrough = false,
}: UseCursorPassthroughOptions): void {
  useEffect(() => {
    let timer = 0;
    let startTimeout = 0;
    let cancelled = false;
    let isTickRunning = false;
    let lastPassthrough: boolean | null = null;
    let cachedScale = 1;
    let cachedWinPos = { x: 0, y: 0 };
    let lastCacheUpdate = 0;
    let idleCycles = 0;
    let lastReassert = 0;
    // True while the document-level mousemove listener for instant exit
    // detection is installed. Only installed when passthrough is OFF.
    let mouseMoveInstalled = false;

    const ua = navigator.userAgent.toLowerCase();
    const isWindows = ua.includes("windows");
    // Windows: 40ms base (was 120ms) so cursor-over-card is detected in ≤40ms.
    // Idle (unchanged state for IDLE_THRESHOLD cycles) slows to 80ms to save
    // IPC overhead when the cursor is parked far from the card.
    // macOS stays at 32/64ms — it has a native watchdog so the poll is already
    // complemented by the force-reassert path.
    const POLL_BASE_MS = isWindows ? 40 : 32;
    const POLL_IDLE_MS = isWindows ? 80 : 64;
    const IDLE_THRESHOLD = 6;
    const CACHE_TTL_MS = isWindows ? 2000 : 500;
    const REASSERT_INTERVAL_MS = 200;

    function collectInteractiveRects(): DOMRect[] {
      const nodes = document.querySelectorAll<HTMLElement>("[data-interactive]");
      const rects: DOMRect[] = [];
      for (let i = 0; i < nodes.length; i++) {
        rects.push(nodes[i].getBoundingClientRect());
      }
      return rects;
    }

    function isPointInRects(rects: DOMRect[], x: number, y: number) {
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
      }
      return false;
    }

    // Instant exit handler: fires via mousemove while the window is interactive.
    // e.clientX/Y and getBoundingClientRect() are both in CSS viewport coordinates
    // so no DPI conversion is needed here — the comparison is coordinate-exact.
    const handleMouseMoveExit = (e: MouseEvent) => {
      if (cancelled) return;
      const rects = collectInteractiveRects();
      const over = isPointInRects(rects, e.clientX, e.clientY);
      if (!over) {
        // Remove the listener before the async call so re-entrant events
        // during the IPC await don't trigger duplicate setPassthrough calls.
        document.removeEventListener("mousemove", handleMouseMoveExit, true);
        mouseMoveInstalled = false;
        void setPassthrough(true);
      }
    };

    async function setPassthrough(p: boolean, force = false) {
      if (cancelled) return;
      const changed = p !== lastPassthrough;
      if (!changed && !force) return;
      lastPassthrough = p;
      if (changed) idleCycles = 0;

      // While interactive (p=false) and not in a forced mode, install the
      // mousemove listener so cursor exit is detected instantly — no poll lag.
      // While passthrough (p=true), remove it (window gets no events anyway).
      if (!p && !mouseMoveInstalled && !forceInteractive && !forcePassthrough) {
        mouseMoveInstalled = true;
        document.addEventListener("mousemove", handleMouseMoveExit, {
          capture: true,
          passive: true,
        });
      } else if (p && mouseMoveInstalled) {
        mouseMoveInstalled = false;
        document.removeEventListener("mousemove", handleMouseMoveExit, true);
      }

      try {
        await tauriOverlay.setIgnoreCursorEvents(p);
        if (changed) {
          console.debug(
            `[passthrough] state -> ${p ? "PASSTHROUGH" : "INTERACTIVE"}`,
          );
        }
      } catch (e) {
        console.error("[passthrough] setIgnoreCursorEvents failed", e);
      }
    }

    async function runTickBody() {
      let desired: boolean;

      if (forcePassthrough) {
        desired = true;
      } else if (isDraggingRef.current || forceInteractive) {
        desired = false;
      } else {
        const now = performance.now();
        if (now - lastCacheUpdate > CACHE_TTL_MS) {
          lastCacheUpdate = now;
          const [pos, scale] = await Promise.all([
            tauriOverlay.getOuterPosition(),
            tauriOverlay.getScaleFactor(),
          ]);
          cachedWinPos = { x: pos.x, y: pos.y };
          cachedScale = scale;
        }

        const [gx, gy] = await tauriOverlay.getCursorPosition();

        const localPhysX = (gx - cachedWinPos.x) / cachedScale;
        const localPhysY = (gy - cachedWinPos.y) / cachedScale;
        const localLogX = gx - cachedWinPos.x;
        const localLogY = gy - cachedWinPos.y;

        const rects = collectInteractiveRects();
        const over =
          isPointInRects(rects, localPhysX, localPhysY) ||
          isPointInRects(rects, localLogX, localLogY);

        desired = !over;

        const forceReassert = !isWindows && now - lastReassert > REASSERT_INTERVAL_MS;
        if (forceReassert) lastReassert = now;

        const before = lastPassthrough;
        await setPassthrough(desired, forceReassert);
        if (lastPassthrough === before) {
          idleCycles = Math.min(idleCycles + 1, IDLE_THRESHOLD + 1);
        }
        return;
      }

      await setPassthrough(desired);
    }

    async function tick() {
      if (cancelled) return;
      try {
        if (isTickRunning) return;
        isTickRunning = true;
        try {
          await runTickBody();
        } catch (e) {
          console.debug("[passthrough] tick error", e);
        } finally {
          isTickRunning = false;
        }
      } finally {
        if (!cancelled) {
          const interval = idleCycles >= IDLE_THRESHOLD ? POLL_IDLE_MS : POLL_BASE_MS;
          timer = window.setTimeout(() => void tick(), interval);
        }
      }
    }

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[data-interactive]")) {
        event.preventDefault();
        void setPassthrough(true);
      }
    };
    document.addEventListener("contextmenu", handleContextMenu, true);

    // On app deactivation: drop cache, null lastPassthrough, and reset idle
    // counter so the very next poll tick runs at full speed and re-asserts
    // native state unconditionally — no waiting for the watchdog or idle decay.
    const invalidateForRecovery = () => {
      lastCacheUpdate = 0;
      lastPassthrough = null;
      lastReassert = 0;
      idleCycles = 0; // ensure next tick runs at POLL_BASE_MS, not POLL_IDLE_MS
    };
    const handleBlur = () => invalidateForRecovery();
    const handleVisibility = () => { if (!document.hidden) invalidateForRecovery(); };
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);

    const scheduleFirstTick = () => {
      timer = window.setTimeout(() => void tick(), 0);
    };
    if (isWindows) {
      // 80ms (was 300ms): enough for the Rust run_on_main_thread closure that
      // sets set_ignore_cursor_events(true) to have executed before the poll
      // starts overriding it, while keeping the interactive-area cold-start
      // delay below perceptible threshold.
      startTimeout = window.setTimeout(scheduleFirstTick, 80);
    } else {
      scheduleFirstTick();
    }

    return () => {
      cancelled = true;
      clearTimeout(startTimeout);
      clearTimeout(timer);
      if (mouseMoveInstalled) {
        document.removeEventListener("mousemove", handleMouseMoveExit, true);
        mouseMoveInstalled = false;
      }
      document.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
      tauriOverlay.setIgnoreCursorEvents(true).catch(console.error);
    };
  }, [forceInteractive, forcePassthrough, isDraggingRef]);
}
