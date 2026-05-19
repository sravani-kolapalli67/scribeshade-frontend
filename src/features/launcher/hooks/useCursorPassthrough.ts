import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface UseCursorPassthroughOptions {
  isDraggingRef: React.MutableRefObject<boolean>;
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
}: UseCursorPassthroughOptions): void {
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    let lastPassthrough: boolean | null = null;
    let cachedScale = 1;
    let cachedWinPos = { x: 0, y: 0 };
    let lastCacheUpdate = 0;

    async function setPassthrough(p: boolean) {
      if (p === lastPassthrough) return;
      lastPassthrough = p;
      try {
        await invoke("set_cursor_passthrough", { passthrough: p });
      } catch (e) {
        console.error("[passthrough]", e);
      }
    }

    async function tick() {
      if (cancelled) return;

      // While dragging, keep interaction enabled — never pass through.
      if (isDraggingRef.current) {
        await setPassthrough(false);
        raf = requestAnimationFrame(() => void tick());
        return;
      }

      try {
        // Refresh window position cache every ~250ms
        const now = performance.now();
        if (now - lastCacheUpdate > 250) {
          lastCacheUpdate = now;
          const win = getCurrentWindow();
          const [pos, scale] = await Promise.all([
            win.outerPosition(),
            win.scaleFactor(),
          ]);
          cachedWinPos = { x: pos.x, y: pos.y };
          cachedScale = scale;
        }

        const [gx, gy] = await invoke<[number, number]>("get_cursor_position");
        // Convert global physical px → window-local CSS px
        const localX = (gx - cachedWinPos.x) / cachedScale;
        const localY = (gy - cachedWinPos.y) / cachedScale;

        let over = false;
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
            over = true;
            break;
          }
        }

        // Fallback: also check portal elements (menus, dropdowns) that render
        // via createPortal and lack [data-interactive].  elementsFromPoint
        // returns elements in z-order; if the topmost visible element has
        // pointer-events !== "none" there is clickable content at this position.
        //
        // IMPORTANT: skip known fullscreen "shell" containers (launcher-root,
        // mini-app-root, overlay-portal-root, [data-overlay-root], [data-layer]).
        // These are full-window divs that exist purely to host portals/layers;
        // they must NOT count as interactive even if a stylesheet accidentally
        // gives them `pointer-events: auto`. Otherwise empty areas would never
        // pass through to the OS.
        if (!over) {
          const SHELL_IDS = new Set([
            "launcher-root",
            "mini-app-root",
            "overlay-portal-root",
            "floating-portal-root",
            "root",
          ]);
          const isShell = (el: Element): boolean => {
            if (el.id && SHELL_IDS.has(el.id)) return true;
            if (el instanceof HTMLElement) {
              if (el.dataset.overlayRoot !== undefined) return true;
              if (el.dataset.layer !== undefined) return true;
            }
            return false;
          };
          const hits = document.elementsFromPoint(localX, localY);
          for (const el of hits) {
            if (el === document.documentElement || el === document.body) break;
            if (isShell(el)) continue;
            const pe = window.getComputedStyle(el).pointerEvents;
            if (pe !== "none") {
              over = true;
              break;
            }
          }
        }

        await setPassthrough(!over);
      } catch (e) {
        console.debug("[passthrough] tick error", e);
      }

      // ~30 fps polling
      raf = requestAnimationFrame(() => {
        setTimeout(() => void tick(), 16);
      });
    }

    raf = requestAnimationFrame(() => void tick());

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      invoke("set_cursor_passthrough", { passthrough: false }).catch(
        console.error,
      );
    };
  }, [isDraggingRef]);
}
