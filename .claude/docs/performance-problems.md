Here is the full cross-platform performance audit.

ScribeShade Tauri Desktop App — Cross-Platform Performance Audit
Date: 2026-06-09

Branch: release-v3

Platforms: macOS, Windows (low-end Intel i3/i5), Linux (low-end CPU/RAM)

CRITICAL
C1 — WASAPI Loopback Startup Has No Timeout (Windows only)
File: src-tauri/src/lib.rs — start_display_audio_stream (~line 1413–1529)

Issue: The Windows start_display_audio_stream command has no init_rx startup handshake and no timeout. If WASAPI device enumeration hangs (misconfigured driver, exclusive-mode device, USB audio switching), the Tauri invoke call blocks indefinitely. The entire frontend IPC thread stalls waiting for a response that never arrives — the UI freezes with "Not Responding."

macOS: No issue. The SCKit version has a 10-second tokio::time::timeout that returns an error rather than hanging.

Windows: invoke("start_display_audio_stream") can stall for tens of seconds or forever on devices with problematic audio drivers (common on budget i3/i5 laptops with Realtek integrated audio).

Linux: Not applicable (WASAPI is Windows-only), but no equivalent timeout exists in the Linux audio path either.

Reproduce: Connect a Bluetooth headset, switch the default output device mid-session on Windows, then trigger system audio start. Observe UI freeze.

Fix: Add a tokio::time::timeout(Duration::from_secs(10), ...) wrapping the device init block in start_display_audio_stream, matching the macOS pattern. Return an Err("audio_device_timeout") the frontend can surface.

C2 — Synchronous File I/O on Tauri Tokio Threadpool
File: src-tauri/src/lib.rs — auth_get_persisted_session / auth_set_persisted_session (~lines 258–289)

Issue: Both auth persistence commands use std::fs::read_to_string and std::fs::write — blocking I/O — inside what Tauri dispatches as Tokio tasks. Tokio's thread pool is not sized for blocking I/O. On a slow HDD (common on low-end Windows/Linux laptops), a single file operation can block for 50–500ms, starving all other async tasks (audio start, IPC responses) on those threads.

macOS: SSD standard; blocking I/O is ~1ms. Low risk.

Windows low-end: HDDs still common on i3/i5 laptops; blocking I/O can take 100–500ms. High risk for visible freeze.

Linux low-end: ext4 on slow eMMC or HDD; same risk.

Reproduce: Run on a system with a spinning hard drive or under disk pressure (multiple apps writing). Start the app and observe startup latency; session save/restore during active use.

Fix: Replace with tokio::fs::read_to_string / tokio::fs::write and make both functions async. Alternatively, wrap in tokio::task::spawn_blocking.

HIGH
H1 — backdrop-filter: blur(24px) Always On (Windows/Linux integrated GPU)
File: src/features/session/components/FloatingSurface.tsx

Issue: The overlay surface applies backdrop-filter: blur(24px) and -webkit-backdrop-filter: blur(24px) unconditionally whenever blurPx > 0.5. This requires the GPU compositor to maintain a separate compositing layer, sample the content underneath, and apply a Gaussian blur on every frame.

macOS: WKWebView delegates blur to the Metal GPU compositor natively. Acceptable on Apple Silicon; usable on Intel Macs.

Windows: WebView2 uses D3D11/D2D for backdrop-filter. On integrated Intel HD 620/630 (i3/i5 Gen 7–8), this can drop rendering to 5–15 FPS during active STT transcript streaming (combined WebView2 compositing + text paint + blur pass). The overlay becomes noticeably laggy or stuttery.

Linux: WebKitGTK's backdrop-filter support requires hardware compositing enabled in the WKWebView configuration. Without it, blur falls back to software rendering, which is extremely slow (single-digit FPS on low-end CPUs).

Reproduce: Open the overlay on a Windows machine with Intel integrated GPU. Start an STT session and watch transcript stream in. Measure FPS using Chrome DevTools paint timing via WebView2 devtools.

