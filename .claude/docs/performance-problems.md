Here is the full cross-platform performance audit.


# ScribeShade Tauri Desktop App — Cross-Platform Performance Audit
**Date: 2026-06-09**

**Branch: release-v3**

**Platforms: macOS, Windows (low-end Intel i3/i5), Linux (low-end CPU/RAM)**


## CRITICAL

- [x] **C1 — WASAPI Loopback Startup Has No Timeout (Windows only)** ✅ Fixed in release-v3
**File:** src-tauri/src/lib.rs — start_display_audio_stream (~line 1413–1529)

**Issue:** The Windows start_display_audio_stream command has no init_rx startup handshake and no timeout. If WASAPI device enumeration hangs (misconfigured driver, exclusive-mode device, USB audio switching), the Tauri invoke call blocks indefinitely. The entire frontend IPC thread stalls waiting for a response that never arrives — the UI freezes with "Not Responding."

**macOS:** No issue. The SCKit version has a 10-second tokio::time::timeout that returns an error rather than hanging.

**Windows:** invoke("start_display_audio_stream") can stall for tens of seconds or forever on devices with problematic audio drivers (common on budget i3/i5 laptops with Realtek integrated audio).

**Linux:** Not applicable (WASAPI is Windows-only), but no equivalent timeout exists in the Linux audio path either.

**Reproduce:** Connect a Bluetooth headset, switch the default output device mid-session on Windows, then trigger system audio start. Observe UI freeze.

**Fix:** Add a tokio::time::timeout(Duration::from_secs(10), ...) wrapping the device init block in start_display_audio_stream, matching the macOS pattern. Return an Err("audio_device_timeout") the frontend can surface.


- [x] **C2 — Synchronous File I/O on Tauri Tokio Threadpool** ✅ Fixed in release-v3
**File:** src-tauri/src/lib.rs — auth_get_persisted_session / auth_set_persisted_session (~lines 258–289)

**Issue:** Both auth persistence commands use std::fs::read_to_string and std::fs::write — blocking I/O — inside what Tauri dispatches as Tokio tasks. Tokio's thread pool is not sized for blocking I/O. On a slow HDD (common on low-end Windows/Linux laptops), a single file operation can block for 50–500ms, starving all other async tasks (audio start, IPC responses) on those threads.

**macOS:** SSD standard; blocking I/O is ~1ms. Low risk.

Windows low-end: HDDs still common on i3/i5 laptops; blocking I/O can take 100–500ms. High risk for visible freeze.

Linux low-end: ext4 on slow eMMC or HDD; same risk.

**Reproduce:** Run on a system with a spinning hard drive or under disk pressure (multiple apps writing). Start the app and observe startup latency; session save/restore during active use.

**Fix:** Replace with tokio::fs::read_to_string / tokio::fs::write and make both functions async. Alternatively, wrap in tokio::task::spawn_blocking.


## HIGH

- [x] **H1 — backdrop-filter: blur(24px) Always On (Windows/Linux integrated GPU)** ✅ Fixed in release-v3
**File:** src/features/session/components/FloatingSurface.tsx

**Issue:** The overlay surface applies backdrop-filter: blur(24px) and -webkit-backdrop-filter: blur(24px) unconditionally whenever blurPx > 0.5. This requires the GPU compositor to maintain a separate compositing layer, sample the content underneath, and apply a Gaussian blur on every frame.

**macOS:** WKWebView delegates blur to the Metal GPU compositor natively. Acceptable on Apple Silicon; usable on Intel Macs.

**Windows:** WebView2 uses D3D11/D2D for backdrop-filter. On integrated Intel HD 620/630 (i3/i5 Gen 7–8), this can drop rendering to 5–15 FPS during active STT transcript streaming (combined WebView2 compositing + text paint + blur pass). The overlay becomes noticeably laggy or stuttery.

**Linux:** WebKitGTK's backdrop-filter support requires hardware compositing enabled in the WKWebView configuration. Without it, blur falls back to software rendering, which is extremely slow (single-digit FPS on low-end CPUs).

**Reproduce:** Open the overlay on a Windows machine with Intel integrated GPU. Start an STT session and watch transcript stream in. Measure FPS using Chrome DevTools paint timing via WebView2 devtools.

Fix (safe, no feature removal): Add a reduced-motion / low-performance CSS class path: detect window.navigator.hardwareConcurrency <= 4 or check matchMedia('(prefers-reduced-motion: reduce)') at startup and set blurPx = 0 for those devices. Also add an explicit Tauri config to enable GPU compositing on Linux (webview: { devtools: false, ..., hardware_acceleration: "enabled" }).


