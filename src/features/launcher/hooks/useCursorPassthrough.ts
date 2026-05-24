import { useEffect } from "react";
import { tauriOverlay } from "@/services/tauriOverlay";

interface UseCursorPassthroughOptions {
  isDraggingRef: React.MutableRefObject<boolean>;
  forceInteractive?: boolean;
}

/**
 * Polls the OS cursor position at ~30fps and toggles Tauri's
 * setIgnoreCursorEvents based on whether the cursor overlaps a
 * [data-interactive] element.
 *
 * CRITICAL: WKWebView receives ZERO mouse events while pass-through is ON,
 * so we cannot use mousemove. We use a Rust command + RAF polling instead.
 */
export function useCursorPassthrough({
  isDraggingRef,
  forceInteractive = false,
}: UseCursorPassthroughOptions): void {
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    let lastPassthrough: boolean | null = null;
    let cachedScale = 1;
    let cachedWinPos = { x: 0, y: 0 };
    let lastCacheUpdate = 0;
    const ua = navigator.userAgent.toLowerCase();
    const isMac = ua.includes("mac");
    const isWindows = ua.includes("windows");
    const pollIntervalMs = isWindows ? 42 : 16;

    async function setPassthrough(p: boolean) {
      if (p === lastPassthrough) return;
      lastPassthrough = p;
      try {
        await tauriOverlay.setIgnoreCursorEvents(p);
      } catch (e) {
        console.error("[passthrough]", e);
      }
    }

    function isPointInInteractiveRegion(localX: number, localY: number) {
      const nodes =
        document.querySelectorAll<HTMLElement>("[data-interactive]");
      for (let i = 0; i < nodes.length; i++) {
        const r = nodes[i].getBoundingClientRect();
        if (
          localX >= r.left &&
          localX <= r.right &&
          localY >= r.top &&
          localY <= r.bottom
        ) {
          return true;
        }
      }
      return false;
    }

    async function tick() {
      if (cancelled) return;

      // While dragging, keep interaction enabled — never pass through.
      if (isDraggingRef.current || forceInteractive) {
        await setPassthrough(false);
        raf = requestAnimationFrame(() => void tick());
        return;
      }

      try {
        // Refresh window position cache less often to keep drag smooth.
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
        // Tauri/macOS can report global cursor coordinates in logical points
        // while window APIs may report physical pixels. Test both conversions
        // against explicit [data-interactive] regions so transparent shell
        // elements never keep the whole fullscreen overlay clickable.
        const localPhysicalX = (gx - cachedWinPos.x) / cachedScale;
        const localPhysicalY = (gy - cachedWinPos.y) / cachedScale;
        const localLogicalX = gx - cachedWinPos.x;
        const localLogicalY = gy - cachedWinPos.y;

        const over = isMac
          ? isPointInInteractiveRegion(localPhysicalX, localPhysicalY) ||
            isPointInInteractiveRegion(localLogicalX, localLogicalY)
          : isPointInInteractiveRegion(localPhysicalX, localPhysicalY);

        await setPassthrough(!over);
      } catch (e) {
        console.debug("[passthrough] tick error", e);
      }

      raf = requestAnimationFrame(() => {
        setTimeout(() => void tick(), pollIntervalMs);
      });
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
    raf = requestAnimationFrame(() => void tick());

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      tauriOverlay.setIgnoreCursorEvents(false).catch(console.error);
    };
  }, [forceInteractive, isDraggingRef]);
}