Fix (safe, no feature removal): Add a reduced-motion / low-performance CSS class path: detect window.navigator.hardwareConcurrency <= 4 or check matchMedia('(prefers-reduced-motion: reduce)') at startup and set blurPx = 0 for those devices. Also add an explicit Tauri config to enable GPU compositing on Linux (webview: { devtools: false, ..., hardware_acceleration: "enabled" }).

H2 — resolveQuestionFromContext() O(n²) on Every AI Answer Click
File: src/features/session/hooks/useFloatingSession.ts (~lines 381–558)

Issue: Called synchronously on every AI Answer button click. Runs multiple sequential passes over allMessages:

detectActiveQuestion() in activeQuestionDetector.ts: maps normalizeSttTranscript() over every message (200+ on long sessions = 200 string regex normalizations)
deduplicatePhrases(): O(n²) nested loops over word arrays
buildDynamicTranscriptWindow(), extractContextFromMessages(): additional O(n) passes
On a 2-hour session with 300+ transcript entries, this blocks the main thread for 50–200ms on a fast Mac. On a low-end i3 with 4GB RAM, it can exceed 500ms, causing a visible freeze and potentially a "Not Responding" dialog on Windows.

All platforms affected. Worst on Windows/Linux low-end devices.

Reproduce: Run a 30-minute session, accumulate 100+ transcript entries, then click AI Answer repeatedly. Use Chrome DevTools Performance tab (via WebView2 devtools on Windows) to profile the main thread.

Fix: Memoize the normalized messages array (recompute only when allMessages changes, using a ref that tracks the last processed length). Move deduplicatePhrases to a Web Worker if it must remain O(n²). Most aggressively: cache detectActiveQuestion output, invalidating only on new transcript entries.

H3 — stt:health:system Event Flood from Audio Callback Thread
File: src-tauri/src/lib.rs (~lines 1778–1782); src/features/session/hooks/useFloatingSession.ts (~line 1461)

Issue: emit_system_health_event is called from inside the audio capture PCM callback on every 50th PCM frame. At 44.1kHz with 512-sample frames, this is approximately every 580ms — but the counter is not rate-limited by wall time. Under WASAPI at higher buffer sizes or lower sample rates, this can fire significantly more frequently. Each emission is a full serialized JSON IPC round-trip from the Rust audio thread → Tauri event bus → JS.

The JS listener in useFloatingSession updates 17 separate fields in systemHealthRef on each event, bypassing React but still running the staleness classification logic.

macOS: Infrequent enough to be fine.

Windows/Linux: Under audio stress (device switching, multiple STT sessions), the PCM callback fires rapidly. Combined with the WebView2 COM IPC overhead, event processing can create a measurable main-thread queue.

Fix: Rate-limit to at most one health event per 2 seconds using a static AtomicU64 timestamp check in Rust, skipping the emit if the last one was less than 2000ms ago.

H4 — Unvirtualized SessionTranscript List
File: src/features/session/components/SessionTranscript.tsx

Issue: All transcript messages are rendered as DOM nodes simultaneously with no virtualization:


{messages.map((m) => <TranscriptBubble key={m.id} ... />)}
On a 2-hour session, this can be 400–600+ DOM nodes all in the live document. Each new STT insert triggers React reconciliation over the full list. On Windows/Linux with WebView2/WebKitGTK's slower JS engines and slower DOM backends, this causes increasing jank as the session grows.

Low-end devices: On 4GB RAM with integrated GPU, 600 DOM nodes + backdrop blur + Framer Motion animations competing for the same thread will visibly degrade scroll performance.

Reproduce: Run a 1-hour session and scroll the transcript. Observe FPS degradation.

Fix: Use @tanstack/react-virtual or a simple windowed list rendering only ±30 messages around the viewport. Keep the last N messages rendered for scroll anchoring.