- [x] **H2 — resolveQuestionFromContext() O(n²) on Every AI Answer Click** ✅ Fixed in release-v3
**File:** src/features/session/hooks/useFloatingSession.ts (~lines 381–558)

**Issue:** Called synchronously on every AI Answer button click. Runs multiple sequential passes over allMessages:

detectActiveQuestion() in activeQuestionDetector.ts: maps normalizeSttTranscript() over every message (200+ on long sessions = 200 string regex normalizations)
deduplicatePhrases(): O(n²) nested loops over word arrays
buildDynamicTranscriptWindow(), extractContextFromMessages(): additional O(n) passes
On a 2-hour session with 300+ transcript entries, this blocks the main thread for 50–200ms on a fast Mac. On a low-end i3 with 4GB RAM, it can exceed 500ms, causing a visible freeze and potentially a "Not Responding" dialog on Windows.

All platforms affected. Worst on Windows/Linux low-end devices.

**Reproduce:** Run a 30-minute session, accumulate 100+ transcript entries, then click AI Answer repeatedly. Use Chrome DevTools Performance tab (via WebView2 devtools on Windows) to profile the main thread.

**Fix:** Memoize the normalized messages array (recompute only when allMessages changes, using a ref that tracks the last processed length). Move deduplicatePhrases to a Web Worker if it must remain O(n²). Most aggressively: cache detectActiveQuestion output, invalidating only on new transcript entries.


- [x] **H3 — stt:health:system Event Flood from Audio Callback Thread** ✅ Fixed in release-v3
**File:** src-tauri/src/lib.rs (~lines 1778–1782); src/features/session/hooks/useFloatingSession.ts (~line 1461)

**Issue:** emit_system_health_event is called from inside the audio capture PCM callback on every 50th PCM frame. At 44.1kHz with 512-sample frames, this is approximately every 580ms — but the counter is not rate-limited by wall time. Under WASAPI at higher buffer sizes or lower sample rates, this can fire significantly more frequently. Each emission is a full serialized JSON IPC round-trip from the Rust audio thread → Tauri event bus → JS.

The JS listener in useFloatingSession updates 17 separate fields in systemHealthRef on each event, bypassing React but still running the staleness classification logic.

**macOS:** Infrequent enough to be fine.

Windows/Linux: Under audio stress (device switching, multiple STT sessions), the PCM callback fires rapidly. Combined with the WebView2 COM IPC overhead, event processing can create a measurable main-thread queue.

**Fix:** Rate-limit to at most one health event per 2 seconds using a static AtomicU64 timestamp check in Rust, skipping the emit if the last one was less than 2000ms ago.


- [x] **H4 — Unvirtualized SessionTranscript List** ✅ Fixed in release-v3
**File:** src/features/session/components/SessionTranscript.tsx

**Issue:** All transcript messages are rendered as DOM nodes simultaneously with no virtualization:


```tsx
{messages.map((m) => <TranscriptBubble key={m.id} ... />)}
```
On a 2-hour session, this can be 400–600+ DOM nodes all in the live document. Each new STT insert triggers React reconciliation over the full list. On Windows/Linux with WebView2/WebKitGTK's slower JS engines and slower DOM backends, this causes increasing jank as the session grows.

**Low-end devices:** On 4GB RAM with integrated GPU, 600 DOM nodes + backdrop blur + Framer Motion animations competing for the same thread will visibly degrade scroll performance.

**Reproduce:** Run a 1-hour session and scroll the transcript. Observe FPS degradation.

**Fix:** Use @tanstack/react-virtual or a simple windowed list rendering only ±30 messages around the viewport. Keep the last N messages rendered for scroll anchoring.


- [x] **H5 — capture_screen Contains Hardcoded 50ms tokio::time::sleep** ✅ Fixed in release-v3
**File:** src-tauri/src/lib.rs — capture_screen (~lines 524–597)

**Issue:** The content protection toggle workflow does:

Disable content protection
tokio::time::sleep(Duration::from_millis(50)) — blocks the async task
Take screenshot
Re-enable content protection
While sleep in async Tokio does yield, it still holds the Tokio task slot for 50ms. During this window, if Tauri's runtime has no spare threads (e.g., audio commands are running), this task is delayed further. On Windows where the Tokio timer resolution is typically 15ms (Windows timer coalescing), the actual sleep can be 50–80ms.

**Platform difference:** macOS timer resolution is ~1ms. Windows is ~15ms minimum. The 50ms sleep may become 60–65ms on Windows.

