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
 * is ON, so we cannot use mousemove. We use a Rust command + RAF polling.
 *
 * Windows performance notes:
 * - A concurrent-tick guard (isTickRunning) prevents IPC backlog: if the
 *   previous tick's await is still pending when the next interval fires, the
 *   new tick is skipped rather than stacking another in-flight IPC call.
 * - The base poll interval is 120 ms on Windows (~8 fps) vs 16 ms on macOS
 *   (~60 fps). 8 fps is imperceptible for hit-testing; it reduces IPC load
 *   by ~3× compared to the previous 42 ms setting.
 * - Adaptive throttling doubles the interval to 240 ms after 6 consecutive
 *   cycles with no passthrough-state change, and resets on any change.
 * - Both physical and logical coordinate conversions are tested on all
 *   platforms so non-100% DPI scaling on Windows (125 %, 150 %) doesn't
 *   cause hit-tests to silently miss interactive regions.
 */
export function useCursorPassthrough({
  isDraggingRef,
  forceInteractive = false,
  forcePassthrough = false,
}: UseCursorPassthroughOptions): void {
  useEffect(() => {
    let raf = 0;
    let startTimeout = 0;
    let cancelled = false;
    // Prevent concurrent ticks: if an IPC await is still pending when the
    // next scheduled tick fires, skip it instead of queuing another call.
    let isTickRunning = false;
    let lastPassthrough: boolean | null = null;
    let cachedScale = 1;
    let cachedWinPos = { x: 0, y: 0 };
    let lastCacheUpdate = 0;
    let idleCycles = 0;

    const ua = navigator.userAgent.toLowerCase();
    const isWindows = ua.includes("windows");
    // Base interval: 120 ms on Windows (~8 fps), 16 ms on macOS (~60 fps).
    const POLL_BASE_MS = isWindows ? 120 : 16;
    // Slow-idle interval: used after 6+ cycles with no state change.
    const POLL_IDLE_MS = isWindows ? 240 : 50;
    const IDLE_THRESHOLD = 6;

    async function setPassthrough(p: boolean) {
      if (cancelled) return;
      if (p === lastPassthrough) return;
      lastPassthrough = p;
      idleCycles = 0;
      try {
        await tauriOverlay.setIgnoreCursorEvents(p);
      } catch (e) {
        console.error("[passthrough]", e);
      }
    }

    function isPointInInteractiveRegion(localX: number, localY: number) {
      const nodes = document.querySelectorAll<HTMLElement>("[data-interactive]");
      for (let i = 0; i < nodes.length; i++) {
        const r = nodes[i].getBoundingClientRect();
        if (localX >= r.left && localX <= r.right && localY >= r.top && localY <= r.bottom) {
          return true;
        }
      }
      return false;
    }

    async function tick() {
      // Skip if cancelled or the previous tick's IPC calls are still pending.
      if (cancelled || isTickRunning) return;
      isTickRunning = true;

      try {
        if (forcePassthrough) {
          await setPassthrough(true);
          return;
        }

        if (isDraggingRef.current || forceInteractive) {
          await setPassthrough(false);
          return;
        }

        // Refresh window position + scale cache every 500 ms.
        const now = performance.now();
        if (now - lastCacheUpdate > 500) {
          lastCacheUpdate = now;
          const [pos, scale] = await Promise.all([
            tauriOverlay.getOuterPosition(),
            tauriOverlay.getScaleFactor(),
          ]);
          cachedWinPos = { x: pos.x, y: pos.y };
          cachedScale = scale;
        }

        const [gx, gy] = await tauriOverlay.getCursorPosition();

        // Test both physical (DPI-scaled) and logical (CSS pixel) coordinates
        // on all platforms. This handles Windows 125 %/150 % DPI scaling and
        // macOS Retina ambiguity — whichever coordinate space getBoundingClientRect
        // happens to report, one of the two conversions will match.
        const localPhysicalX = (gx - cachedWinPos.x) / cachedScale;
        const localPhysicalY = (gy - cachedWinPos.y) / cachedScale;
        const localLogicalX = gx - cachedWinPos.x;
        const localLogicalY = gy - cachedWinPos.y;

        const over =
          isPointInInteractiveRegion(localPhysicalX, localPhysicalY) ||
          isPointInInteractiveRegion(localLogicalX, localLogicalY);

        const before = lastPassthrough;
        await setPassthrough(!over);
        if (lastPassthrough === before) {
          idleCycles = Math.min(idleCycles + 1, IDLE_THRESHOLD + 1);
        }
      } catch (e) {
        console.debug("[passthrough] tick error", e);
      } finally {
        isTickRunning = false;
      }

      if (!cancelled) {
        const interval = idleCycles >= IDLE_THRESHOLD ? POLL_IDLE_MS : POLL_BASE_MS;
        raf = requestAnimationFrame(() => {
          setTimeout(() => void tick(), interval);
        });
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

    // On Windows, delay polling start by 300 ms so the native window and
    // WebView2 compositor are fully initialised before the first IPC call.
    const scheduleFirstTick = () => {
      raf = requestAnimationFrame(() => void tick());
    };
    if (isWindows) {
      startTimeout = window.setTimeout(scheduleFirstTick, 300);
    } else {
      scheduleFirstTick();
    }

    return () => {
      cancelled = true;
      clearTimeout(startTimeout);
      cancelAnimationFrame(raf);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      tauriOverlay.setIgnoreCursorEvents(true).catch(console.error);
    };
  }, [forceInteractive, forcePassthrough, isDraggingRef]);
}