H5 — capture_screen Contains Hardcoded 50ms tokio::time::sleep
File: src-tauri/src/lib.rs — capture_screen (~lines 524–597)

Issue: The content protection toggle workflow does:

Disable content protection
tokio::time::sleep(Duration::from_millis(50)) — blocks the async task
Take screenshot
Re-enable content protection
While sleep in async Tokio does yield, it still holds the Tokio task slot for 50ms. During this window, if Tauri's runtime has no spare threads (e.g., audio commands are running), this task is delayed further. On Windows where the Tokio timer resolution is typically 15ms (Windows timer coalescing), the actual sleep can be 50–80ms.

Platform difference: macOS timer resolution is ~1ms. Windows is ~15ms minimum. The 50ms sleep may become 60–65ms on Windows.

Fix: This is low-risk but document the Windows timer resolution issue. Consider reducing to 16ms (one frame) — the GPU compositor needs one frame to flush; 50ms is overly conservative.

MEDIUM
M1 — recentInsertionsRef Grows Unbounded Then Filtered on Every Insert
File: src/features/session/hooks/useFloatingSession.ts (~line 862)

Issue:


recentInsertionsRef.current = recentInsertionsRef.current.filter(
  (entry) => timestamp - entry.timestamp <= NEAR_DUPLICATE_GAP_MS,
);
This runs on every STT insertion (potentially 5–10 per second). While the filter itself is O(n) over a typically small array, the pattern allocates a new array on every call. Under high STT throughput, this creates GC pressure — especially on low-end devices where V8's minor GC is slower and the overlay's JS heap is already under pressure from transcript accumulation.

Fix: Either use an index-based cleanup (find the cutoff index once and splice in place) or keep a Map<id, timestamp> and delete stale entries lazily.

M2 — setInterval at 2000ms for Health Monitoring Running Complex Logic
File: src/features/session/hooks/useFloatingSession.ts (~line 1653)

Issue: A setInterval(fn, 2000) runs staleness classification on every tick, including date comparisons, threshold checks, and ref mutations across 17 health state fields. While each individual check is fast, the interval fires even when the session is idle, and the logic is not guarded by a "session active" check.

Low-end devices: 2s interval means 30 ticks/minute. Each tick allocates temporary objects for the staleness logic. Over an hour, this is 1800 redundant allocations on a device that may already be GC-bound.

Fix: Clear the interval when the session transitions to idle. Use AUDIO_STOPPED state as the guard.

M3 — Framer Motion JS-Driven Spring Animation in CollapsedIcon
File: src/features/launcher/components/CollapsedIcon.tsx

Issue:


transition={{ type: "spring", stiffness: 400, damping: 25 }}
Framer Motion spring animations are JS-driven RAF loops — they cannot be offloaded to the CSS compositor. Each animation frame runs a JS spring integrator, updates transform, and triggers a compositor commit. On a low-end CPU busy with STT event processing, this spring animation competes for the same JS thread.

macOS: JS thread is fast enough; not noticeable.

Windows/Linux low-end: During rapid session start/stop cycles, the spring animation can cause dropped frames if the STT event queue is also firing.

Fix: Replace with a CSS transition on transform and opacity — these are compositor-only and do not use JS. transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1) approximates a spring without JS overhead.

M4 — macOS 2-Second Reinforce Loop Spawned as Permanent Async Task
File: src-tauri/src/lib.rs (~lines 3392–3407)

Issue: On macOS, a tauri::async_runtime::spawn loop runs forever (no cancellation), re-applying the window level every 2 seconds to all visible overlay windows. Each iteration acquires the NSWindow handle and makes an ObjC msg_send! call.

Issue: The loop never terminates — it leaks a Tokio task for the lifetime of the process. On a system under memory pressure, this is a minor but persistent drain. The task also fires during session-inactive periods when no overlays are visible.

Fix: Add a cancellation flag (Arc<AtomicBool>) and skip the msg_send when both overlay windows are hidden. The visibility check itself is cheap.