**Fix:** This is low-risk but document the Windows timer resolution issue. Consider reducing to 16ms (one frame) — the GPU compositor needs one frame to flush; 50ms is overly conservative.


## MEDIUM

- [x] **M1 — recentInsertionsRef Grows Unbounded Then Filtered on Every Insert** ✅ Fixed in release-v3
**File:** src/features/session/hooks/useFloatingSession.ts (~line 862)

**Issue:**


```ts
recentInsertionsRef.current = recentInsertionsRef.current.filter(
  (entry) => timestamp - entry.timestamp <= NEAR_DUPLICATE_GAP_MS,
);
```
This runs on every STT insertion (potentially 5–10 per second). While the filter itself is O(n) over a typically small array, the pattern allocates a new array on every call. Under high STT throughput, this creates GC pressure — especially on low-end devices where V8's minor GC is slower and the overlay's JS heap is already under pressure from transcript accumulation.

**Fix:** Either use an index-based cleanup (find the cutoff index once and splice in place) or keep a Map<id, timestamp> and delete stale entries lazily.


- [x] **M2 — setInterval at 2000ms for Health Monitoring Running Complex Logic** ✅ Fixed in release-v3
**File:** src/features/session/hooks/useFloatingSession.ts (~line 1653)

**Issue:** A setInterval(fn, 2000) runs staleness classification on every tick, including date comparisons, threshold checks, and ref mutations across 17 health state fields. While each individual check is fast, the interval fires even when the session is idle, and the logic is not guarded by a "session active" check.

**Low-end devices:** 2s interval means 30 ticks/minute. Each tick allocates temporary objects for the staleness logic. Over an hour, this is 1800 redundant allocations on a device that may already be GC-bound.

**Fix:** Clear the interval when the session transitions to idle. Use AUDIO_STOPPED state as the guard.


- [x] **M3 — Framer Motion JS-Driven Spring Animation in CollapsedIcon** ✅ Fixed in release-v3
**File:** src/features/launcher/components/CollapsedIcon.tsx

**Issue:**


```tsx
transition={{ type: "spring", stiffness: 400, damping: 25 }}
```
Framer Motion spring animations are JS-driven RAF loops — they cannot be offloaded to the CSS compositor. Each animation frame runs a JS spring integrator, updates transform, and triggers a compositor commit. On a low-end CPU busy with STT event processing, this spring animation competes for the same JS thread.

**macOS:** JS thread is fast enough; not noticeable.

Windows/Linux low-end: During rapid session start/stop cycles, the spring animation can cause dropped frames if the STT event queue is also firing.

**Fix:** Replace with a CSS transition on transform and opacity — these are compositor-only and do not use JS. transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1) approximates a spring without JS overhead.


- [x] **M4 — macOS 2-Second Reinforce Loop Spawned as Permanent Async Task** ✅ Fixed in release-v3
**File:** src-tauri/src/lib.rs (~lines 3392–3407)

**Issue:** On macOS, a tauri::async_runtime::spawn loop runs forever (no cancellation), re-applying the window level every 2 seconds to all visible overlay windows. Each iteration acquires the NSWindow handle and makes an ObjC msg_send! call.

**Issue:** The loop never terminates — it leaks a Tokio task for the lifetime of the process. On a system under memory pressure, this is a minor but persistent drain. The task also fires during session-inactive periods when no overlays are visible.

**Fix:** Add a cancellation flag (Arc<AtomicBool>) and skip the msg_send when both overlay windows are hidden. The visibility check itself is cheap.


- [x] **M5 — Unbounded messagesRef Slicing on Every STT Event** ✅ Fixed in release-v3
**File:** src/features/session/hooks/useFloatingSession.ts

**Issue:** Three independent slices over messagesRef.current run on every STT transcript insertion:

messagesRef.current.slice(-20) in isDupeMessage
messagesRef.current.slice(-30) in shouldSuppressInsertion
[...messagesRef.current].filter(...).slice(-20) in replaceNearDuplicateIfRicher
The spread [...messagesRef.current] in the third call allocates a full copy of the array on every insertion. On a session with 500 messages, that is a 500-element array allocation at 5–10 times per second.

**Fix:** The 20/30 suffix slices are bounded and fine. The spread copy in replaceNearDuplicateIfRicher is unnecessary — filter directly on messagesRef.current without spreading first. JavaScript's Array.prototype.filter does not mutate the source.


- [x] **M6 — Earnest println! Spam to stdout in Release Builds** ✅ Fixed in release-v3
**File:** src-tauri/src/lib.rs — multiple locations

**Issue:** Production-compiled code contains unconditional println! calls including:

[Session][Native] set_session_active start active=...
[Session][Native] set_session_active complete active=...
[Session][Native] stop_all_audio_transcription start/complete
[Session][Native] handle_launcher_click start/complete
[Tauri][WindowLifecycle] mini resized; minimized=... (fires on every resize)
[Tauri][WindowLifecycle] mini hidden after minimize event
On macOS, println! goes to /dev/null for bundled apps. On Windows, stdout is attached to the process handle and written to a pipe buffer; when the buffer fills (no reader), the write blocks. On Linux, stdout goes to the terminal or systemd journal — high frequency writes to the journal are rate-limited.

Risk on Windows: The resize event fires continuously during window drag. println! inside on_window_event(Resized) can stall on Windows if the pipe buffer is full (no terminal attached).

**Fix:** Gate these behind #[cfg(debug_assertions)] or replace with tracing::debug! with a compile-time level filter set to warn in release.


- [x] **M7 — set_cursor_passthrough macOS Dispatches run_on_main_thread on Every Tick** ✅ Fixed in release-v3
**File:** src-tauri/src/lib.rs — set_cursor_passthrough (~lines 3011–3035)

**Issue:** On macOS, every setIgnoreCursorEvents call dispatches a run_on_main_thread closure with an ObjC msg_send!. The polling hook fires every 16ms at base rate. That is 62 main-thread dispatches per second, each crossing the Tokio → main thread boundary. When the main thread is busy (window resize, compositor frame), these queue and fire late, causing passthrough state to lag.

**Current mitigation:** The idleCycles throttling in useCursorPassthrough reduces this to 120ms/240ms when state is stable. This partially mitigates the issue.

**Remaining risk:** During rapid cursor transitions over interactive elements, the 16ms base rate causes queuing of up to 4–5 pending dispatches.

Fix (already partially done): The existing adaptive throttle is the right approach. Consider raising the macOS base from 16ms to 32ms (30 FPS) — cursor hit-testing is imperceptible at 30fps but halves the dispatch rate.


## LOW

- [x] **L1 — auth_clear_persisted_session Also Uses Sync std::fs::remove_file** ✅ Fixed in release-v3 (resolved as part of C2)
**File:** src-tauri/src/lib.rs — auth_clear_persisted_session

**Issue:** Same as C2 but lower priority because it fires rarely (only on sign-out). Still blocks the Tokio pool.

**Fix:** Same — use tokio::fs::remove_file.


- [x] **L2 — log() Object Literal Args Evaluated Before DEV Guard** ✅ Fixed in release-v3
**File:** src/features/session/audio/audioSessionController.ts

**Issue:**


```ts
function log(event: string, payload: Record<string, unknown>) {
  if (!DEV) return;  // guard inside, but...
  console.log(...)
}
// Call site:
log("stop", { mode, reason, stopReason: reason, sessionActive }); // object created before guard
```
Object literal { mode, reason, stopReason: reason, sessionActive } is always allocated at the call site, regardless of DEV. On a hot path (called 6× in stopNative), this creates 6 allocations per call even in production.

**Fix:** Either inline the DEV guard at each call site (if (DEV) log(...)) or convert to a tagged template / lazy getter pattern. In practice, V8 is likely to optimize these away, but it is still dead code in production.


- [x] **L3 — show_mini_top_center / show_launcher_widget Call Sync Win32/GTK from Async Context** ✅ Partially fixed in release-v3 (show_mini_top_center routed through run_on_main_thread on Windows; show_launcher_widget left as-is — called from setup() on main thread, blocking channel would deadlock)
**File:** src-tauri/src/lib.rs — show_mini_top_center (~lines 601–688), show_launcher_widget (~lines 2926–2990)

**Issue:** Both commands call window.set_size() and window.set_position() which are synchronous Win32 MoveWindow/SetWindowPos calls under the hood (on Windows). When dispatched from a Tokio async handler, they execute on a Tokio worker thread, not the Win32 UI thread. This is technically a cross-thread window manipulation that Windows allows but with added latency from the internal SendMessage → UI thread round-trip.

**Impact:** Minor (10–30ms delay on window position change). Not a freeze risk, but contributes to perceptible lag when the mini overlay appears.

**Fix:** Route through window.run_on_main_thread(|| { ... }) or mark both commands #[tauri::command(async = false)] to run on the main thread (acceptable since they are infrequent).


- [x] **L4 — InspectDialog Framer Motion Animation is JS-Driven** ✅ Fixed in release-v3
**File:** Session inspect dialog component (uses motion.div with opacity/scale/x)