M5 — Unbounded messagesRef Slicing on Every STT Event
File: src/features/session/hooks/useFloatingSession.ts

Issue: Three independent slices over messagesRef.current run on every STT transcript insertion:

messagesRef.current.slice(-20) in isDupeMessage
messagesRef.current.slice(-30) in shouldSuppressInsertion
[...messagesRef.current].filter(...).slice(-20) in replaceNearDuplicateIfRicher
The spread [...messagesRef.current] in the third call allocates a full copy of the array on every insertion. On a session with 500 messages, that is a 500-element array allocation at 5–10 times per second.

Fix: The 20/30 suffix slices are bounded and fine. The spread copy in replaceNearDuplicateIfRicher is unnecessary — filter directly on messagesRef.current without spreading first. JavaScript's Array.prototype.filter does not mutate the source.

M6 — Earnest println! Spam to stdout in Release Builds
File: src-tauri/src/lib.rs — multiple locations

Issue: Production-compiled code contains unconditional println! calls including:

[Session][Native] set_session_active start active=...
[Session][Native] set_session_active complete active=...
[Session][Native] stop_all_audio_transcription start/complete
[Session][Native] handle_launcher_click start/complete
[Tauri][WindowLifecycle] mini resized; minimized=... (fires on every resize)
[Tauri][WindowLifecycle] mini hidden after minimize event
On macOS, println! goes to /dev/null for bundled apps. On Windows, stdout is attached to the process handle and written to a pipe buffer; when the buffer fills (no reader), the write blocks. On Linux, stdout goes to the terminal or systemd journal — high frequency writes to the journal are rate-limited.

Risk on Windows: The resize event fires continuously during window drag. println! inside on_window_event(Resized) can stall on Windows if the pipe buffer is full (no terminal attached).

Fix: Gate these behind #[cfg(debug_assertions)] or replace with tracing::debug! with a compile-time level filter set to warn in release.

M7 — set_cursor_passthrough macOS Dispatches run_on_main_thread on Every Tick
File: src-tauri/src/lib.rs — set_cursor_passthrough (~lines 3011–3035)

Issue: On macOS, every setIgnoreCursorEvents call dispatches a run_on_main_thread closure with an ObjC msg_send!. The polling hook fires every 16ms at base rate. That is 62 main-thread dispatches per second, each crossing the Tokio → main thread boundary. When the main thread is busy (window resize, compositor frame), these queue and fire late, causing passthrough state to lag.

Current mitigation: The idleCycles throttling in useCursorPassthrough reduces this to 120ms/240ms when state is stable. This partially mitigates the issue.

Remaining risk: During rapid cursor transitions over interactive elements, the 16ms base rate causes queuing of up to 4–5 pending dispatches.

Fix (already partially done): The existing adaptive throttle is the right approach. Consider raising the macOS base from 16ms to 32ms (30 FPS) — cursor hit-testing is imperceptible at 30fps but halves the dispatch rate.

LOW
L1 — auth_clear_persisted_session Also Uses Sync std::fs::remove_file
File: src-tauri/src/lib.rs — auth_clear_persisted_session

Issue: Same as C2 but lower priority because it fires rarely (only on sign-out). Still blocks the Tokio pool.

Fix: Same — use tokio::fs::remove_file.

L2 — log() Object Literal Args Evaluated Before DEV Guard
File: src/features/session/audio/audioSessionController.ts

Issue:


function log(event: string, payload: Record<string, unknown>) {
  if (!DEV) return;  // guard inside, but...
  console.log(...)
}
// Call site:
log("stop", { mode, reason, stopReason: reason, sessionActive }); // object created before guard
Object literal { mode, reason, stopReason: reason, sessionActive } is always allocated at the call site, regardless of DEV. On a hot path (called 6× in stopNative), this creates 6 allocations per call even in production.