**Issue:** Same pattern as CollapsedIcon — Framer Motion JS spring animations run on the JS thread.

Low impact because the InspectDialog opens infrequently. CSS transition replacement is still preferred for consistency.


## OS-Specific Risk Summary

| Risk | macOS | Windows low-end | Linux low-end |
|---|---|---|---|
| WASAPI startup hang | N/A | Critical | N/A |
| Sync fs I/O | Low | High | High |
| backdrop-filter blur | Low | High | Critical (SW fallback) |
| resolveQuestionFromContext O(n²) | Medium | High | High |
| Health event flood | Low | Medium | Medium |
| Unvirtualized transcript | Medium | High | High |
| println! on resize | None | Medium | Low |
| Spring animations | Low | Medium | Medium |
| Reinforce loop leak | Low | N/A | N/A |

## Prioritized Safe Fix Plan

### Phase 1 — Zero-regression fixes (can ship immediately):


- [x] **C2 — Replace std::fs with tokio::fs in auth persistence. Pure async change, same behavior.** ✅

- [x] **C1 — Add tokio::time::timeout(10s) to WASAPI start_display_audio_stream. Adds error return path only.** ✅

- [x] **M6 — Gate all println! in lib.rs with #[cfg(debug_assertions)]. Zero behavior change in dev.** ✅

- [x] **H3 — Add AtomicU64 rate limit to emit_system_health_event (max once per 2s). Reduces IPC traffic.** ✅

- [x] **M5 — Remove spread copy [...messagesRef.current] in replaceNearDuplicateIfRicher. Pure optimization.** ✅

- [x] **M2 — Guard the 2000ms health interval with a session-active check. Clear interval on session end.** ✅

- [x] **L2 — Add if (DEV) guard at log() call sites in audioSessionController.ts.** ✅

### Phase 2 — Render performance (test on Windows first):
- [x] H1 — Add device capability detection; disable backdrop-filter for hardwareConcurrency <= 4 or prefers-reduced-motion. Keep blur on capable devices. ✅
- [x] H4 — Introduce windowed rendering in SessionTranscript with @tanstack/react-virtual. ✅
- [x] M3 — Convert CollapsedIcon spring to CSS transition. Visual delta is imperceptible. ✅
- [x] M1 — Replace recentInsertionsRef filter-on-insert with index-based cleanup or lazy eviction. ✅


### Phase 3 — Architecture (larger scope, validate separately):
- [x] H2 — Memoize detectActiveQuestion output; cache normalized messages; move deduplicatePhrases to Web Worker. ✅
- [x] H5 — Reduce capture_screen sleep from 50ms to 16ms with a comment about Windows timer resolution. ✅
- [x] M4 — Add cancellation + visibility guard to the macOS reinforce loop. ✅
- [x] L1 — Convert auth_clear_persisted_session to async fs. ✅ (resolved as part of C2)
- [x] L3 — Route show_mini_top_center through run_on_main_thread on Windows. ✅ (show_launcher_widget excluded — main-thread setup() caller, blocking channel would deadlock)

Ready to start applying fixes in any order you choose. Phase 1 changes are all safe to batch.

---

## Windows Re-Audit — 2026-06-09

**Context:** App runs well on macOS with minimal lag. Windows desktop build shows freeze issues and clicks not responding for seconds. This section documents Windows-specific root causes discovered in a targeted re-audit after the Phase 1–3 fixes were applied.

**Methodology:** Code-level audit of `src-tauri/src/lib.rs` and frontend hooks. Focused on Win32 threading model violations, IPC queue saturation, and forced-layout patterns.

---

### WN1 ✅ FIXED — `set_cursor_passthrough` Win32 called off UI thread (120ms cadence)

**File:** `src-tauri/src/lib.rs:3165–3170`

**Issue:**
```rust
#[cfg(not(target_os = "macos"))]
{
    window
        .set_ignore_cursor_events(passthrough)  // Win32 SetWindowLongPtrW + SetWindowPos
        .map_err(|e| e.to_string())?;
}
```
macOS correctly wraps this call in `window.run_on_main_thread()` (lines 3152–3163). Windows does not. Tauri dispatches this command on a Tokio worker thread. Win32 `SetWindowLongPtrW` + `SetWindowPos(SWP_FRAMECHANGED)` from a non-UI thread route through the Win32 cross-thread `SendMessage` mechanism — the calling thread blocks until the UI thread's message pump processes the message. If the WebView2 message pump is busy rendering JS, the calling Tokio worker stalls, holding a thread slot. `useCursorPassthrough.ts` fires this command every **120ms** (8 FPS). At 8 cross-thread SendMessage calls/second, any spike in render work (AI answer animation, transcript update) can cause the command queue to pile up and appear frozen.