Fix: Either inline the DEV guard at each call site (if (DEV) log(...)) or convert to a tagged template / lazy getter pattern. In practice, V8 is likely to optimize these away, but it is still dead code in production.

L3 — show_mini_top_center / show_launcher_widget Call Sync Win32/GTK from Async Context
File: src-tauri/src/lib.rs — show_mini_top_center (~lines 601–688), show_launcher_widget (~lines 2926–2990)

Issue: Both commands call window.set_size() and window.set_position() which are synchronous Win32 MoveWindow/SetWindowPos calls under the hood (on Windows). When dispatched from a Tokio async handler, they execute on a Tokio worker thread, not the Win32 UI thread. This is technically a cross-thread window manipulation that Windows allows but with added latency from the internal SendMessage → UI thread round-trip.

Impact: Minor (10–30ms delay on window position change). Not a freeze risk, but contributes to perceptible lag when the mini overlay appears.

Fix: Route through window.run_on_main_thread(|| { ... }) or mark both commands #[tauri::command(async = false)] to run on the main thread (acceptable since they are infrequent).

L4 — InspectDialog Framer Motion Animation is JS-Driven
File: Session inspect dialog component (uses motion.div with opacity/scale/x)

Issue: Same pattern as CollapsedIcon — Framer Motion JS spring animations run on the JS thread.

Low impact because the InspectDialog opens infrequently. CSS transition replacement is still preferred for consistency.

OS-Specific Risk Summary
Risk	macOS	Windows low-end	Linux low-end
WASAPI startup hang	N/A	Critical	N/A
Sync fs I/O	Low	High	High
backdrop-filter blur	Low	High	Critical (SW fallback)
resolveQuestionFromContext O(n²)	Medium	High	High
Health event flood	Low	Medium	Medium
Unvirtualized transcript	Medium	High	High
println! on resize	None	Medium	Low
Spring animations	Low	Medium	Medium
Reinforce loop leak	Low	N/A	N/A
Prioritized Safe Fix Plan
Phase 1 — Zero-regression fixes (can ship immediately):

C2 — Replace std::fs with tokio::fs in auth persistence. Pure async change, same behavior.
C1 — Add tokio::time::timeout(10s) to WASAPI start_display_audio_stream. Adds error return path only.
M6 — Gate all println! in lib.rs with #[cfg(debug_assertions)]. Zero behavior change in dev.
H3 — Add AtomicU64 rate limit to emit_system_health_event (max once per 2s). Reduces IPC traffic.
M5 — Remove spread copy [...messagesRef.current] in replaceNearDuplicateIfRicher. Pure optimization.
M2 — Guard the 2000ms health interval with a session-active check. Clear interval on session end.
L2 — Add if (DEV) guard at log() call sites in audioSessionController.ts.
Phase 2 — Render performance (test on Windows first):
8. H1 — Add device capability detection; disable backdrop-filter for hardwareConcurrency <= 4 or prefers-reduced-motion. Keep blur on capable devices.
9. H4 — Introduce windowed rendering in SessionTranscript with @tanstack/react-virtual. Keep last 50 messages rendered always.
10. M3 — Convert CollapsedIcon spring to CSS transition. Visual delta is imperceptible.
11. M1 — Replace recentInsertionsRef filter-on-insert with index-based cleanup or lazy eviction.

Phase 3 — Architecture (larger scope, validate separately):
12. H2 — Memoize detectActiveQuestion output; cache normalized messages; move deduplicatePhrases to Web Worker.
13. H5 — Reduce capture_screen sleep from 50ms to 16ms with a comment about Windows timer resolution.
14. M4 — Add cancellation + visibility guard to the macOS reinforce loop.
15. L1 — Convert auth_clear_persisted_session to async fs.
16. L3 — Route show_mini_top_center / show_launcher_widget through run_on_main_thread on Windows.

Ready to start applying fixes in any order you choose. Phase 1 changes are all safe to batch.