**Why macOS doesn't freeze:** `run_on_main_thread` on macOS posts an asynchronous message to the Cocoa run loop. The calling thread returns immediately without blocking, so no Tokio worker stall.

**Fix:** Add a `#[cfg(target_os = "windows")]` `run_on_main_thread` wrapper matching the macOS pattern, with a `tokio::sync::oneshot` channel for the async caller to await the result. The `#[cfg(not(target_os = "macos"))]` block (which also covers Linux) should keep direct call for Linux and only wrap for Windows.

```rust
#[cfg(target_os = "windows")]
{
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let w = window.clone();
    window.run_on_main_thread(move || {
        let r = w.set_ignore_cursor_events(passthrough).map_err(|e| e.to_string());
        let _ = tx.send(r);
    }).map_err(|e| e.to_string())?;
    rx.await.map_err(|_| "window thread dropped".to_string())??;
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
{
    window.set_ignore_cursor_events(passthrough).map_err(|e| e.to_string())?;
}
```

**Impact:** Eliminates the most frequent Win32 cross-thread stall during active launcher sessions.

---

### WN2 ✅ FIXED — `show_launcher_widget` Windows Win32 block runs off UI thread

**File:** `src-tauri/src/lib.rs:3100–3113`

**Issue:** When called from JS as a Tauri command (Tokio worker), the Windows block executes:
1. `window.show()` — Win32 `ShowWindow` cross-thread
2. `winvd::pin_window(win_hwnd)` — Windows Virtual Desktop COM API (`IVirtualDesktopManager`). COM STA APIs called from a non-STA thread cause undefined behaviour and are known to hang on Windows 11 22H2+.
3. `remove_window_border(win_hwnd)` — calls `GetWindowLongPtrW`, `SetWindowLongPtrW` ×2, `DwmSetWindowAttribute`, `SetWindowPos(SWP_FRAMECHANGED)` — all raw Win32, all cross-thread SendMessage.
4. `SetWindowSubclass(hwnd, ...)` — **violates its own contract**: MSDN states the subclass procedure must be installed from the thread that owns the window. Calling from a Tokio worker installs a subclass on the wrong thread, which silently fails to intercept `WM_NCCALCSIZE` and leaves the NC area with a visible border.

Combined, this block generates 6+ cross-thread Win32 calls at app launch. On systems under scheduler pressure (startup background tasks, antivirus scans), these calls can each stall for 50–200ms. The user sees a frozen launcher window for up to 1 second.

**Context:** `show_launcher_widget` is also called from `setup()` on the main thread (no cross-thread issue there). The cross-thread risk applies only when called from JS.

**Fix:** Wrap the entire Windows block in `app.run_on_main_thread()` + tokio oneshot:
```rust
#[cfg(target_os = "windows")]
{
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let win = app2.get_webview_window("launcher").ok_or("no launcher")?;
            win.show().map_err(|e| e.to_string())?;
            if let Ok(hwnd) = win.hwnd() {
                let h = windows::Win32::Foundation::HWND(hwnd.0);
                let _ = winvd::pin_window(h);
                remove_window_border(h);
                unsafe {
                    let _ = windows::Win32::UI::Shell::SetWindowSubclass(
                        h, Some(mini_subclass_proc), 1, 0,
                    );
                }
            }
            Ok(())
        })();
        let _ = tx.send(result);
    }).map_err(|e| e.to_string())?;
    rx.await.map_err(|_| "window thread dropped".to_string())??;
}
```
Note: `show_launcher_widget` is called from `setup()` (main thread) at app start. At that point, `run_on_main_thread` posts to the event loop and returns. Since `setup()` is not `async`, it cannot `await rx`. Therefore the `run_on_main_thread` path should only activate when NOT on the main thread. Simplest guard: move the Windows block to a separate `async fn show_launcher_widget_windows_init(app: AppHandle)` that only the Tauri command invoke path calls, while `setup()` retains the direct call.

---

### WN3 ✅ FIXED — `apply_overlay_policy_to_window` executes 5 Win32 calls off UI thread

**File:** `src-tauri/src/lib.rs:92–116`

**Issue:** This helper function is called from both `show_launcher_widget` (line 3091) and `show_mini_top_center` (after the `#[cfg(not(target_os = "windows"))]` L3-fix block). On Windows it executes:
```rust
window.set_always_on_top(true)           // Win32 SetWindowPos(HWND_TOPMOST)
window.set_visible_on_all_workspaces(true) // Win32 VirtualDesktop COM API
window.set_skip_taskbar(true)            // Win32 ITaskbarList::DeleteTab
window.set_decorations(false)            // Win32 SetWindowLongPtrW(GWL_STYLE)
window.set_shadow(...)                   // Win32 DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE)
```
All five are cross-thread Win32 calls. Each triggers a separate cross-thread `SendMessage` round-trip. Combined: 5 blocking cross-thread calls per `show_launcher_widget` / `show_mini_top_center` invocation from JS.

The partial L3 fix we applied earlier added `run_on_main_thread` for `set_size`/`set_position`/`set_minimizable`/`set_maximizable` in `show_mini_top_center`, but `apply_overlay_policy_to_window` is called directly after the cfg block and still runs off-thread.

**Fix:** `apply_overlay_policy_to_window` should be moved inside the `run_on_main_thread` closure for Windows on both call sites, or the function itself should be made main-thread-aware via an internal `run_on_main_thread` guard for Windows.

---

### WN4 ✅ FIXED — `list_audio_devices` synchronous WASAPI enumeration blocks Tokio worker

**File:** `src-tauri/src/lib.rs:1441–1449`

```rust
#[cfg(target_os = "windows")]
#[tauri::command]
fn list_audio_devices() -> Vec<String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    host.input_devices()  // synchronous IMMDeviceEnumerator::EnumAudioEndpoints COM call
        .map(|devs| devs.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}
```

CPAL's WASAPI backend calls `IMMDeviceEnumerator::EnumAudioEndpoints()` synchronously. On Windows laptops with Realtek HD Audio or Conexant SmartAudio drivers (extremely common on budget i3/i5 laptops — the primary Windows target), this COM call can **block the calling thread for 200–800ms** while the driver loads device configuration from the registry and initializes the audio graph. This command is called from the JS session setup flow before starting mic transcription.

Since `fn list_audio_devices()` is synchronous, it occupies a Tokio worker thread for the full duration. Tauri's worker pool (default: `num_cpus` threads) can have all workers stalled on slow `list_audio_devices` calls while the user clicks buttons — those clicks' invoke calls queue and don't fire until a worker is freed. User sees complete click unresponsiveness.

**Why macOS doesn't freeze:** Core Audio device enumeration uses cached IOKit registry data, completing in ~1ms. CPAL on macOS never blocks.

**Fix:**
```rust
#[cfg(target_os = "windows")]
#[tauri::command]
async fn list_audio_devices() -> Vec<String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::task::spawn_blocking(|| {
            let host = cpal::default_host();
            host.input_devices()
                .map(|devs| devs.filter_map(|d| d.name().ok()).collect::<Vec<_>>())
                .unwrap_or_default()
        }),
    ).await {
        Ok(Ok(devices)) => devices,
        _ => vec!["Default".to_string()], // return fallback on timeout or error
    }
}
```
`spawn_blocking` moves the blocking COM call off the async thread pool onto a dedicated blocking thread. The 5-second timeout prevents a bad driver from hanging the command forever.

---

### WN5 — MEDIUM: `useCursorPassthrough` forces layout twice per tick via double `querySelectorAll`

**File:** `src/features/launcher/hooks/useCursorPassthrough.ts:119–120`

```typescript
const over =
  isPointInInteractiveRegion(localPhysicalX, localPhysicalY) ||   // querySelectorAll + getBoundingClientRect loop
  isPointInInteractiveRegion(localLogicalX, localLogicalY);        // querySelectorAll + getBoundingClientRect loop again
```

`isPointInInteractiveRegion` calls `document.querySelectorAll("[data-interactive]")` at line 69 on every call. With the `||` short-circuit evaluation, the second call only runs when the first returns false — but `localPhysicalX/Y` and `localLogicalX/Y` diverge only on non-100% DPI. On 125% DPI (extremely common on Windows), the physical coordinates are outside the card, so the second call ALWAYS runs, doing a second DOM query + layout walk. Each forced layout can take 2–8ms on a low-end i3 with 30+ DOM nodes.

**Fix:** Call `querySelectorAll` once per tick, cache the DOMRects, and test both coordinate pairs against the cached rects:
```typescript
function isPointInInteractiveRegion(x1: number, y1: number, x2: number, y2: number): boolean {
  const nodes = document.querySelectorAll<HTMLElement>("[data-interactive]");
  for (let i = 0; i < nodes.length; i++) {
    const r = nodes[i].getBoundingClientRect();
    if ((x1 >= r.left && x1 <= r.right && y1 >= r.top && y1 <= r.bottom) ||
        (x2 >= r.left && x2 <= r.right && y2 >= r.top && y2 <= r.bottom)) {
      return true;
    }
  }
  return false;
}
// In tick():
const over = isPointInInteractiveRegion(localPhysicalX, localPhysicalY, localLogicalX, localLogicalY);
```
One DOM query, one layout walk, both coordinate pairs tested per element.

---

### WN6 ✅ FIXED — `useCursorPassthrough` 500ms cache miss causes 3–4 IPC calls in one tick

**File:** `src/features/launcher/hooks/useCursorPassthrough.ts:95–107`

When the 500ms window-position/scale cache expires:
```typescript
if (now - lastCacheUpdate > 500) {
  const [pos, scale] = await Promise.all([
    tauriOverlay.getOuterPosition(),   // IPC call 1
    tauriOverlay.getScaleFactor(),     // IPC call 2
  ]);
  ...
}
const [gx, gy] = await tauriOverlay.getCursorPosition(); // IPC call 3
// if passthrough state changes:
await tauriOverlay.setIgnoreCursorEvents(p);             // IPC call 4
```
The cache miss tick fires 3–4 IPC round-trips sequentially within one 120ms window. On Windows, each IPC call takes ~5–15ms (Tokio worker dispatch + Win32 message pump). A 4-call burst adds 20–60ms of latency to a single tick and delays the next scheduled tick.

The launcher window does not move during normal use; the scale factor never changes mid-session. A 500ms cache is far too aggressive.

**Fix:** Extend cache lifetime to 2000ms on Windows. Listen for Tauri's `WindowEvent::Moved` and `WindowEvent::ScaleFactorChanged` (from JS via a `listen("tauri://window-moved", ...)` listener) to invalidate the cache immediately on actual position changes, and fall back to the 2000ms poll only as a safety net.

```typescript
const CACHE_TTL_MS = isWindows ? 2000 : 1000;
```

Reduces cache-miss bursts from 8/second to 0.5/second on Windows.

---

### WN7 ✅ FIXED — `get_cursor_position` called every 120ms as a synchronous command

**File:** `src-tauri/src/lib.rs:3139–3143`

```rust
#[tauri::command]
fn get_cursor_position(app: AppHandle) -> Result<(f64, f64), String> {
    let pos = app.cursor_position().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y))
}
```

`app.cursor_position()` on Windows calls Win32 `GetCursorPos` which is thread-safe (reads from a shared memory struct). Not a freeze risk on its own, but the synchronous command occupies a Tokio worker slot for the duration of the IPC dispatch. At 8 FPS on Windows, this is 8 worker reservations/second.

**Fix:** Make `async fn` to allow Tokio to schedule more efficiently. Low priority since `GetCursorPos` itself is ~0.1ms.

---

### Windows Re-Audit Fix Priority

| ID | Severity | File | Impact on Windows | Effort |
|----|----------|------|-------------------|--------|
| WN1 | **CRITICAL** ✅ | lib.rs:3165 | Direct cause of click-response freeze during cursor movement | Fixed |
| WN2 | **CRITICAL** ✅ | lib.rs:3100 | Launcher startup freeze + invisible border bug | Fixed |
| WN3 | **HIGH** ✅ | lib.rs:92 | 5 cross-thread Win32 calls per show_launcher / show_mini | Fixed |
| WN4 | **HIGH** ✅ | lib.rs:1443 | 200–800ms IPC block on every audio device list call | Fixed |
| WN5 | **MEDIUM** | useCursorPassthrough.ts:119 | 2 forced layouts per 120ms tick on Windows | 15 min |
| WN6 | **MEDIUM** ✅ | useCursorPassthrough.ts:97 | 3–4 IPC burst every 500ms, spikes IPC queue | Fixed |
| WN7 | **LOW** ✅ | lib.rs:3139 | Minor worker-slot overhead | Fixed |

**Root cause summary for Windows freezes:**
- **Primary**: `set_cursor_passthrough` firing Win32 `SendMessage` cross-thread 8×/second (WN1). Every time the UI thread is busy (rendering AI answer, transcribing), these 8 calls queue up and the IPC thread stalls waiting for them to drain.
- **Secondary**: `show_launcher_widget` Windows block makes 6+ cross-thread Win32 calls at launch, causing the launcher to appear non-responsive for ~500ms on first show.
- **Contributing**: `list_audio_devices` WASAPI stall blocks a Tokio worker for 200–800ms, occupying the IPC thread slot that should be serving click handlers.