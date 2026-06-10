use tauri::{
    command, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, Window,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use screenshots::Screen;
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, OnceLock, atomic::{AtomicU64, AtomicBool, AtomicU8, Ordering}};
use std::time::Instant;
use url::Url as NavUrl;

// Deepgram realtime transport (macOS + Windows only).
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod deepgram;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use deepgram::{DeepgramConfig, SttChannel, SystemHealthAtoms, SystemHealthPayload};

static SESSION_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Tracks the user's current Private Mode preference (content protection).
/// false = normal mode (window visible in screenshots)
/// true  = private mode (window hidden from screenshots)
/// Updated by toggle_content_protection; read by capture_screen to decide
/// whether a temporary protection flip is needed before capturing.
static CONTENT_PROTECTED: AtomicBool = AtomicBool::new(false);

/// Mutex used as a capture lock so that concurrent capture_screen calls
/// cannot race on the temporary content-protection flip.  Only one capture
/// runs at a time; subsequent calls wait rather than producing a corrupted
/// screenshot with protection in the wrong state.
static CAPTURE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[allow(dead_code)]
#[derive(Clone, Copy, Debug)]
enum OverlayMode {
    CompactOverlay,
    FullscreenOverlay,
}

#[cfg(target_os = "macos")]
fn apply_macos_overlay_policy(
    window: &tauri::WebviewWindow,
    activate_app: bool,
) -> Result<(), String> {
    let win = window.clone();

    window
        .run_on_main_thread(move || {
            unsafe {
                let app_cls = objc2::class!(NSApplication);
                let ns_app: *mut objc2::runtime::AnyObject =
                    objc2::msg_send![app_cls, sharedApplication];

                if activate_app {
                    let _: bool = objc2::msg_send![ns_app, setActivationPolicy: 1i64];
                }

                if let Ok(ns_win) = win.ns_window() {
                    let ptr = ns_win as *mut objc2::runtime::AnyObject;

                    const NS_POPUP_MENU_WINDOW_LEVEL: i64 = 101;
                    // canJoinAllSpaces | stationary | ignoresCycle | fullScreenAuxiliary
                    const OVERLAY_BEHAVIOR: u64 = 1 | 16 | 64 | 256;

                    let _: () = objc2::msg_send![ptr, setLevel: NS_POPUP_MENU_WINDOW_LEVEL];
                    let _: () = objc2::msg_send![ptr, setCollectionBehavior: OVERLAY_BEHAVIOR];
                    let _: () = objc2::msg_send![ptr, setOpaque: false];

                    let ns_color_cls = objc2::class!(NSColor);
                    let clear_color: *mut objc2::runtime::AnyObject =
                        objc2::msg_send![ns_color_cls, clearColor];
                    let _: () = objc2::msg_send![ptr, setBackgroundColor: clear_color];

                    let _: () = objc2::msg_send![ptr, setHidesOnDeactivate: false];
                    let _: () = objc2::msg_send![ptr, setCanHide: false];

                    if activate_app {
                        let _: () = objc2::msg_send![ptr, orderFrontRegardless];
                        let _: () = objc2::msg_send![ns_app, activateIgnoringOtherApps: true];
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn apply_overlay_policy_to_window(
    window: &WebviewWindow,
    mode: OverlayMode,
) -> Result<(), String> {
    // On Windows these Tauri APIs internally route through Win32 SetWindowPos
    // (HWND_TOPMOST), IVirtualDesktopManager COM, ITaskbarList::DeleteTab,
    // SetWindowLongPtrW, and DwmSetWindowAttribute — all cross-thread SendMessage
    // stalls when called from a Tokio worker. Post fire-and-forget to the UI thread
    // so the caller is not blocked. Ordering with subsequent show() is fine: these
    // are cosmetic style properties (taskbar, decorations) that can be applied after
    // the window is visible without user-visible glitch.
    // Linux GTK/X11 window API calls are thread-safe; keep direct calls there.
    #[cfg(target_os = "windows")]
    {
        let w = window.clone();
        let compact = matches!(mode, OverlayMode::CompactOverlay);
        window
            .run_on_main_thread(move || {
                let _ = w.set_always_on_top(true);
                let _ = w.set_visible_on_all_workspaces(true);
                let _ = w.set_skip_taskbar(true);
                let _ = w.set_decorations(false);
                let _ = w.set_shadow(compact);
            })
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        window
            .set_visible_on_all_workspaces(true)
            .map_err(|e| e.to_string())?;
        window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
        window.set_decorations(false).map_err(|e| e.to_string())?;
        window
            .set_shadow(matches!(mode, OverlayMode::CompactOverlay))
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        let _ = mode;
        apply_macos_overlay_policy(window, false)?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn reinforce_window_level(win: &tauri::WebviewWindow) {
    let w = win.clone();
    let _ = win.run_on_main_thread(move || {
        unsafe {
            if let Ok(ns_win) = w.ns_window() {
                let ptr = ns_win as *mut objc2::runtime::AnyObject;
                const NS_POPUP_MENU_WINDOW_LEVEL: i64 = 101;
                // canJoinAllSpaces | stationary | ignoresCycle | fullScreenAuxiliary
                const OVERLAY_BEHAVIOR: u64 = 1 | 16 | 64 | 256;
                let _: () = objc2::msg_send![ptr, setLevel: NS_POPUP_MENU_WINDOW_LEVEL];
                let _: () = objc2::msg_send![ptr, setCollectionBehavior: OVERLAY_BEHAVIOR];
                // orderFrontRegardless is required after every Space transition.
                // setLevel/setCollectionBehavior re-register the window with the
                // Quartz compositor but do not move it to the front of its z-level
                // within the newly-active fullscreen Space. Without this call the
                // overlay has the correct level but sits behind the fullscreen app
                // in the compositor's ordered window list for that Space.
                // orderFrontRegardless does not steal key-window focus.
                let _: () = objc2::msg_send![ptr, orderFrontRegardless];
            }
        }
    });
}

fn set_overlay_passthrough(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        let w = window.clone();
        let _ = window.run_on_main_thread(move || {
            unsafe {
                if let Ok(ns_win) = w.ns_window() {
                    let ptr = ns_win as *mut objc2::runtime::AnyObject;
                    let _: () = objc2::msg_send![ptr, setIgnoresMouseEvents: true];
                }
            }
        });
    }

    // On Windows, set_ignore_cursor_events internally calls SetWindowLongPtrW +
    // SetWindowPos(SWP_FRAMECHANGED). Called from a Tokio worker thread (the common
    // case here) this blocks until Win32 processes the cross-thread SendMessage.
    // This function is called from 14+ call sites including hot event-loop handlers;
    // each off-thread call stalls that worker and triggers a DWM frame invalidation
    // that causes the visible surface flicker/blanking reported on Windows.
    // Post fire-and-forget to the UI thread, identical to the macOS pattern above.
    #[cfg(target_os = "windows")]
    {
        let w = window.clone();
        let _ = window.run_on_main_thread(move || {
            let _ = w.set_ignore_cursor_events(true);
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = window.set_ignore_cursor_events(true);
    }
}

fn apply_overlay_policy_for_label(
    app: &AppHandle,
    label: &str,
    mode: OverlayMode,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        apply_overlay_policy_to_window(&window, mode)?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAuthSession {
    session_id: Option<String>,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthStateChangedPayload {
    source: Option<String>,
    session_id: Option<String>,
    signed_in: bool,
    emitted_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MacOsAppIdentity {
    bundle_identifier: String,
    executable_path: String,
    app_name: String,
    is_packaged: bool,
    is_dev_mode: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PermissionStatusPayload {
    status: String,
}

fn auth_session_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app_data_dir failed: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create auth dir failed: {e}"))?;
    dir.push("auth_session.json");
    Ok(dir)
}

fn now_epoch_millis_string() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(dur) => dur.as_millis().to_string(),
        Err(_) => "0".to_string(),
    }
}

fn now_epoch_millis_u64() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(dur) => dur.as_millis() as u64,
        Err(_) => 0,
    }
}

#[cfg(target_os = "macos")]
fn current_macos_identity(app: &AppHandle) -> MacOsAppIdentity {
    let executable_path = std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let bundle_identifier = app.config().identifier.clone();
    let app_name = app.package_info().name.clone();
    let is_packaged = executable_path.contains(".app/Contents/MacOS/");
    let is_dev_mode = !is_packaged;
    MacOsAppIdentity {
        bundle_identifier,
        executable_path,
        app_name,
        is_packaged,
        is_dev_mode,
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn emit_system_health_event(app: &AppHandle, generation: u64, state: &str) {
    // "capturing" events fire from the PCM callback (every 50th frame) and can
    // flood the IPC queue on Windows/Linux under audio stress. Rate-limit them
    // to at most once per 2 s. State-change events (starting, error, stopped,
    // starved) always pass through so the frontend gets prompt failure notice.
    if state == "capturing" {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let last = SYSTEM_HEALTH_LAST_EMIT_MS.load(Ordering::Relaxed);
        if now_ms.saturating_sub(last) < 2000 {
            return;
        }
        SYSTEM_HEALTH_LAST_EMIT_MS.store(now_ms, Ordering::Relaxed);
    }
    let payload = SystemHealthPayload {
        channel: "system".to_string(),
        capture_running: SYSTEM_STT_RUNNING.load(Ordering::SeqCst),
        deepgram_running: SYSTEM_DEEPGRAM_RUNNING.load(Ordering::SeqCst),
        pcm_frames_sent: SYSTEM_PCM_FRAMES_SENT.load(Ordering::SeqCst),
        last_pcm_at: SYSTEM_LAST_PCM_AT.load(Ordering::SeqCst),
        empty_final_streak: SYSTEM_EMPTY_FINAL_STREAK.load(Ordering::SeqCst),
        generation,
        state: state.to_string(),
    };
    let _ = app.emit("stt:health:system", payload);
}

#[tauri::command]
async fn auth_get_persisted_session(app: AppHandle) -> Result<Option<String>, String> {
    let path = auth_session_path(&app)?;
    // Use tokio::fs so this never blocks a Tokio worker thread — critical on
    // Windows/Linux where slow HDD/eMMC reads can stall the entire IPC queue.
    let raw = match tokio::fs::read_to_string(&path).await {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("read auth session failed: {e}")),
    };
    let parsed: PersistedAuthSession =
        serde_json::from_str(&raw).map_err(|e| format!("parse auth session failed: {e}"))?;
    Ok(parsed.session_id)
}

#[tauri::command]
async fn auth_set_persisted_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let path = auth_session_path(&app)?;
    let payload = PersistedAuthSession {
        session_id: Some(session_id),
        updated_at: now_epoch_millis_string(),
    };
    let data =
        serde_json::to_string(&payload).map_err(|e| format!("serialize auth session failed: {e}"))?;
    tokio::fs::write(path, data).await.map_err(|e| format!("write auth session failed: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn auth_clear_persisted_session(app: AppHandle) -> Result<(), String> {
    let path = auth_session_path(&app)?;
    match tokio::fs::remove_file(&path).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove auth session failed: {e}")),
    }
}

#[tauri::command]
fn auth_emit_state_changed(
    app: AppHandle,
    source: Option<String>,
    session_id: Option<String>,
    signed_in: bool,
) -> Result<(), String> {
    let payload = AuthStateChangedPayload {
        source,
        session_id,
        signed_in,
        emitted_at: now_epoch_millis_string(),
    };
    app.emit("auth:state-changed", payload)
        .map_err(|e| format!("emit auth state failed: {e}"))?;
    Ok(())
}

// ── Native audio WebSocket state ─────────────────────────────────────────────
// On macOS, WKWebView never returns audio tracks from getDisplayMedia.
// We capture the default input device (mic, or a virtual loopback device such
// as BlackHole that routes app/tab audio) in Rust via cpal, then stream raw
// PCM frames over a localhost WebSocket so the frontend can feed them to
// Deepgram directly.
//
// 3-state guard: 0 = STOPPED, 1 = STARTING, 2 = RUNNING
// compare_exchange(0→1) ensures only one startup attempt proceeds at a time;
// any concurrent call while in STARTING or RUNNING returns early.
// This eliminates the race window between "starting" and "port ready" that
// caused repeated macOS TCC (permission) prompts.
const AUDIO_STOPPED: u8 = 0;
const AUDIO_STARTING: u8 = 1;
const AUDIO_RUNNING_STATE: u8 = 2;

#[cfg(any(target_os = "macos", target_os = "windows"))]
static AUDIO_STATE: AtomicU8 = AtomicU8::new(AUDIO_STOPPED);
// Keep AtomicBool for the cpal loop-exit signal (stream keep-alive thread reads this)
#[cfg(any(target_os = "macos", target_os = "windows"))]
static AUDIO_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(any(target_os = "macos", target_os = "windows"))]
static AUDIO_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);

/// ScreenCaptureKit display audio stream state.
/// Captures system/tab audio from the primary display — does NOT require a
/// virtual audio device (BlackHole/Loopback).  Requires macOS 13.0+ and the
/// user to have granted Screen Recording permission.
///
/// Same 3-state guard: 0 = STOPPED, 1 = STARTING, 2 = RUNNING
#[cfg(any(target_os = "macos", target_os = "windows"))]
static DISPLAY_AUDIO_STATE: AtomicU8 = AtomicU8::new(AUDIO_STOPPED);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static DISPLAY_AUDIO_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(any(target_os = "macos", target_os = "windows"))]
static DISPLAY_AUDIO_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);

/// Monotonic generation counter — incremented on every stop so a previous
/// zombie thread knows to exit even if DISPLAY_AUDIO_RUNNING was re-set to
/// true by a rapid stop→start sequence.
#[cfg(any(target_os = "macos", target_os = "windows"))]
static DISPLAY_AUDIO_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Rust-native Parakeet-style STT — Deepgram WS lives in Rust, the webview
/// only receives emitted transcript events (no raw audio in JS at all).
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SYSTEM_STT_RUNNING: AtomicBool = AtomicBool::new(false);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SYSTEM_STT_GENERATION: AtomicU64 = AtomicU64::new(0);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SYSTEM_STT_STATE: AtomicU8 = AtomicU8::new(AUDIO_STOPPED);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SYSTEM_DEEPGRAM_RUNNING: AtomicBool = AtomicBool::new(false);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SYSTEM_PCM_FRAMES_SENT: AtomicU64 = AtomicU64::new(0);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SYSTEM_LAST_PCM_AT: AtomicU64 = AtomicU64::new(0);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SYSTEM_EMPTY_FINAL_STREAK: AtomicU64 = AtomicU64::new(0);
// Rate-limit "capturing" health events from the PCM callback to once per 2 s.
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SYSTEM_HEALTH_LAST_EMIT_MS: AtomicU64 = AtomicU64::new(0);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static MIC_STT_RUNNING: AtomicBool = AtomicBool::new(false);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static MIC_STT_GENERATION: AtomicU64 = AtomicU64::new(0);
#[cfg(any(target_os = "macos", target_os = "windows"))]
static MIC_STT_STATE: AtomicU8 = AtomicU8::new(AUDIO_STOPPED);

// ─────────────────────────────────────────────────────────────────────────────

/// Window subclass proc for the mini overlay.
/// Returns HTTRANSPARENT (-1) for the transparent rounded-corner zones so that
/// mouse clicks pass through to whatever is underneath; everything else is
/// handled normally (drag, buttons, etc.).
#[cfg(target_os = "windows")]
unsafe extern "system" fn mini_subclass_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _uid_subclass: usize,
    _ref_data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::{RECT, LRESULT};
    use windows::Win32::UI::WindowsAndMessaging::{WM_NCHITTEST, WM_NCCALCSIZE, GetWindowRect};
    use windows::Win32::UI::Shell::DefSubclassProc;

    // Intercept WM_NCCALCSIZE (wParam=TRUE) and return 0 so that the entire
    // window rect becomes the client rect — zero NC area — which is the only
    // reliable way to eliminate the DWM accent border at OS level on all
    // Windows versions, without also killing the compositor drop-shadow.
    if msg == WM_NCCALCSIZE && wparam.0 != 0 {
        return LRESULT(0);
    }

    if msg == WM_NCHITTEST {
        // Screen-space cursor position packed into LPARAM
        let pt_x = (lparam.0 & 0xFFFF) as i16 as i32;
        let pt_y = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;

        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);

        let cx = pt_x - rect.left;
        let cy = pt_y - rect.top;
        let w  = rect.right  - rect.left;
        let h  = rect.bottom - rect.top;
        let r  = 12i32; // matches Tailwind `rounded-xl`

        if cx < 0 || cy < 0 || cx > w || cy > h {
            return LRESULT(-1); // HTTRANSPARENT
        }

        let in_corner =
            (cx <   r && cy <   r && (cx-r)*(cx-r)         + (cy-r)*(cy-r)         > r*r) ||
            (cx > w-r && cy <   r && (cx-(w-r))*(cx-(w-r)) + (cy-r)*(cy-r)         > r*r) ||
            (cx <   r && cy > h-r && (cx-r)*(cx-r)         + (cy-(h-r))*(cy-(h-r)) > r*r) ||
            (cx > w-r && cy > h-r && (cx-(w-r))*(cx-(w-r)) + (cy-(h-r))*(cy-(h-r)) > r*r);

        if in_corner {
            return LRESULT(-1); // HTTRANSPARENT
        }

        return DefSubclassProc(hwnd, msg, wparam, lparam);
    }

    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Remove every OS-level visual chrome from a Tauri window:
///  - accent / focus border (blue ring)
///  - top-edge highlight / caption outline
///  - drop shadow
///  - black background behind transparent/rounded corners
#[cfg(target_os = "windows")]
fn remove_window_border(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute,
        DWMWA_BORDER_COLOR,
        // DWMNCRP_DISABLED and DWMWCP_DONOTROUND removed: the WM_NCCALCSIZE
        // intercept in mini_subclass_proc collapses NC area to zero which is
        // the definitive fix. DWMNCRP_DISABLED also kills the DWM shadow;
        // DWMWCP_DONOTROUND was only needed to suppress the top-edge outline
        // that rounded corners create, which disappears with NC area = 0.
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOP, SetWindowLongPtrW, GetWindowLongPtrW,
        GWL_STYLE, GWL_EXSTYLE,
        WS_BORDER, WS_DLGFRAME, WS_THICKFRAME, WS_CAPTION,
        WS_EX_DLGMODALFRAME, WS_EX_CLIENTEDGE, WS_EX_STATICEDGE, WS_EX_WINDOWEDGE,
        SWP_NOSIZE, SWP_NOMOVE, SWP_NOZORDER, SWP_FRAMECHANGED,
    };
    unsafe {
        // Strip NC frame window styles so Windows allocates no NC space even
        // before WM_NCCALCSIZE fires (belt-and-suspenders with the subclass).
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let mask  = (WS_BORDER.0 | WS_DLGFRAME.0 | WS_THICKFRAME.0 | WS_CAPTION.0) as isize;
        SetWindowLongPtrW(hwnd, GWL_STYLE, style & !mask);

        let ex      = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let ex_mask = (WS_EX_DLGMODALFRAME.0
            | WS_EX_CLIENTEDGE.0
            | WS_EX_STATICEDGE.0
            | WS_EX_WINDOWEDGE.0) as isize;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex & !ex_mask);

        // Belt-and-suspenders accent border removal for Win11 22H2+.
        // 0xFFFFFFFE = DWMWA_COLOR_NONE.
        let color_none: u32 = 0xFFFFFFFE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &color_none as *const u32 as *const std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );

        // Flush all style changes immediately.
        let _ = SetWindowPos(
            hwnd,
            HWND_TOP,
            0, 0, 0, 0,
            SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_FRAMECHANGED,
        );
    }
}

#[tauri::command]
fn toggle_floating(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("floating") {
        win.hide().map_err(|e| e.to_string())?;
    } else {
        WebviewWindowBuilder::new(&app, "floating", WebviewUrl::App("floating.html".into()))
            .title("Mini Overlay")
            // .inner_size(300f64, 200f64)
            .position(20f64, 20f64)
            .always_on_top(true)
            .minimizable(false)
            .maximizable(false)
            .decorations(false)
            .skip_taskbar(true)
            .build()
            .map_err(|e| e.to_string())?;

        #[cfg(target_os = "windows")]
        if let Some(win) = app.get_webview_window("floating") {
            if let Ok(hwnd) = win.hwnd() {
                let _ = winvd::pin_window(windows::Win32::Foundation::HWND(hwnd.0));
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn capture_screen(app: AppHandle, window: Window) -> Result<String, String> {
    let total_started_at = Instant::now();
    let lock_started_at = Instant::now();
    let _lock = CAPTURE_LOCK.lock().await;
    let lock_wait_ms = lock_started_at.elapsed().as_millis();

    let position_started_at = Instant::now();
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let screen = Screen::from_point(position.x, position.y).map_err(|e| e.to_string())?;
    let position_ms = position_started_at.elapsed().as_millis();

    let was_protected = CONTENT_PROTECTED.load(Ordering::SeqCst);

    let protection_started_at = Instant::now();
    if !was_protected {
        for label in ["launcher", "mini", "main"] {
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.set_content_protected(true);
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(16)).await;
    }
    let protection_enable_ms = protection_started_at.elapsed().as_millis();

    let capture_started_at = Instant::now();
    let capture_result = tokio::task::spawn_blocking(move || screen.capture())
        .await
        .map_err(|e| format!("capture task failed: {e}"))?;
    let capture_ms = capture_started_at.elapsed().as_millis();

    let restore_started_at = Instant::now();
    if !was_protected {
        for label in ["launcher", "mini", "main"] {
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.set_content_protected(false);
            }
        }
    }
    let restore_ms = restore_started_at.elapsed().as_millis();

    let image = capture_result.map_err(|e| e.to_string())?;
    let original_width = image.width();
    let original_height = image.height();

    let encode_started_at = Instant::now();
    let (b64, resized_width, resized_height, jpeg_bytes) = tokio::task::spawn_blocking(
        move || -> Result<(String, u32, u32, usize), String> {
            let resized = screenshots::image::DynamicImage::ImageRgba8(image).resize(
                1600,
                1600,
                screenshots::image::imageops::FilterType::Triangle,
            );
            let resized_width = resized.width();
            let resized_height = resized.height();
            let mut bytes = Vec::new();
            let mut encoder =
                screenshots::image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 85);
            encoder.encode_image(&resized).map_err(|e| e.to_string())?;
            let jpeg_bytes = bytes.len();
            let b64 = general_purpose::STANDARD.encode(bytes);
            Ok((b64, resized_width, resized_height, jpeg_bytes))
        },
    )
    .await
    .map_err(|e| format!("encode task failed: {e}"))??;
    let encode_ms = encode_started_at.elapsed().as_millis();
    let total_ms = total_started_at.elapsed().as_millis();

    #[cfg(debug_assertions)]
    println!(
        "[Analyze Screen][Timing][NativeCapture] lockWaitMs={lock_wait_ms} positionMs={position_ms} protectionEnableMs={protection_enable_ms} captureMs={capture_ms} restoreMs={restore_ms} encodeMs={encode_ms} totalMs={total_ms} original={original_width}x{original_height} resized={resized_width}x{resized_height} jpegBytes={jpeg_bytes} wasProtected={was_protected}"
    );

    Ok(format!("data:image/jpeg;base64,{}", b64))
}


#[tauri::command]
async fn show_mini_top_center(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let _ = set_macos_activation_policy("accessory".to_string());
    // The mini window is destroyed when a session ends (getCurrentWindow().close()).
    // Re-create it with the same config as tauri.conf.json when it no longer exists.
    let window = match app.get_webview_window("mini") {
        Some(w) => w,
        None => WebviewWindowBuilder::new(
            &app,
            "mini",
            WebviewUrl::App("floating.html".into()),
        )
        .title("ScribeShade Floating Screen")
        .inner_size(700f64, 360f64)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .minimizable(false)
        .maximizable(false)
        .resizable(false)
        .skip_taskbar(true)
        .visible(false)
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .content_protected(true)
        .build()
        .map_err(|e| e.to_string())?,
    };

    // Expand mini to fill the entire primary monitor — same architecture as
    // the launcher window.  The React overlay positions the widget card
    // absolutely at top-center; the fullscreen transparent host ensures
    // popups / tooltips / SessionMenu can never be clipped by the OS frame.
    let monitor = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no primary monitor")?;

    let screen = monitor.size();
    let mon_pos = monitor.position();

    // On Windows, set_size/set_position/set_minimizable/set_maximizable route through
    // Win32 SendMessage which requires the call to originate on the UI thread. Route
    // through run_on_main_thread to avoid a cross-thread SendMessage round-trip.
    // Other platforms make direct Cocoa/GTK calls that are safe from any thread.
    #[cfg(target_os = "windows")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
        let w = window.clone();
        let size = PhysicalSize::new(screen.width, screen.height);
        let pos = PhysicalPosition { x: mon_pos.x, y: mon_pos.y };
        app.run_on_main_thread(move || {
            let result = (|| -> Result<(), String> {
                w.set_size(size).map_err(|e| e.to_string())?;
                w.set_position(pos).map_err(|e| e.to_string())?;
                w.set_minimizable(false).map_err(|e| e.to_string())?;
                w.set_maximizable(false).map_err(|e| e.to_string())?;
                Ok(())
            })();
            let _ = tx.send(result);
        }).map_err(|e| e.to_string())?;
        rx.await.map_err(|_| "window thread dropped".to_string())??;
    }
    #[cfg(not(target_os = "windows"))]
    {
        window
            .set_size(PhysicalSize::new(screen.width, screen.height))
            .map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition { x: mon_pos.x, y: mon_pos.y })
            .map_err(|e| e.to_string())?;
        window.set_minimizable(false).map_err(|e| e.to_string())?;
        window.set_maximizable(false).map_err(|e| e.to_string())?;
    }
    apply_overlay_policy_to_window(&window, OverlayMode::FullscreenOverlay)?;

    #[cfg(target_os = "macos")]
    {
        window.show().map_err(|e| e.to_string())?;
        apply_macos_overlay_policy(&window, true)?;
    }

    // ── Windows ───────────────────────────────────────────────────────────
    // ShowWindow is safe cross-thread. The HWND-level operations below have strict
    // thread-affinity requirements and must run on the window-owner (UI) thread:
    //   winvd::pin_window  — VirtualDesktop COM, STA required
    //   remove_window_border — DwmSetWindowAttribute + SetWindowLongPtrW, DWM stall
    //   SetWindowSubclass  — MSDN: must be installed from the thread that owns the
    //                         window; off-thread install silently breaks WM_NCCALCSIZE
    //                         interception, leaving a visible NC border.
    #[cfg(target_os = "windows")]
    {
        window.show().map_err(|e| e.to_string())?;
        if let Ok(hwnd) = window.hwnd() {
            let raw = hwnd.0;
            window
                .run_on_main_thread(move || {
                    let h = windows::Win32::Foundation::HWND(raw);
                    let _ = winvd::pin_window(h);
                    remove_window_border(h);
                    unsafe {
                        let _ = windows::Win32::UI::Shell::SetWindowSubclass(
                            h, Some(mini_subclass_proc), 1, 0,
                        );
                    }
                })
                .map_err(|e| e.to_string())?;
        }
    }

    // ── Linux ─────────────────────────────────────────────────────────────
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        window.show().map_err(|e| e.to_string())?;
    }

    // On macOS focus is handled by activateIgnoringOtherApps in the block above.
    #[cfg(not(target_os = "macos"))]
    window.set_focus().map_err(|e| e.to_string())?;

    set_overlay_passthrough(&window);

    Ok(())
}

/// No-op stub kept for API compat.
///
/// The mini window is now a fullscreen transparent overlay (same architecture
/// as the launcher window). Badge / bar / expanded state transitions are
/// managed entirely by React via CSS — the native window never resizes.
#[tauri::command]
async fn set_mini_state(
    _app: AppHandle,
    _state: String,
    _height: Option<u32>,
) -> Result<(), String> {
    Ok(())
}

/// No-op stub kept for API compat.
///
/// The mini window is now fullscreen — popups can never clip, so the
/// expand-before-render pattern is no longer needed.
#[tauri::command]
async fn set_mini_size_instant(
    _app: AppHandle,
    _width: u32,
    _height: u32,
) -> Result<(), String> {
    Ok(())
}

// ── macOS native audio capture commands ──────────────────────────────────────
// Start a cpal input stream on the chosen device, encode raw samples as 16-bit
// little-endian PCM, and broadcast them to all connected WebSocket clients on
// a random localhost port.  Returns the port number so the frontend can open
// ws://127.0.0.1:{port}.
//
// Device selection:
//   device_name = None  → default input (microphone)
//   device_name = Some("BlackHole 2ch") etc. → virtual loopback for tab audio

#[cfg(target_os = "macos")]
#[tauri::command]
async fn start_audio_stream(device_name: Option<String>) -> Result<u16, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use axum::{Router, extract::ws::{WebSocketUpgrade, WebSocket, Message}};
    use axum::extract::State;
    use tokio::sync::broadcast;

    // ── 3-state idempotency guard ─────────────────────────────────────────
    // compare_exchange(STOPPED → STARTING) is the only path that proceeds.
    // Any concurrent call while STARTING or RUNNING returns early without
    // touching the OS mic device — preventing duplicate TCC permission prompts.
    match AUDIO_STATE.compare_exchange(
        AUDIO_STOPPED, AUDIO_STARTING, Ordering::SeqCst, Ordering::SeqCst,
    ) {
        Ok(_) => {} // we own the startup
        Err(AUDIO_STARTING) => {
            // First startup still in progress — caller should retry after a short delay
            return Err("mic audio stream is already starting".into());
        }
        Err(_) => {
            // Already RUNNING — return the existing port
            let port = AUDIO_PORT.load(Ordering::SeqCst);
            if port != 0 { return Ok(port); }
            return Err("mic audio stream is running but port is not ready yet".into());
        }
    }

    // Helper that resets state on any failure path
    macro_rules! fail {
        ($msg:expr) => {{
            AUDIO_RUNNING.store(false, Ordering::SeqCst);
            AUDIO_PORT.store(0, Ordering::SeqCst);
            AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err($msg.to_string());
        }};
    }

    let host = cpal::default_host();

    let device = if let Some(ref name) = device_name {
        match host.input_devices() {
            Ok(mut devs) => devs
                .find(|d| d.name().map(|n| n.contains(name.as_str())).unwrap_or(false))
                .ok_or_else(|| { AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst); format!("Audio device '{}' not found", name) })?,
            Err(e) => fail!(e.to_string()),
        }
    } else {
        match host.default_input_device() {
            Some(d) => d,
            None => fail!("No default input device found. Check microphone access in System Settings → Privacy & Security → Microphone."),
        }
    };

    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => fail!(e.to_string()),
    };
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as u32;

    // Broadcast channel — new WS clients subscribe, cpal thread publishes
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(256);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();

    // Startup handshake: thread signals success/failure before we return Ok(port).
    // Without this the frontend could retry while macOS permission is unresolved,
    // causing repeated TCC dialogs.
    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    AUDIO_RUNNING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let tx = tx_capture;
        let err_fn = |e| eprintln!("[cpal mic] stream error: {e}");

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    if !AUDIO_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.iter().flat_map(|&s| {
                        let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                        v.to_le_bytes()
                    }).collect();
                    let _ = tx.send(Arc::new(pcm));
                },
                err_fn, None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _| {
                    if !AUDIO_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.iter().flat_map(|s| s.to_le_bytes()).collect();
                    let _ = tx.send(Arc::new(pcm));
                },
                err_fn, None,
            ),
            _ => {
                AUDIO_RUNNING.store(false, Ordering::SeqCst);
                AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
                let _ = init_tx.send(Err("Unsupported sample format".into()));
                return;
            }
        };

        match stream {
            Ok(s) => {
                if let Err(e) = s.play() {
                    AUDIO_RUNNING.store(false, Ordering::SeqCst);
                    AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
                    let _ = init_tx.send(Err(format!("Failed to start mic stream: {e}")));
                    return;
                }
                let _ = init_tx.send(Ok(()));
                while AUDIO_RUNNING.load(Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                // stream dropped here → cpal stops
            }
            Err(e) => {
                AUDIO_RUNNING.store(false, Ordering::SeqCst);
                AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!(
                    "Failed to open mic device: {e}. \
                     Grant access in System Settings → Privacy & Security → Microphone."
                )));
            }
        }
    });

    // Wait up to 8 s for the cpal thread to confirm the stream started.
    match tokio::time::timeout(std::time::Duration::from_secs(8), init_rx).await {
        Ok(Ok(Ok(()))) => {} // stream confirmed started
        Ok(Ok(Err(e))) => {
            eprintln!("[start_audio_stream] cpal init FAILED: {e}");
            AUDIO_PORT.store(0, Ordering::SeqCst);
            AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(e);
        }
        _ => {
            let msg = "Mic stream timed out — check Microphone permission in System Settings.";
            eprintln!("[start_audio_stream] cpal init TIMEOUT");
            AUDIO_RUNNING.store(false, Ordering::SeqCst);
            AUDIO_PORT.store(0, Ordering::SeqCst);
            AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(msg.into());
        }
    }

    // Bind axum WebSocket server on a random port
    let listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(e) => fail!(e.to_string()),
    };
    let port = match listener.local_addr() {
        Ok(a) => a.port(),
        Err(e) => fail!(e.to_string()),
    };
    AUDIO_PORT.store(port, Ordering::SeqCst);
    AUDIO_STATE.store(AUDIO_RUNNING_STATE, Ordering::SeqCst);

    // Include sample_rate and channel count in the first message so the
    // frontend can configure Deepgram correctly.
    let meta = format!("{{\"sampleRate\":{sample_rate},\"channels\":{channels}}}");
    let meta_bytes = Arc::new(meta.into_bytes());

    let router = Router::new()
        .route("/", axum::routing::get(
            move |ws: WebSocketUpgrade, State(state): State<Arc<broadcast::Sender<Arc<Vec<u8>>>>>| {
                let meta_clone = meta_bytes.clone();
                async move {
                    ws.on_upgrade(move |mut socket: WebSocket| async move {
                        let _ = socket.send(Message::Text(
                            String::from_utf8_lossy(&meta_clone).into()
                        )).await;
                        let mut rx = state.subscribe();
                        loop {
                            match rx.recv().await {
                                Ok(pcm) => {
                                    if socket.send(Message::Binary((*pcm).clone())).await.is_err() {
                                        break;
                                    }
                                }
                                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                                Err(_) => break,
                            }
                        }
                    })
                }
            }
        ))
        .with_state(tx_arc);

    tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    Ok(port)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn stop_audio_stream() {
    AUDIO_RUNNING.store(false, Ordering::SeqCst);
    AUDIO_PORT.store(0, Ordering::SeqCst);
    AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
}

/// Returns the list of available audio input device names so the frontend can
/// offer a picker (e.g. "BlackHole 2ch" for loopback / tab audio).
#[cfg(target_os = "macos")]
#[tauri::command]
fn list_audio_devices() -> Vec<String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    host.input_devices()
        .map(|devs| devs.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

// ── macOS ScreenCaptureKit display audio stream ───────────────────────────────
// Captures the audio playing on the primary display (system/tab audio) via SCKit.
// This does NOT require a virtual audio device — SCKit taps the OS audio graph
// directly.  Requires macOS 13.0+ and Screen Recording permission.
//
// Same WS/broadcast architecture as start_audio_stream:
//   SCKit callback → broadcast channel → axum WS → frontend → Deepgram

#[cfg(target_os = "macos")]
#[tauri::command]
async fn start_display_audio_stream() -> Result<u16, String> {
    use screencapturekit::prelude::*;
    use axum::{Router, extract::ws::{WebSocketUpgrade, WebSocket, Message}};
    use axum::extract::State;
    use tokio::sync::broadcast;

    // ── 3-state idempotency guard (same pattern as start_audio_stream) ────
    match DISPLAY_AUDIO_STATE.compare_exchange(
        AUDIO_STOPPED, AUDIO_STARTING, Ordering::SeqCst, Ordering::SeqCst,
    ) {
        Ok(_) => {} // we own the startup
        Err(AUDIO_STARTING) => {
            return Err("display audio stream is already starting".into());
        }
        Err(_) => {
            // Already RUNNING — return the existing port
            let port = DISPLAY_AUDIO_PORT.load(Ordering::SeqCst);
            if port != 0 { return Ok(port); }
            return Err("display audio stream is running but port is not ready yet".into());
        }
    }

    // Broadcast channel: SCKit callback thread → axum WS clients
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(128);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();

    // Startup result channel: SCKit thread signals success or failure back to
    // this async fn BEFORE it returns Ok(port). Previously the function returned
    // immediately after spawning the thread, meaning a permission-denied error
    // in SCKit was invisible: the axum WS stayed open, JS showed "transcribing",
    // but zero PCM ever flowed.
    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    // Bump generation so any previous zombie thread (from a rapid stop→start)
    // exits on its next 50 ms tick even if DISPLAY_AUDIO_RUNNING was re-set true.
    let my_gen = DISPLAY_AUDIO_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    DISPLAY_AUDIO_RUNNING.store(true, Ordering::SeqCst);

    // SCKit must be set up and kept alive on a dedicated OS thread.
    // All SCKit objects (SCStream, SCShareableContent, etc.) are created and
    // dropped on this thread — no Send constraints needed.
    std::thread::spawn(move || {
        let tx = tx_capture;

        // Get the list of capturable displays
        let content = match SCShareableContent::get() {
            Ok(c) => c,
            Err(e) => {
                match e {
                    SCError::NoShareableContent(_) => {}
                    _ => {}
                }
                DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!(
                    "Screen Recording permission denied or SCKit unavailable: {e:?}. \
                     Grant access in System Settings → Privacy & Security → Screen Recording."
                )));
                return;
            }
        };

        let displays = content.displays();
        let display = match displays.into_iter().next() {
            Some(d) => d,
            None => {
                DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err("No display found for system audio capture.".to_string()));
                return;
            }
        };

        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();

        // Audio-only config — 2×2 video size to minimise GPU overhead.
        // with_captures_audio requires macOS 13.0+ (feature = "macos_13_0").
        let config = SCStreamConfiguration::new()
            .with_width(2)
            .with_height(2)
            .with_captures_audio(true)
            .with_sample_rate(48000)
            .with_channel_count(2);

        let mut stream = SCStream::new(&filter, &config);

        // The audio callback runs on SCKit's internal dispatch queue.
        // AudioBufferList is !Send, so we extract bytes here and send Vec<u8>.
        stream.add_output_handler(
            move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
                match of_type {
                    SCStreamOutputType::Audio => {}
                    _ => return,
                }

                let abl = match sample.audio_buffer_list() {
                    Some(a) => a,
                    None => return,
                };

                let num_bufs = abl.num_buffers();
                if num_bufs == 0 { return; }

                // Convert f32 stereo → mono i16 LE PCM for Deepgram (linear16, channels=1).
                // SCKit always delivers float32 at 48 kHz with 2 channels.
                // Downmixing to mono here means Deepgram receives a clean single-channel
                // stream — no multichannel mode needed, works reliably with nova-3.
                let mut pcm: Vec<u8> = Vec::new();

                if num_bufs == 1 {
                    // Interleaved stereo: layout is [L0_f32][R0_f32][L1_f32][R1_f32]...
                    // Read 8 bytes per frame (2 × f32), average L+R → mono.
                    if let Some(buf) = abl.get(0) {
                        for frame in buf.data().chunks_exact(8) {
                            let l = f32::from_le_bytes([frame[0], frame[1], frame[2], frame[3]]);
                            let r = f32::from_le_bytes([frame[4], frame[5], frame[6], frame[7]]);
                            let mono = ((l + r) * 0.5).clamp(-1.0, 1.0);
                            let v = (mono * i16::MAX as f32) as i16;
                            pcm.extend_from_slice(&v.to_le_bytes());
                        }
                    }
                } else {
                    // Non-interleaved: one buffer per channel.
                    // Average all channels per sample position → mono.
                    let samples_per_ch = abl.get(0)
                        .map(|b| b.data().len() / 4)
                        .unwrap_or(0);
                    for i in 0..samples_per_ch {
                        let mut sum = 0.0f32;
                        let mut count = 0u32;
                        for b in 0..num_bufs {
                            if let Some(buf) = abl.get(b) {
                                let raw = buf.data();
                                let off = i * 4;
                                if off + 4 <= raw.len() {
                                    let f = f32::from_le_bytes([
                                        raw[off], raw[off+1], raw[off+2], raw[off+3]
                                    ]);
                                    sum += f;
                                    count += 1;
                                }
                            }
                        }
                        if count > 0 {
                            let mono = (sum / count as f32).clamp(-1.0, 1.0);
                            let v = (mono * i16::MAX as f32) as i16;
                            pcm.extend_from_slice(&v.to_le_bytes());
                        }
                    }
                }

                if !pcm.is_empty() {
                    let _ = tx.send(Arc::new(pcm));
                }
            },
            SCStreamOutputType::Audio,
        );

        if let Err(e) = stream.start_capture() {
            DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
            let _ = init_tx.send(Err(format!(
                "System audio capture failed to start: {e:?}. \
                 Ensure Screen Recording permission is granted in System Settings → Privacy & Security → Screen Recording."
            )));
            return;
        }

        // Signal successful startup — the async caller is waiting on init_rx.
        let _ = init_tx.send(Ok(()));

        // Keep SCKit stream alive, checking both the running flag AND the
        // generation so a rapid stop→start sequence doesn't leave this thread
        // looping after a new stream has been spawned.
        while DISPLAY_AUDIO_RUNNING.load(Ordering::Relaxed)
            && DISPLAY_AUDIO_GENERATION.load(Ordering::Relaxed) == my_gen
        {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let _ = stream.stop_capture();
        // stream, content, display, filter dropped here (on this thread)
    });

    // Wait up to 10 s for SCKit to confirm it started.  10 s gives the user
    // time to grant Screen Recording permission on first run; a denied or
    // missing permission still fails fast (SCShareableContent::get errors).
    match tokio::time::timeout(std::time::Duration::from_secs(10), init_rx).await {
        Ok(Ok(Ok(()))) => {} // SCKit started — proceed to bind axum server
        Ok(Ok(Err(e))) => {
            DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
            DISPLAY_AUDIO_PORT.store(0, Ordering::SeqCst);
            DISPLAY_AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(e);
        }
        _ => {
            DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
            DISPLAY_AUDIO_PORT.store(0, Ordering::SeqCst);
            DISPLAY_AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(
                "System audio capture timed out — check Screen Recording permission \
                 in System Settings → Privacy & Security → Screen Recording."
                    .to_string(),
            );
        }
    }

    // Bind axum WebSocket server on a random localhost port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    DISPLAY_AUDIO_PORT.store(port, Ordering::SeqCst);
    DISPLAY_AUDIO_STATE.store(AUDIO_RUNNING_STATE, Ordering::SeqCst);

    // First WS message is JSON metadata so the frontend can configure Deepgram.
    // We always output mono (channels=1) regardless of SCKit's native stereo
    // capture — the downmix happens in the callback above.
    let sample_rate: u32 = 48000;
    let channels: u32 = 1;
    let meta = format!("{{\"sampleRate\":{sample_rate},\"channels\":{channels}}}");
    let meta_bytes = Arc::new(meta.into_bytes());

    let router = Router::new()
        .route("/", axum::routing::get(
            move |ws: WebSocketUpgrade, State(state): State<Arc<broadcast::Sender<Arc<Vec<u8>>>>>| {
                let meta_clone = meta_bytes.clone();
                async move {
                    ws.on_upgrade(move |mut socket: WebSocket| async move {
                        let _ = socket.send(Message::Text(
                            String::from_utf8_lossy(&meta_clone).into()
                        )).await;
                        let mut rx = state.subscribe();
                        loop {
                            match rx.recv().await {
                                Ok(pcm) => {
                                    if socket.send(Message::Binary((*pcm).clone())).await.is_err() {
                                        break;
                                    }
                                }
                                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                                Err(_) => break,
                            }
                        }
                    })
                }
            }
        ))
        .with_state(tx_arc);

    tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    Ok(port)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn stop_display_audio_stream() {
    // Increment generation FIRST so the SCKit thread exits on its next tick
    // even if start_display_audio_stream is called immediately after this
    // (which would re-set DISPLAY_AUDIO_RUNNING to true).
    DISPLAY_AUDIO_GENERATION.fetch_add(1, Ordering::SeqCst);
    DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
    DISPLAY_AUDIO_PORT.store(0, Ordering::SeqCst);
    DISPLAY_AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
}

// ── Windows: cpal mic audio stream ───────────────────────────────────────────
#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_audio_stream(device_name: Option<String>) -> Result<u16, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use axum::{Router, extract::ws::{WebSocketUpgrade, WebSocket, Message}};
    use axum::extract::State;
    use tokio::sync::broadcast;
    use std::sync::Arc;

    // ── 3-state idempotency guard ─────────────────────────────────────────
    match AUDIO_STATE.compare_exchange(
        AUDIO_STOPPED, AUDIO_STARTING, Ordering::SeqCst, Ordering::SeqCst,
    ) {
        Ok(_) => {}
        Err(AUDIO_STARTING) => return Err("mic audio stream is already starting".into()),
        Err(_) => {
            let port = AUDIO_PORT.load(Ordering::SeqCst);
            if port != 0 { return Ok(port); }
            return Err("mic audio stream is running but port is not ready yet".into());
        }
    }

    macro_rules! fail {
        ($msg:expr) => {{
            AUDIO_RUNNING.store(false, Ordering::SeqCst);
            AUDIO_PORT.store(0, Ordering::SeqCst);
            AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err($msg.to_string());
        }};
    }

    let host = cpal::default_host();
    let device = if let Some(ref name) = device_name {
        match host.input_devices() {
            Ok(mut devs) => devs
                .find(|d| d.name().map(|n| n.contains(name.as_str())).unwrap_or(false))
                .ok_or_else(|| { AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst); format!("Audio device '{}' not found", name) })?,
            Err(e) => fail!(e.to_string()),
        }
    } else {
        match host.default_input_device() {
            Some(d) => d,
            None => fail!("No default input device found"),
        }
    };

    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => fail!(e.to_string()),
    };
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as u32;

    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(256);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();

    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    AUDIO_RUNNING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let tx = tx_capture;
        let err_fn = |e| eprintln!("[cpal win mic] stream error: {e}");
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    if !AUDIO_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.iter().flat_map(|&s| {
                        let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                        v.to_le_bytes()
                    }).collect();
                    let _ = tx.send(Arc::new(pcm));
                }, err_fn, None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _| {
                    if !AUDIO_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.iter().flat_map(|s| s.to_le_bytes()).collect();
                    let _ = tx.send(Arc::new(pcm));
                }, err_fn, None,
            ),
            _ => {
                AUDIO_RUNNING.store(false, Ordering::SeqCst);
                AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
                let _ = init_tx.send(Err("Unsupported sample format".into()));
                return;
            }
        };
        match stream {
            Ok(s) => {
                if let Err(e) = s.play() {
                    AUDIO_RUNNING.store(false, Ordering::SeqCst);
                    AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
                    let _ = init_tx.send(Err(format!("Failed to start mic stream: {e}")));
                    return;
                }
                let _ = init_tx.send(Ok(()));
                while AUDIO_RUNNING.load(Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            }
            Err(e) => {
                AUDIO_RUNNING.store(false, Ordering::SeqCst);
                AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!("Failed to open mic device: {e}")));
            }
        }
    });

    match tokio::time::timeout(std::time::Duration::from_secs(8), init_rx).await {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(e))) => {
            AUDIO_PORT.store(0, Ordering::SeqCst);
            AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(e);
        }
        _ => {
            AUDIO_RUNNING.store(false, Ordering::SeqCst);
            AUDIO_PORT.store(0, Ordering::SeqCst);
            AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err("Mic stream timed out".into());
        }
    }

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    AUDIO_PORT.store(port, Ordering::SeqCst);
    AUDIO_STATE.store(AUDIO_RUNNING_STATE, Ordering::SeqCst);

    let meta = format!("{{\"sampleRate\":{sample_rate},\"channels\":{channels}}}");
    let meta_bytes = Arc::new(meta.into_bytes());

    let router = Router::new().route("/", axum::routing::get(
        move |ws: WebSocketUpgrade, State(state): State<Arc<broadcast::Sender<Arc<Vec<u8>>>>>| {
            let meta_clone = meta_bytes.clone();
            async move {
                ws.on_upgrade(move |mut socket: WebSocket| async move {
                    let _ = socket.send(Message::Text(String::from_utf8_lossy(&meta_clone).into())).await;
                    let mut rx = state.subscribe();
                    loop {
                        match rx.recv().await {
                            Ok(pcm) => { if socket.send(Message::Binary((*pcm).clone())).await.is_err() { break; } }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(_) => break,
                        }
                    }
                })
            }
        }
    )).with_state(tx_arc);

    tokio::spawn(async move { let _ = axum::serve(listener, router).await; });
    Ok(port)
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn stop_audio_stream() {
    AUDIO_RUNNING.store(false, Ordering::SeqCst);
    AUDIO_PORT.store(0, Ordering::SeqCst);
    AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn list_audio_devices() -> Vec<String> {
    // WASAPI IMMDeviceEnumerator::EnumAudioEndpoints is a synchronous COM call.
    // On budget i3/i5 laptops with Realtek/Conexant drivers it can block for
    // 200–800 ms while the driver reads registry config. Running it on a Tokio
    // worker holds the slot for the full duration — concurrent invoke calls queue
    // and clicks appear frozen. spawn_blocking moves it to a dedicated OS thread;
    // the 5-second timeout returns a safe fallback instead of hanging forever.
    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::task::spawn_blocking(|| {
            use cpal::traits::{DeviceTrait, HostTrait};
            let host = cpal::default_host();
            host.input_devices()
                .map(|devs| devs.filter_map(|d| d.name().ok()).collect::<Vec<_>>())
                .unwrap_or_default()
        }),
    )
    .await
    {
        Ok(Ok(devices)) => devices,
        _ => vec!["Default".to_string()],
    }
}

// ── Windows: WASAPI loopback — captures system/speaker audio ──────────────────
// On Windows, cpal's WASAPI backend supports loopback capture by calling
// build_input_stream on an *output* device. This taps whatever is currently
// playing through the speakers — i.e. the remote interviewer's voice.


#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_display_audio_stream() -> Result<u16, String> {
    use axum::{Router, extract::ws::{WebSocketUpgrade, WebSocket, Message}};
    use axum::extract::State;
    use tokio::sync::broadcast;
    use std::sync::Arc;

    // ── 3-state idempotency guard ─────────────────────────────────────────
    match DISPLAY_AUDIO_STATE.compare_exchange(
        AUDIO_STOPPED, AUDIO_STARTING, Ordering::SeqCst, Ordering::SeqCst,
    ) {
        Ok(_) => {}
        Err(AUDIO_STARTING) => return Err("display audio stream is already starting".into()),
        Err(_) => {
            let port = DISPLAY_AUDIO_PORT.load(Ordering::SeqCst);
            if port != 0 { return Ok(port); }
            return Err("display audio stream is running but port is not ready yet".into());
        }
    }

    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(128);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();

    // Startup handshake: the spawned thread signals Ok(sample_rate) once the
    // WASAPI stream is playing, or Err(...) if device init failed.
    // Without this, a hanging Realtek driver would block the Tauri IPC thread
    // indefinitely — matching the macOS SCKit init_rx pattern.
    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<Result<u32, String>>();

    // Bump generation so any previous zombie thread exits on its next 50 ms tick.
    let my_gen = DISPLAY_AUDIO_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    DISPLAY_AUDIO_RUNNING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

        // WASAPI loopback: use default OUTPUT device as an input source.
        // cpal's WASAPI backend enables loopback mode when build_input_stream
        // is called on a device from output_devices(). Device and config
        // enumeration happen here on the dedicated thread — not on the Tokio
        // async task — to avoid blocking the threadpool on slow HDD/driver init.
        let host = cpal::default_host();
        let device = match host.default_output_device() {
            Some(d) => d,
            None => {
                DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(
                    "No default output device found for WASAPI loopback capture.".into(),
                ));
                return;
            }
        };

        let config = match device.default_output_config() {
            Ok(c) => c,
            Err(e) => {
                DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!(
                    "WASAPI loopback: failed to get output device config: {e}"
                )));
                return;
            }
        };

        // Read these before config is consumed by .into() in the stream builder.
        let sample_rate = config.sample_rate().0;
        let ch_count = config.channels() as usize;

        let tx = tx_capture;
        let err_fn = |e| eprintln!("[wasapi loopback] stream error: {e}");

        let stream_result = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    if !DISPLAY_AUDIO_RUNNING.load(Ordering::Relaxed) { return; }
                    // Downmix multi-channel frames to mono: average each frame.
                    let pcm: Vec<u8> = data.chunks(ch_count).flat_map(|frame| {
                        let sum: f32 = frame.iter().copied().sum();
                        let mono = (sum / frame.len() as f32).clamp(-1.0, 1.0);
                        let v = (mono * i16::MAX as f32) as i16;
                        v.to_le_bytes()
                    }).collect();
                    let _ = tx.send(Arc::new(pcm));
                },
                err_fn, None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _| {
                    if !DISPLAY_AUDIO_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.chunks(ch_count).flat_map(|frame| {
                        let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                        let mono = (sum / frame.len() as i32)
                            .clamp(i16::MIN as i32, i16::MAX as i32) as i16;
                        mono.to_le_bytes()
                    }).collect();
                    let _ = tx.send(Arc::new(pcm));
                },
                err_fn, None,
            ),
            fmt => {
                DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!(
                    "WASAPI loopback: unsupported sample format {fmt:?}"
                )));
                return;
            }
        };

        match stream_result {
            Ok(stream) => {
                if let Err(e) = stream.play() {
                    DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                    let _ = init_tx.send(Err(format!(
                        "WASAPI loopback stream failed to start: {e}"
                    )));
                    return;
                }
                // Signal successful startup — the async caller is waiting on init_rx.
                let _ = init_tx.send(Ok(sample_rate));
                while DISPLAY_AUDIO_RUNNING.load(Ordering::Relaxed)
                    && DISPLAY_AUDIO_GENERATION.load(Ordering::Relaxed) == my_gen
                {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                // stream dropped here, ending capture
            }
            Err(e) => {
                DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!(
                    "WASAPI loopback: failed to build input stream: {e}"
                )));
            }
        }
    });

    // Wait up to 10 s for WASAPI to confirm it started — matching the macOS
    // SCKit timeout. On budget i3/i5 laptops with Realtek drivers, device init
    // can hang indefinitely without this guard.
    let sample_rate = match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        init_rx,
    )
    .await
    {
        Ok(Ok(Ok(sr))) => sr,
        Ok(Ok(Err(e))) => {
            DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
            DISPLAY_AUDIO_PORT.store(0, Ordering::SeqCst);
            DISPLAY_AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(e);
        }
        _ => {
            DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
            DISPLAY_AUDIO_PORT.store(0, Ordering::SeqCst);
            DISPLAY_AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(
                "WASAPI loopback capture timed out after 10 s — ensure a default \
                 audio output device is present and its driver is functioning."
                    .to_string(),
            );
        }
    };

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    DISPLAY_AUDIO_PORT.store(port, Ordering::SeqCst);
    DISPLAY_AUDIO_STATE.store(AUDIO_RUNNING_STATE, Ordering::SeqCst);

    // Always report channels=1 — the WASAPI callback downmixes to mono above.
    let meta = format!("{{\"sampleRate\":{sample_rate},\"channels\":1}}");
    let meta_bytes = Arc::new(meta.into_bytes());

    let router = Router::new().route("/", axum::routing::get(
        move |ws: WebSocketUpgrade, State(state): State<Arc<broadcast::Sender<Arc<Vec<u8>>>>>| {
            let meta_clone = meta_bytes.clone();
            async move {
                ws.on_upgrade(move |mut socket: WebSocket| async move {
                    let _ = socket.send(Message::Text(String::from_utf8_lossy(&meta_clone).into())).await;
                    let mut rx = state.subscribe();
                    loop {
                        match rx.recv().await {
                            Ok(pcm) => { if socket.send(Message::Binary((*pcm).clone())).await.is_err() { break; } }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(_) => break,
                        }
                    }
                })
            }
        }
    )).with_state(tx_arc);

    tokio::spawn(async move { let _ = axum::serve(listener, router).await; });
    Ok(port)
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn stop_display_audio_stream() {
    DISPLAY_AUDIO_GENERATION.fetch_add(1, Ordering::SeqCst);
    DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
    DISPLAY_AUDIO_PORT.store(0, Ordering::SeqCst);
    DISPLAY_AUDIO_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
}

// ── Linux stubs (audio capture not supported) ─────────────────────────────────
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn start_audio_stream(_device_name: Option<String>) -> Result<u16, String> {
    Err("Native audio capture is macOS/Windows-only".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
fn stop_audio_stream() {}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
fn list_audio_devices() -> Vec<String> { vec![] }

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn start_display_audio_stream() -> Result<u16, String> {
    Err("Display audio capture is macOS/Windows-only".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
fn stop_display_audio_stream() {}

// ── Parakeet-style Rust-native STT ───────────────────────────────────────────
// The mini overlay never touches raw audio or connects to Deepgram directly.
// Rust captures PCM, owns the Deepgram WS, and emits Tauri events:
//   "stt:system-audio"  → TranscriptPayload  (Interviewer — system audio)
//   "stt:mic"           → TranscriptPayload  (User — microphone)
//   "stt:status:system" → SttStatusPayload
//   "stt:status:mic"    → SttStatusPayload
//
// All Deepgram WebSocket plumbing lives in `crate::deepgram` — these commands
// are responsible only for OS-level audio capture and feeding PCM into a
// broadcast channel that `deepgram::run_session` consumes.

// Deepgram API key loaded from VITE_DEEPGRAM_API_KEY in .env at startup.
// Stored as managed state so commands never receive the key from the frontend.
struct DeepgramKey(String);

fn deepgram_key_fingerprint(key: &str) -> String {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return "empty".to_string();
    }
    let prefix: String = trimmed.chars().take(4).collect();
    let suffix: String = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<char>>()
        .into_iter()
        .rev()
        .collect();
    format!("len={} {}…{}", trimmed.len(), prefix, suffix)
}

fn load_runtime_env_deepgram_key() -> Option<String> {
    static RUNTIME_DEEPGRAM_KEY: OnceLock<Option<String>> = OnceLock::new();
    RUNTIME_DEEPGRAM_KEY
        .get_or_init(|| {
            // In `tauri dev`, cwd may be `src-tauri`; try both roots.
            let _ = dotenvy::from_filename(".env");
            let _ = dotenvy::from_filename("../.env");
            std::env::var("VITE_DEEPGRAM_API_KEY")
                .ok()
                .map(|k| k.trim().to_string())
                .filter(|k| !k.is_empty())
        })
        .clone()
}

fn resolve_deepgram_api_key(dg_key: &DeepgramKey, api_key: Option<String>) -> String {
    if let Some(from_invoke) = api_key
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
    {
        eprintln!(
            "[deepgram-key] source=invoke fingerprint={}",
            deepgram_key_fingerprint(&from_invoke)
        );
        return from_invoke;
    }

    if let Some(from_runtime_env) = load_runtime_env_deepgram_key() {
        eprintln!(
            "[deepgram-key] source=runtime_env fingerprint={}",
            deepgram_key_fingerprint(&from_runtime_env)
        );
        return from_runtime_env;
    }

    let from_managed = dg_key.0.trim().to_string();
    eprintln!(
        "[deepgram-key] source=managed_state fingerprint={}",
        deepgram_key_fingerprint(&from_managed)
    );
    from_managed
}

fn normalize_deepgram_keyterms(model: &str, keyterms: Option<Vec<String>>) -> Vec<String> {
    if !model.trim().starts_with("nova-3") {
        return Vec::new();
    }

    let mut out: Vec<String> = Vec::new();
    for term in keyterms.unwrap_or_default() {
        let cleaned = term.trim().to_lowercase();
        if cleaned.len() < 3 || cleaned.len() > 64 {
            continue;
        }
        if cleaned.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if !out.iter().any(|t| t == &cleaned) {
            out.push(cleaned);
        }
        if out.len() >= 20 {
            break;
        }
    }
    out
}

// ── macOS: SCKit system audio → Deepgram ─────────────────────────────────────
#[cfg(target_os = "macos")]
#[tauri::command]
async fn start_system_audio_transcription(
    app: tauri::AppHandle,
    dg_key: tauri::State<'_, DeepgramKey>,
    language: String,
    model: String,
    keyterms: Option<Vec<String>>,
    api_key: Option<String>,
) -> Result<(), String> {
    let api_key = resolve_deepgram_api_key(&dg_key, api_key);
    use screencapturekit::prelude::*;
    use tokio::sync::broadcast;

    // ── 3-state idempotency guard ─────────────────────────────────────────
    match SYSTEM_STT_STATE.compare_exchange(
        AUDIO_STOPPED, AUDIO_STARTING, Ordering::SeqCst, Ordering::SeqCst,
    ) {
        Ok(_) => {}
        Err(AUDIO_STARTING) => return Ok(()),
        Err(_) => return Ok(()),   // already running — idempotent
    }

    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let (pcm_tx, _) = broadcast::channel::<Arc<Vec<u8>>>(256);
    let tx_arc = Arc::new(pcm_tx);
    let tx_capture = tx_arc.clone();
    let my_gen = SYSTEM_STT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    SYSTEM_STT_RUNNING.store(true, Ordering::SeqCst);
    SYSTEM_DEEPGRAM_RUNNING.store(false, Ordering::SeqCst);
    SYSTEM_PCM_FRAMES_SENT.store(0, Ordering::SeqCst);
    SYSTEM_LAST_PCM_AT.store(0, Ordering::SeqCst);
    SYSTEM_EMPTY_FINAL_STREAK.store(0, Ordering::SeqCst);
    emit_system_health_event(&app, my_gen, "starting");
    #[cfg(debug_assertions)]
    eprintln!("[stt:system] systemCaptureStarted");

    // but PCM goes straight into the broadcast channel — no axum WS server.
    let app_capture = app.clone();
    std::thread::spawn(move || {
        let tx = tx_capture;
        let app_for_callback = app_capture.clone();
        let content = match SCShareableContent::get() {
            Ok(c) => c,
            Err(e) => {
                SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
                emit_system_health_event(&app_capture, my_gen, "error");
                let _ = init_tx.send(Err(format!(
                    "Screen Recording permission denied: {e:?}. \
                     Grant in System Settings → Privacy & Security → Screen Recording."
                )));
                return;
            }
        };
        let display = match content.displays().into_iter().next() {
            Some(d) => d,
            None => {
                SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
                emit_system_health_event(&app_capture, my_gen, "error");
                let _ = init_tx.send(Err("No display found for system audio.".into()));
                return;
            }
        };
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();
        let cfg = SCStreamConfiguration::new()
            .with_width(2).with_height(2)
            .with_captures_audio(true)
            .with_sample_rate(48000)
            .with_channel_count(2);
        let mut stream = SCStream::new(&filter, &cfg);
        stream.add_output_handler(
            move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
                match of_type { SCStreamOutputType::Audio => {} _ => return }
                let abl = match sample.audio_buffer_list() { Some(a) => a, None => return };
                let num_bufs = abl.num_buffers();
                if num_bufs == 0 { return; }
                let mut pcm: Vec<u8> = Vec::new();
                if num_bufs == 1 {
                    if let Some(buf) = abl.get(0) {
                        for frame in buf.data().chunks_exact(8) {
                            let l = f32::from_le_bytes([frame[0], frame[1], frame[2], frame[3]]);
                            let r = f32::from_le_bytes([frame[4], frame[5], frame[6], frame[7]]);
                            let v = (((l + r) * 0.5).clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                            pcm.extend_from_slice(&v.to_le_bytes());
                        }
                    }
                } else {
                    let n = abl.get(0).map(|b| b.data().len() / 4).unwrap_or(0);
                    for i in 0..n {
                        let mut sum = 0.0f32; let mut cnt = 0u32;
                        for b in 0..num_bufs {
                            if let Some(buf) = abl.get(b) {
                                let raw = buf.data(); let off = i * 4;
                                if off + 4 <= raw.len() {
                                    sum += f32::from_le_bytes([raw[off],raw[off+1],raw[off+2],raw[off+3]]);
                                    cnt += 1;
                                }
                            }
                        }
                        if cnt > 0 {
                            let v = ((sum / cnt as f32).clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                            pcm.extend_from_slice(&v.to_le_bytes());
                        }
                    }
                }
                if !pcm.is_empty() {
                    let prev = SYSTEM_PCM_FRAMES_SENT.fetch_add(1, Ordering::SeqCst);
                    SYSTEM_LAST_PCM_AT.store(now_epoch_millis_u64(), Ordering::SeqCst);
                    if prev == 0 {
                        #[cfg(debug_assertions)]
                        eprintln!("[stt:system] systemFirstPcmFrame");
                        emit_system_health_event(&app_for_callback, my_gen, "capturing");
                    } else if prev % 50 == 0 {
                        emit_system_health_event(&app_for_callback, my_gen, "capturing");
                    }
                    let _ = tx.send(Arc::new(pcm));
                }
            },
            SCStreamOutputType::Audio,
        );
        if let Err(e) = stream.start_capture() {
            SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
            emit_system_health_event(&app_capture, my_gen, "error");
            let _ = init_tx.send(Err(format!(
                "System audio capture failed: {e:?}. Check Screen Recording permission."
            )));
            return;
        }
        emit_system_health_event(&app_capture, my_gen, "capturing");
        let _ = init_tx.send(Ok(()));
        while SYSTEM_STT_RUNNING.load(Ordering::Relaxed)
            && SYSTEM_STT_GENERATION.load(Ordering::Relaxed) == my_gen
        {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let _ = stream.stop_capture();
        #[cfg(debug_assertions)]
        eprintln!("[stt:system] systemCaptureThreadExited");
        emit_system_health_event(&app_capture, my_gen, "stopped");
    });

    match tokio::time::timeout(std::time::Duration::from_secs(10), init_rx).await {
        Ok(Ok(Ok(()))) => {
            SYSTEM_STT_STATE.store(AUDIO_RUNNING_STATE, Ordering::SeqCst);
            emit_system_health_event(&app, my_gen, "capturing");
        }
        Ok(Ok(Err(e))) => {
            eprintln!("[stt:system macos] SCKit init FAILED: {e}");
            SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
            SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            emit_system_health_event(&app, my_gen, "error");
            return Err(e);
        }
        _ => {
            let msg = "System audio capture timed out — check Screen Recording permission.".to_string();
            eprintln!("[stt:system macos] SCKit init TIMEOUT");
            SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
            SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            emit_system_health_event(&app, my_gen, "error");
            return Err(msg);
        }
    }
    let app_watchdog = app.clone();
    tokio::spawn(async move {
        loop {
            if !SYSTEM_STT_RUNNING.load(Ordering::SeqCst)
                || SYSTEM_STT_GENERATION.load(Ordering::SeqCst) != my_gen
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let last_pcm = SYSTEM_LAST_PCM_AT.load(Ordering::SeqCst);
            if last_pcm == 0 {
                continue;
            }
            let now = now_epoch_millis_u64();
            if now.saturating_sub(last_pcm) > 10_000 {
                emit_system_health_event(&app_watchdog, my_gen, "starved");
            }
        }
    });
    let deepgram_keyterms = normalize_deepgram_keyterms(&model, keyterms);
    let app_c = app.clone();
    tokio::spawn(async move {
        let pcm_rx = tx_arc.subscribe();
        deepgram::run_session(
            app_c,
            DeepgramConfig {
                api_key,
                model,
                language,
                sample_rate: 48000,
                channels: 1,
                keyterms: deepgram_keyterms,
                endpointing_ms: Some(500),
                utterance_end_ms: Some(1000),
                tag: "scribeshade-rust",
            },
            SttChannel::System,
            pcm_rx,
            &SYSTEM_STT_RUNNING,
            &SYSTEM_STT_GENERATION,
            my_gen,
            Some(SystemHealthAtoms {
                capture_running: &SYSTEM_STT_RUNNING,
                deepgram_running: &SYSTEM_DEEPGRAM_RUNNING,
                pcm_frames_sent: &SYSTEM_PCM_FRAMES_SENT,
                last_pcm_at: &SYSTEM_LAST_PCM_AT,
                empty_final_streak: &SYSTEM_EMPTY_FINAL_STREAK,
            }),
        )
        .await;
        if SYSTEM_STT_GENERATION.load(Ordering::SeqCst) == my_gen {
            SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        }
    });

    Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn stop_system_audio_transcription() {
    SYSTEM_STT_GENERATION.fetch_add(1, Ordering::SeqCst);
    SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
    SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
    SYSTEM_DEEPGRAM_RUNNING.store(false, Ordering::SeqCst);
    SYSTEM_EMPTY_FINAL_STREAK.store(0, Ordering::SeqCst);
}

// ── macOS: cpal mic → Deepgram ────────────────────────────────────────────────
#[cfg(target_os = "macos")]
#[tauri::command]
async fn start_mic_transcription(
    app: tauri::AppHandle,
    dg_key: tauri::State<'_, DeepgramKey>,
    language: String,
    model: String,
    keyterms: Option<Vec<String>>,
    api_key: Option<String>,
) -> Result<(), String> {
    let api_key = resolve_deepgram_api_key(&dg_key, api_key);
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use tokio::sync::broadcast;

    // ── 3-state idempotency guard ─────────────────────────────────────────
    match MIC_STT_STATE.compare_exchange(
        AUDIO_STOPPED, AUDIO_STARTING, Ordering::SeqCst, Ordering::SeqCst,
    ) {
        Ok(_) => {}
        Err(AUDIO_STARTING) => return Ok(()),
        Err(_) => return Ok(()),   // already running — idempotent
    }

    let host = cpal::default_host();
    let device = host.default_input_device().ok_or_else(|| {
        MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        "No microphone found".to_string()
    })?;
    let config = device.default_input_config().map_err(|e| {
        MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        e.to_string()
    })?;
    let sample_rate = config.sample_rate().0;
    let ch = config.channels() as usize;

    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(256);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();
    let my_gen = MIC_STT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    MIC_STT_RUNNING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let tx = tx_capture;
        let err_fn = |e| eprintln!("[mic-stt] cpal error: {e}");
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    if !MIC_STT_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.chunks(ch).flat_map(|frame| {
                        let sum: f32 = frame.iter().copied().sum();
                        let mono = (sum / frame.len() as f32).clamp(-1.0, 1.0);
                        let v = (mono * i16::MAX as f32) as i16;
                        v.to_le_bytes()
                    }).collect();
                    let _ = tx.send(Arc::new(pcm));
                }, err_fn, None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _| {
                    if !MIC_STT_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.chunks(ch).flat_map(|frame| {
                        let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                        let mono = (sum / frame.len() as i32)
                            .clamp(i16::MIN as i32, i16::MAX as i32) as i16;
                        mono.to_le_bytes()
                    }).collect();
                    let _ = tx.send(Arc::new(pcm));
                }, err_fn, None,
            ),
            _ => {
                MIC_STT_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err("Unsupported sample format".into()));
                return;
            }
        };
        match stream {
            Ok(s) => {
                if let Err(e) = s.play() {
                    MIC_STT_RUNNING.store(false, Ordering::SeqCst);
                    let _ = init_tx.send(Err(format!("Failed to start mic stream: {e}")));
                    return;
                }
                let _ = init_tx.send(Ok(()));
                while MIC_STT_RUNNING.load(Ordering::Relaxed)
                    && MIC_STT_GENERATION.load(Ordering::Relaxed) == my_gen
                {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            }
            Err(e) => {
                MIC_STT_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!("Failed to open mic device: {e}")));
            }
        }
    });

    match tokio::time::timeout(std::time::Duration::from_secs(8), init_rx).await {
        Ok(Ok(Ok(()))) => { MIC_STT_STATE.store(AUDIO_RUNNING_STATE, Ordering::SeqCst); }
        Ok(Ok(Err(e))) => {
            MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(e);
        }
        _ => {
            MIC_STT_RUNNING.store(false, Ordering::SeqCst);
            MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err("Mic STT stream timed out".into());
        }
    }

    let deepgram_keyterms = normalize_deepgram_keyterms(&model, keyterms);
    let app_c = app.clone();
    tokio::spawn(async move {
        let pcm_rx = tx_arc.subscribe();
        deepgram::run_session(
            app_c,
            DeepgramConfig {
                api_key,
                model,
                language,
                sample_rate,
                channels: 1,
                keyterms: deepgram_keyterms,
                endpointing_ms: None,
                utterance_end_ms: None,
                tag: "scribeshade-mic",
            },
            SttChannel::Mic,
            pcm_rx,
            &MIC_STT_RUNNING,
            &MIC_STT_GENERATION,
            my_gen,
            None,
        )
        .await;
        if MIC_STT_GENERATION.load(Ordering::SeqCst) == my_gen {
            MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        }
    });

    Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn stop_mic_transcription() {
    MIC_STT_GENERATION.fetch_add(1, Ordering::SeqCst);
    MIC_STT_RUNNING.store(false, Ordering::SeqCst);
    MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
}

// ── Windows: WASAPI loopback → Deepgram (system audio) ───────────────────────
#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_system_audio_transcription(
    app: tauri::AppHandle,
    dg_key: tauri::State<'_, DeepgramKey>,
    language: String,
    model: String,
    keyterms: Option<Vec<String>>,
    api_key: Option<String>,
) -> Result<(), String> {
    let api_key = resolve_deepgram_api_key(&dg_key, api_key);
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use tokio::sync::broadcast;

    // ── 3-state idempotency guard ─────────────────────────────────────────
    match SYSTEM_STT_STATE.compare_exchange(
        AUDIO_STOPPED, AUDIO_STARTING, Ordering::SeqCst, Ordering::SeqCst,
    ) {
        Ok(_) => {}
        Err(AUDIO_STARTING) => return Ok(()),
        Err(_) => return Ok(()),
    }

    let host = cpal::default_host();
    let device = host.default_output_device().ok_or_else(|| {
        SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        "No output device for loopback".to_string()
    })?;
    let config = device.default_output_config().map_err(|e| {
        SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        e.to_string()
    })?;
    let sample_rate = config.sample_rate().0;
    let ch = config.channels() as usize;

    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(128);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();
    let my_gen = SYSTEM_STT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    SYSTEM_STT_RUNNING.store(true, Ordering::SeqCst);
    SYSTEM_DEEPGRAM_RUNNING.store(false, Ordering::SeqCst);
    SYSTEM_PCM_FRAMES_SENT.store(0, Ordering::SeqCst);
    SYSTEM_LAST_PCM_AT.store(0, Ordering::SeqCst);
    SYSTEM_EMPTY_FINAL_STREAK.store(0, Ordering::SeqCst);
    emit_system_health_event(&app, my_gen, "starting");
    #[cfg(debug_assertions)]
    eprintln!("[stt:system] systemCaptureStarted");

    let app_capture = app.clone();
    std::thread::spawn(move || {
        let tx = tx_capture;
        let app_for_callback = app_capture.clone();
        let err_fn = |e| eprintln!("[wasapi-stt] stream error: {e}");
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    if !SYSTEM_STT_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.chunks(ch).flat_map(|frame| {
                        let sum: f32 = frame.iter().copied().sum();
                        let mono = (sum / frame.len() as f32).clamp(-1.0, 1.0);
                        let v = (mono * i16::MAX as f32) as i16;
                        v.to_le_bytes()
                    }).collect();
                    let has_pcm = !pcm.is_empty();
                    let _ = tx.send(Arc::new(pcm));
                    if has_pcm {
                        let prev = SYSTEM_PCM_FRAMES_SENT.fetch_add(1, Ordering::SeqCst);
                        SYSTEM_LAST_PCM_AT.store(now_epoch_millis_u64(), Ordering::SeqCst);
                        if prev == 0 {
                            #[cfg(debug_assertions)]
                            eprintln!("[stt:system] systemFirstPcmFrame");
                            emit_system_health_event(&app_for_callback, my_gen, "capturing");
                        } else if prev % 50 == 0 {
                            emit_system_health_event(&app_for_callback, my_gen, "capturing");
                        }
                    }
                }, err_fn, None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _| {
                    if !SYSTEM_STT_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.chunks(ch).flat_map(|frame| {
                        let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                        let mono = (sum / frame.len() as i32)
                            .clamp(i16::MIN as i32, i16::MAX as i32) as i16;
                        mono.to_le_bytes()
                    }).collect();
                    let has_pcm = !pcm.is_empty();
                    let _ = tx.send(Arc::new(pcm));
                    if has_pcm {
                        let prev = SYSTEM_PCM_FRAMES_SENT.fetch_add(1, Ordering::SeqCst);
                        SYSTEM_LAST_PCM_AT.store(now_epoch_millis_u64(), Ordering::SeqCst);
                        if prev == 0 {
                            #[cfg(debug_assertions)]
                            eprintln!("[stt:system] systemFirstPcmFrame");
                            emit_system_health_event(&app_for_callback, my_gen, "capturing");
                        } else if prev % 50 == 0 {
                            emit_system_health_event(&app_for_callback, my_gen, "capturing");
                        }
                    }
                }, err_fn, None,
            ),
            _ => {
                SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
                emit_system_health_event(&app_capture, my_gen, "error");
                let _ = init_tx.send(Err("Unsupported sample format".into()));
                return;
            }
        };
        match stream {
            Ok(s) => {
                if let Err(e) = s.play() {
                    SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
                    emit_system_health_event(&app_capture, my_gen, "error");
                    let _ = init_tx.send(Err(format!("Failed to start system audio stream: {e}")));
                    return;
                }
                emit_system_health_event(&app_capture, my_gen, "capturing");
                let _ = init_tx.send(Ok(()));
                while SYSTEM_STT_RUNNING.load(Ordering::Relaxed)
                    && SYSTEM_STT_GENERATION.load(Ordering::Relaxed) == my_gen
                {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                #[cfg(debug_assertions)]
                eprintln!("[stt:system] systemCaptureThreadExited");
                emit_system_health_event(&app_capture, my_gen, "stopped");
            }
            Err(e) => {
                SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
                emit_system_health_event(&app_capture, my_gen, "error");
                let _ = init_tx.send(Err(format!("Failed to open loopback device: {e}")));
            }
        }
    });

    match tokio::time::timeout(std::time::Duration::from_secs(8), init_rx).await {
        Ok(Ok(Ok(()))) => {
            SYSTEM_STT_STATE.store(AUDIO_RUNNING_STATE, Ordering::SeqCst);
            emit_system_health_event(&app, my_gen, "capturing");
        }
        Ok(Ok(Err(e))) => {
            SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            emit_system_health_event(&app, my_gen, "error");
            return Err(e);
        }
        _ => {
            SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
            SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            emit_system_health_event(&app, my_gen, "error");
            return Err("System audio STT stream timed out".into());
        }
    }
    let app_watchdog = app.clone();
    tokio::spawn(async move {
        loop {
            if !SYSTEM_STT_RUNNING.load(Ordering::SeqCst)
                || SYSTEM_STT_GENERATION.load(Ordering::SeqCst) != my_gen
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let last_pcm = SYSTEM_LAST_PCM_AT.load(Ordering::SeqCst);
            if last_pcm == 0 {
                continue;
            }
            let now = now_epoch_millis_u64();
            if now.saturating_sub(last_pcm) > 10_000 {
                emit_system_health_event(&app_watchdog, my_gen, "starved");
            }
        }
    });

    let deepgram_keyterms = normalize_deepgram_keyterms(&model, keyterms);
    let app_c = app.clone();
    tokio::spawn(async move {
        let pcm_rx = tx_arc.subscribe();
        deepgram::run_session(
            app_c,
            DeepgramConfig {
                api_key,
                model,
                language,
                sample_rate,
                channels: 1,
                keyterms: deepgram_keyterms,
                endpointing_ms: Some(500),
                utterance_end_ms: Some(1000),
                tag: "scribeshade-rust",
            },
            SttChannel::System,
            pcm_rx,
            &SYSTEM_STT_RUNNING,
            &SYSTEM_STT_GENERATION,
            my_gen,
            Some(SystemHealthAtoms {
                capture_running: &SYSTEM_STT_RUNNING,
                deepgram_running: &SYSTEM_DEEPGRAM_RUNNING,
                pcm_frames_sent: &SYSTEM_PCM_FRAMES_SENT,
                last_pcm_at: &SYSTEM_LAST_PCM_AT,
                empty_final_streak: &SYSTEM_EMPTY_FINAL_STREAK,
            }),
        )
        .await;
        if SYSTEM_STT_GENERATION.load(Ordering::SeqCst) == my_gen {
            SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        }
    });

    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn stop_system_audio_transcription() {
    SYSTEM_STT_GENERATION.fetch_add(1, Ordering::SeqCst);
    SYSTEM_STT_RUNNING.store(false, Ordering::SeqCst);
    SYSTEM_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
    SYSTEM_DEEPGRAM_RUNNING.store(false, Ordering::SeqCst);
    SYSTEM_EMPTY_FINAL_STREAK.store(0, Ordering::SeqCst);
}

// ── Windows: cpal mic input → Deepgram ───────────────────────────────────────
#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_mic_transcription(
    app: tauri::AppHandle,
    dg_key: tauri::State<'_, DeepgramKey>,
    language: String,
    model: String,
    keyterms: Option<Vec<String>>,
    api_key: Option<String>,
) -> Result<(), String> {
    let api_key = resolve_deepgram_api_key(&dg_key, api_key);
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use tokio::sync::broadcast;

    // ── 3-state idempotency guard ─────────────────────────────────────────
    match MIC_STT_STATE.compare_exchange(
        AUDIO_STOPPED, AUDIO_STARTING, Ordering::SeqCst, Ordering::SeqCst,
    ) {
        Ok(_) => {}
        Err(AUDIO_STARTING) => return Ok(()),
        Err(_) => return Ok(()),
    }

    let host = cpal::default_host();
    let device = host.default_input_device().ok_or_else(|| {
        MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        "No microphone found".to_string()
    })?;
    let config = device.default_input_config().map_err(|e| {
        MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        e.to_string()
    })?;
    let sample_rate = config.sample_rate().0;
    let ch = config.channels() as usize;

    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(256);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();
    let my_gen = MIC_STT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    MIC_STT_RUNNING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let tx = tx_capture;
        let err_fn = |e| eprintln!("[mic-stt-win] cpal error: {e}");
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    if !MIC_STT_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.chunks(ch).flat_map(|frame| {
                        let sum: f32 = frame.iter().copied().sum();
                        let mono = (sum / frame.len() as f32).clamp(-1.0, 1.0);
                        let v = (mono * i16::MAX as f32) as i16;
                        v.to_le_bytes()
                    }).collect();
                    let _ = tx.send(Arc::new(pcm));
                }, err_fn, None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _| {
                    if !MIC_STT_RUNNING.load(Ordering::Relaxed) { return; }
                    let pcm: Vec<u8> = data.chunks(ch).flat_map(|frame| {
                        let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                        let mono = (sum / frame.len() as i32)
                            .clamp(i16::MIN as i32, i16::MAX as i32) as i16;
                        mono.to_le_bytes()
                    }).collect();
                    let _ = tx.send(Arc::new(pcm));
                }, err_fn, None,
            ),
            _ => {
                MIC_STT_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err("Unsupported sample format".into()));
                return;
            }
        };
        match stream {
            Ok(s) => {
                if let Err(e) = s.play() {
                    MIC_STT_RUNNING.store(false, Ordering::SeqCst);
                    let _ = init_tx.send(Err(format!("Failed to start mic stream: {e}")));
                    return;
                }
                let _ = init_tx.send(Ok(()));
                while MIC_STT_RUNNING.load(Ordering::Relaxed)
                    && MIC_STT_GENERATION.load(Ordering::Relaxed) == my_gen
                {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            }
            Err(e) => {
                MIC_STT_RUNNING.store(false, Ordering::SeqCst);
                let _ = init_tx.send(Err(format!("Failed to open mic device: {e}")));
            }
        }
    });

    match tokio::time::timeout(std::time::Duration::from_secs(8), init_rx).await {
        Ok(Ok(Ok(()))) => { MIC_STT_STATE.store(AUDIO_RUNNING_STATE, Ordering::SeqCst); }
        Ok(Ok(Err(e))) => {
            MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err(e);
        }
        _ => {
            MIC_STT_RUNNING.store(false, Ordering::SeqCst);
            MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
            return Err("Mic STT stream timed out".into());
        }
    }

    let deepgram_keyterms = normalize_deepgram_keyterms(&model, keyterms);
    let app_c = app.clone();
    tokio::spawn(async move {
        let pcm_rx = tx_arc.subscribe();
        deepgram::run_session(
            app_c,
            DeepgramConfig {
                api_key,
                model,
                language,
                sample_rate,
                channels: 1,
                keyterms: deepgram_keyterms,
                endpointing_ms: None,
                utterance_end_ms: None,
                tag: "scribeshade-mic",
            },
            SttChannel::Mic,
            pcm_rx,
            &MIC_STT_RUNNING,
            &MIC_STT_GENERATION,
            my_gen,
            None,
        )
        .await;
        if MIC_STT_GENERATION.load(Ordering::SeqCst) == my_gen {
            MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
        }
    });

    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn stop_mic_transcription() {
    MIC_STT_GENERATION.fetch_add(1, Ordering::SeqCst);
    MIC_STT_RUNNING.store(false, Ordering::SeqCst);
    MIC_STT_STATE.store(AUDIO_STOPPED, Ordering::SeqCst);
}

// ── Linux stubs for new STT commands ─────────────────────────────────────────
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn start_system_audio_transcription(
    _app: tauri::AppHandle,
    _dg_key: tauri::State<'_, DeepgramKey>,
    _language: String,
    _model: String,
    _keyterms: Option<Vec<String>>,
    _api_key: Option<String>,
) -> Result<(), String> { Err("STT is macOS/Windows-only".into()) }

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
fn stop_system_audio_transcription() {}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn start_mic_transcription(
    _app: tauri::AppHandle,
    _dg_key: tauri::State<'_, DeepgramKey>,
    _language: String,
    _model: String,
    _keyterms: Option<Vec<String>>,
    _api_key: Option<String>,
) -> Result<(), String> { Err("STT is macOS/Windows-only".into()) }

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
fn stop_mic_transcription() {}

// ── OS-level permission settings deep-links ──────────────────────────────────
// Lazy permission flow: when system audio / mic capture fails because the user
// denied the OS permission, the JS layer surfaces a "Open Settings" button that
// invokes one of these commands to deep-link to the right Privacy pane.

// ── Microphone permission preflight ──────────────────────────────────────────
// Call this ONCE before start_audio_stream.  Returns Ok(()) if the mic is
// accessible, Err with a human-readable message if not.
// Separating permission-check from stream-start means the app never calls
// start_audio_stream until permission is confirmed, eliminating the pattern
// that triggers repeated macOS TCC dialogs.
#[tauri::command]
async fn ensure_microphone_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use cpal::traits::{DeviceTrait, HostTrait};
        let host = cpal::default_host();
        match host.default_input_device() {
            Some(device) => {
                // Attempt to open a config — this is what triggers the macOS
                // TCC mic dialog on first access.  If the user already granted
                // permission the call returns instantly.
                device.default_input_config()
                    .map(|_| ())
                    .map_err(|e| format!(
                        "Microphone permission denied or device unavailable: {e}. \
                         Grant access in System Settings → Privacy & Security → Microphone."
                    ))
            }
            None => Err(
                "No microphone found. Connect a mic and check System Settings → Sound → Input."
                    .into(),
            ),
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Windows: permission is always granted. Probe the device as a basic sanity check.
        use cpal::traits::{DeviceTrait, HostTrait};
        let host = cpal::default_host();
        host.default_input_device()
            .ok_or_else(|| "No default input device found".to_string())
            .and_then(|d| d.default_input_config().map(|_| ()).map_err(|e| e.to_string()))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // Linux: managed by the DE, skip device probe for now
        Ok(())
    }
}

#[tauri::command]
fn get_macos_app_identity(app: tauri::AppHandle) -> Result<MacOsAppIdentity, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(current_macos_identity(&app))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("Not supported on this OS".into())
    }
}

#[tauri::command]
async fn check_microphone_permission(_app: tauri::AppHandle) -> Result<PermissionStatusPayload, String> {
    #[cfg(target_os = "macos")]
    {
        use cpal::traits::{DeviceTrait, HostTrait};
        let host = cpal::default_host();
        let status = match host.default_input_device() {
            Some(device) => match device.default_input_config() {
                Ok(_) => "granted",
                Err(_) => "denied",
            },
            None => "unknown",
        };
        Ok(PermissionStatusPayload {
            status: status.to_string(),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(PermissionStatusPayload {
            status: "granted".to_string(),
        })
    }
}

#[tauri::command]
async fn request_microphone_permission(app: tauri::AppHandle) -> Result<PermissionStatusPayload, String> {
    let _ = ensure_microphone_permission().await;
    check_microphone_permission(app).await
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGRequestScreenCaptureAccess() -> bool;
    fn CGPreflightScreenCaptureAccess() -> bool;
}

#[tauri::command]
fn check_screen_recording_permission(_app: tauri::AppHandle) -> Result<PermissionStatusPayload, String> {
    #[cfg(target_os = "macos")]
    {
        let granted = unsafe { CGPreflightScreenCaptureAccess() };
        let status = if granted { "granted" } else { "denied" };
        Ok(PermissionStatusPayload {
            status: status.to_string(),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(PermissionStatusPayload {
            status: "granted".to_string(),
        })
    }
}

#[tauri::command]
fn request_screen_recording_permission(_app: tauri::AppHandle) -> Result<PermissionStatusPayload, String> {
    #[cfg(target_os = "macos")]
    {
        let granted_before = unsafe { CGPreflightScreenCaptureAccess() };
        if granted_before {
            return Ok(PermissionStatusPayload {
                status: "granted".to_string(),
            });
        }
        let granted_now = unsafe { CGRequestScreenCaptureAccess() };
        let status = if granted_now {
            "granted"
        } else {
            // Common macOS behavior: user enables from Settings but app restart needed.
            "restart_required"
        };
        Ok(PermissionStatusPayload {
            status: status.to_string(),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(PermissionStatusPayload {
            status: "granted".to_string(),
        })
    }
}

#[tauri::command]
fn open_macos_privacy_settings(
    app: tauri::AppHandle,
    permission_type: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let url = match permission_type.as_str() {
            "microphone" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            }
            "screen_recording" | "screen-recording" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
            _ => return Err("Unsupported permissionType".into()),
        };
        app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = permission_type;
        Err("Not supported on this OS".into())
    }
}

#[tauri::command]
fn set_macos_activation_policy(mode: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        let app_cls = objc2::class!(NSApplication);
        let ns_app: *mut objc2::runtime::AnyObject = objc2::msg_send![app_cls, sharedApplication];
        let policy: i64 = match mode.as_str() {
            "regular" => 0,
            "accessory" => 1,
            _ => return Err("Unsupported activation policy mode".into()),
        };
        let ok: bool = objc2::msg_send![ns_app, setActivationPolicy: policy];
        eprintln!("[audio-lifecycle] macDockPolicyApplied activationPolicy={mode} ok={ok}");
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = mode;
        Ok(())
    }
}

#[tauri::command]
fn open_screen_recording_settings(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let url = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
        app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        // Windows has no system-audio permission; loopback works without consent.
        // Open the Sound mixer so the user can verify the default output device.
        let _ = app;
        std::process::Command::new("cmd")
            .args(["/C", "start", "ms-settings:sound"])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        Err("Not supported on this OS".into())
    }
}

#[tauri::command]
fn open_microphone_settings(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
        app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        std::process::Command::new("cmd")
            .args(["/C", "start", "ms-settings:privacy-microphone"])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        Err("Not supported on this OS".into())
    }
}

#[command]
fn set_session_active(app: AppHandle, active: bool) {
    #[cfg(debug_assertions)]
    println!("[Session][Native] set_session_active start active={active}");
    SESSION_ACTIVE.store(active, Ordering::SeqCst);
    if active {
        let _ = apply_overlay_policy_for_label(&app, "mini", OverlayMode::FullscreenOverlay);
    } else {
        let _ = apply_overlay_policy_for_label(&app, "launcher", OverlayMode::FullscreenOverlay);
    }
    if !active {
        stop_all_audio_transcription();
    }
    #[cfg(debug_assertions)]
    println!("[Session][Native] set_session_active complete active={active}");
}

#[tauri::command]
fn stop_all_audio_transcription() {
    #[cfg(debug_assertions)]
    println!("[Session][Native] stop_all_audio_transcription start");
    stop_mic_transcription();
    stop_system_audio_transcription();
    stop_display_audio_stream();
    stop_audio_stream();
    #[cfg(debug_assertions)]
    println!("[Session][Native] stop_all_audio_transcription complete");
}

/// Toggle content protection (screen-capture block) at runtime across all
/// windows without requiring a restart.
///
/// Private Mode ON  (protected = true):  window disappears from screenshots,
///   screen-share, and screen-recording on macOS and Windows.
/// Private Mode OFF (protected = false): normal shareable window.
///
/// Called from the frontend when the user toggles the Private switch.
/// Also updates CONTENT_PROTECTED so capture_screen knows whether a
/// temporary flip is needed before taking a screenshot.
#[command]
async fn toggle_content_protection(app: AppHandle, protected: bool) -> Result<(), String> {
    // Persist the user's intent so capture_screen can read it atomically.
    CONTENT_PROTECTED.store(protected, Ordering::SeqCst);

    for label in ["launcher", "mini", "main"] {
        if let Some(win) = app.get_webview_window(label) {
            win.set_content_protected(protected)
                .map_err(|e| format!("set_content_protected({label}): {e}"))?;
        }
    }
    Ok(())
}

#[command]
fn handle_launcher_click(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    println!(
        "[Session][Native] handle_launcher_click start session_active={}",
        SESSION_ACTIVE.load(Ordering::SeqCst)
    );
    if SESSION_ACTIVE.load(Ordering::SeqCst) {
        let _ = apply_overlay_policy_for_label(&app, "mini", OverlayMode::FullscreenOverlay);
        if let Some(mini) = app.get_webview_window("mini") {
            #[cfg(target_os = "macos")]
            {
                let _ = apply_macos_overlay_policy(&mini, true);
                set_overlay_passthrough(&mini);
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = mini.show();
                let _ = mini.unminimize();
                let _ = mini.set_focus();
                set_overlay_passthrough(&mini);
            }
        }
    } else {
        let _ = apply_overlay_policy_for_label(&app, "launcher", OverlayMode::FullscreenOverlay);
        if let Some(launcher) = app.get_webview_window("launcher") {
            #[cfg(target_os = "macos")]
            {
                let _ = apply_macos_overlay_policy(&launcher, true);
                set_overlay_passthrough(&launcher);
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = launcher.show();
                let _ = launcher.set_focus();
                set_overlay_passthrough(&launcher);
            }
        }
    }
    #[cfg(debug_assertions)]
    println!("[Session][Native] handle_launcher_click complete");
    Ok(())
}

/// Show (or create) the full dashboard window and navigate it directly to the
/// requested route with conditions encoded as URL query params.
///
/// The frontend reads `?openCreate=true&isFree=true` via `useSearchParams` —
/// no separate Tauri event is needed, and there is no race condition between
/// window creation and event delivery.
///
/// Called from the widget for: Start Session, Buy Credits, Past Sessions, Sign In.
/// The dashboard window is NOT opened for any other widget interaction.
#[tauri::command]
async fn open_main_dashboard(
    app: AppHandle,
    route: Option<String>,
    show_create: Option<bool>,
    is_free: Option<bool>,
    // When `false`: create/navigate the window without showing it — used as a
    // hidden background session-processor (e.g. event bus for the mini overlay).
    visible: Option<bool>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let _ = set_macos_activation_policy("regular".to_string());
    // ── 1. Create the main window lazily — only when the user explicitly needs it ──
    let is_new_window = app.get_webview_window("main").is_none();

    let main_win = if let Some(win) = app.get_webview_window("main") {
        win
    } else {
        let nav_handle = app.clone();
        
        let mut path = route.clone().unwrap_or_else(|| "/dashboard".to_string());
        let mut query = Vec::new();
        if show_create.unwrap_or(false) { query.push("openCreate=true"); }
        if is_free.unwrap_or(false) { query.push("isFree=true"); }
        if !query.is_empty() {
            path.push('?');
            path.push_str(&query.join("&"));
        }
        
        let url = WebviewUrl::App(path.into());

        WebviewWindowBuilder::new(&app, "main", url)
            .title("ScribeShade")
            .decorations(false)
            .inner_size(1200.0, 800.0)
            .center()
            .resizable(false)
            .maximized(true)
            .always_on_top(false)
            .visible_on_all_workspaces(false)
            .skip_taskbar(false)
            .content_protected(false)
            .on_navigation(move |url| {
                let scheme = url.scheme();
                let host = url.host_str().unwrap_or("");
                // Allow internal app URLs in both dev and production.
                if scheme == "tauri"
                    || host == "localhost"
                    || host == "tauri.localhost"
                    || host == "127.0.0.1"
                {
                    return true;
                }
                // Allow Razorpay payment gateway pages to open inside the window.
                if host.ends_with("razorpay.com") || host.ends_with("razorpay.in") {
                    return true;
                }
                // All other external URLs open in the system browser.
                let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                false
            })
            .build()
            .map_err(|e| e.to_string())?
    };

    // Ensure decorations are always off, even if the window was reused from a
    // previous call that predates this setting being added to the builder.
    main_win.set_decorations(false).map_err(|e| e.to_string())?;

    let _ = is_new_window;

    // Only show/focus when caller wants the window to be visible (default true).
    // Passing `visible: false` creates or navigates the window as a hidden
    // background processor (e.g. session event bus for the mini overlay).
    if visible.unwrap_or(true) {
        main_win.show().map_err(|e| e.to_string())?;
        main_win.unminimize().map_err(|e| e.to_string())?;
        let _ = main_win.set_always_on_top(false);
        main_win.set_focus().map_err(|e| e.to_string())?;
    }

    // ── 2. Navigate to the target route with conditions as URL query params ──
    // For EXISTING windows: a full webview navigation to the new URL.
    if !is_new_window && (route.is_some() || show_create.unwrap_or(false)) {
        let current = main_win.url().map_err(|e| e.to_string())?;

        // Extract origin: scheme://host[:port]
        let scheme = current.scheme();
        let host = current.host_str().unwrap_or("localhost");
        let mut origin = format!("{}://{}", scheme, host);
        if let Some(port) = current.port() {
            origin = format!("{}:{}", origin, port);
        }

        let route_path = route.as_deref().unwrap_or("/dashboard");

        // Build the full URL: origin + /route?params
        let raw = format!("{}{}", origin, route_path);
        let mut nav_url = NavUrl::parse(&raw).map_err(|e| e.to_string())?;

        // Append condition params so the frontend knows what action to trigger.
        {
            let mut qp = nav_url.query_pairs_mut();
            if show_create.unwrap_or(false) {
                qp.append_pair("openCreate", "true");
            }
            if is_free.unwrap_or(false) {
                qp.append_pair("isFree", "true");
            }
        }

        main_win.navigate(nav_url).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Position and show the launcher widget with proper OS-level floating settings.
/// Mirrors the logic in `show_mini_top_center` but targets the "launcher" window.
///
/// SAFETY NOTE: This function calls objc2::msg_send! (NSWindow APIs on macOS)
/// which must run on the main thread. It is called directly from setup() which
/// runs on the main thread. The macOS block uses run_on_main_thread as a safety
/// net in case it is ever called from a tokio worker via invoke.
#[tauri::command]
fn show_launcher_widget(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let _ = set_macos_activation_policy("accessory".to_string());
    let window = app
        .get_webview_window("launcher")
        .ok_or("launcher window not found")?;

    let monitor = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no primary monitor")?;

    let screen = monitor.size();
    let mon_pos = monitor.position();

    // Expand launcher to fill the entire primary monitor so that the React
    // overlay can position the card anywhere on screen without OS-level clipping.
    window
        .set_size(PhysicalSize::new(screen.width, screen.height))
        .map_err(|e| e.to_string())?;

    window
        .set_position(PhysicalPosition { x: mon_pos.x, y: mon_pos.y })
        .map_err(|e| e.to_string())?;
    window.set_minimizable(false).map_err(|e| e.to_string())?;
    window.set_maximizable(false).map_err(|e| e.to_string())?;
    apply_overlay_policy_to_window(&window, OverlayMode::FullscreenOverlay)?;

    #[cfg(target_os = "macos")]
    {
        window.show().map_err(|e| e.to_string())?;
        apply_macos_overlay_policy(&window, true)?;
    }

    // ── Windows ───────────────────────────────────────────────────────────
    // ShowWindow is safe cross-thread. The HWND-level operations below have strict
    // thread-affinity requirements and must run on the window-owner (UI) thread:
    //   winvd::pin_window  — VirtualDesktop COM, STA required
    //   remove_window_border — DwmSetWindowAttribute + SetWindowLongPtrW, DWM stall
    //   SetWindowSubclass  — MSDN: must be installed from the thread that owns the
    //                         window; off-thread install silently breaks WM_NCCALCSIZE
    //                         interception, leaving a visible NC border.
    #[cfg(target_os = "windows")]
    {
        window.show().map_err(|e| e.to_string())?;
        if let Ok(hwnd) = window.hwnd() {
            let raw = hwnd.0;
            window
                .run_on_main_thread(move || {
                    let h = windows::Win32::Foundation::HWND(raw);
                    let _ = winvd::pin_window(h);
                    remove_window_border(h);
                    unsafe {
                        let _ = windows::Win32::UI::Shell::SetWindowSubclass(
                            h, Some(mini_subclass_proc), 1, 0,
                        );
                    }
                })
                .map_err(|e| e.to_string())?;
        }
    }

    // ── Linux ─────────────────────────────────────────────────────────────
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        window.show().map_err(|e| e.to_string())?;
    }

    // macOS: focus handled by activateIgnoringOtherApps in the block above.
    #[cfg(not(target_os = "macos"))]
    window.set_focus().map_err(|e| e.to_string())?;

    set_overlay_passthrough(&window);

    Ok(())
}
// ─────────────────────────────────────────────────────────────────────────────

/// Returns the global cursor position in physical screen coordinates
/// (relative to the top-left of the primary monitor).
///
/// Used by the React overlay to implement click-through hit-testing while
/// the launcher window is in `setIgnoreCursorEvents(true)` mode — at that
/// point the WKWebView receives zero mouse events, so the only way to know
/// where the cursor is (and whether to re-enable interaction) is to poll
/// the OS cursor each frame.
// async so Tauri schedules this on the async executor rather than occupying a
// dedicated blocking-thread slot. GetCursorPos is ~0.1 ms but the dispatch
// overhead at 8 FPS (120 ms cadence on Windows) adds up across sessions.
#[tauri::command]
async fn get_cursor_position(app: AppHandle) -> Result<(f64, f64), String> {
    let pos = app.cursor_position().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y))
}

/// Toggle whether the given window passes mouse events through to whatever
/// is below it.  When `passthrough = true`, the window becomes
/// click-through; when `false`, it captures clicks normally.
#[tauri::command]
fn set_cursor_passthrough(window: Window, passthrough: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let win_for_thread = window.clone();
        window
            .run_on_main_thread(move || {
                unsafe {
                    if let Ok(ns_win) = win_for_thread.ns_window() {
                        let ptr = ns_win as *mut objc2::runtime::AnyObject;
                        let _: () = objc2::msg_send![ptr, setIgnoresMouseEvents: passthrough];
                    }
                }
            })
            .map_err(|e| e.to_string())?;
    }

    // On Windows, set_ignore_cursor_events routes through Win32 SetWindowLongPtrW +
    // SetWindowPos(SWP_FRAMECHANGED). Called from a Tokio worker this triggers the
    // cross-thread SendMessage path — the worker BLOCKS until the Win32 message pump
    // drains the call. useCursorPassthrough fires this 8×/second (120ms cadence);
    // under any render spike (AI answer, transcript update) these 8 queued SendMessages
    // stall the IPC thread → all concurrent invoke calls appear frozen to the user.
    //
    // Fix: post fire-and-forget to the UI thread, matching the macOS pattern exactly.
    // The caller does not need to wait for the Win32 commit; state is tracked client-
    // side via lastPassthrough ref so redundant calls are already deduplicated.
    #[cfg(target_os = "windows")]
    {
        let w = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = w.set_ignore_cursor_events(passthrough);
            })
            .map_err(|e| e.to_string())?;
    }

    // Linux: GTK/X11 set_ignore_cursor_events is safe from any thread; keep direct.
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        window
            .set_ignore_cursor_events(passthrough)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ── Deepgram API key resolution (two-tier) ────────────────────────────
    //
    // PRODUCTION (bundled .app):
    //   The .env file is never shipped inside the bundle, so dotenvy finds
    //   nothing and std::env::var returns Err.  The key must be baked into
    //   the binary at compile time by the CI workflow.
    //
    //   option_env!("VITE_DEEPGRAM_API_KEY") reads the env var that the CI
    //   runner exports during `pnpm tauri build`; the value is embedded as a
    //   &'static str.
    //
    // DEVELOPMENT (pnpm tauri dev):
    //   dotenvy::dotenv() loads the project-root .env file, then
    //   std::env::var picks up the runtime value as the fallback.
    //
    // WHY THE WARNING FIRED MULTIPLE TIMES BEFORE:
    //   The Tauri auto-updater downloads a new binary, replaces the old one,
    //   and spawns a fresh process — so run() (and this block) executes once
    //   per relaunch.  Each fresh process had no .env → empty key → warning.
    //   Baking the key at compile time removes the dependency on .env at
    //   runtime, so the warning never fires in a correctly-built release.
    //
    // RESOLUTION ORDER:
    //   1) Compile-time embedded env var (option_env!)
    //   2) Runtime env var (from .env/dev shell/launcher)
    // Keep compile-time value authoritative for bundled builds.
    dotenvy::dotenv().ok(); // dev only; silently a no-op in bundled builds

    let deepgram_key: String = option_env!("VITE_DEEPGRAM_API_KEY")
        // compile-time path: CI baked the key into the binary
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .map(str::to_string)
        // runtime path: local .env loaded above (development)
        .or_else(|| {
            std::env::var("VITE_DEEPGRAM_API_KEY")
                .ok()
                .map(|k| k.trim().to_string())
                .filter(|k| !k.is_empty())
        })
        .unwrap_or_default();

    if deepgram_key.is_empty() {
        eprintln!("[startup] VITE_DEEPGRAM_API_KEY is not set - STT will fail.");
    }

    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
                return;
            }

            if let Some(widget) = app.get_webview_window("launcher") {
                let _ = apply_overlay_policy_to_window(&widget, OverlayMode::FullscreenOverlay);
                let _ = widget.show();
                let _ = widget.unminimize();
                let _ = widget.set_focus();
                set_overlay_passthrough(&widget);
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(DeepgramKey(deepgram_key))
        .setup(|app| {
            // Default to Regular policy at boot; switch dynamically based on mode.
            #[cfg(target_os = "macos")]
            let _ = set_macos_activation_policy("regular".to_string());

            // ── Apply OS chrome removal to the mini overlay ────────────────
            #[cfg(target_os = "windows")]
            {
                if let Some(win) = app.get_webview_window("mini") {
                    if let Ok(hwnd) = win.hwnd() {
                        let win_hwnd = windows::Win32::Foundation::HWND(hwnd.0);
                        remove_window_border(win_hwnd);
                        unsafe {
                            let _ = windows::Win32::UI::Shell::SetWindowSubclass(
                                win_hwnd, Some(mini_subclass_proc), 1, 0,
                            );
                        }
                    }
                }
            }

            // ── Launch the compact widget as the primary interface ─────────
            // show_launcher_widget calls objc2::msg_send! (NSWindow ObjC APIs)
            // which MUST run on the main thread. setup() already runs on the
            // main thread, so call it directly — never via async_runtime::spawn
            // which would put it on a tokio worker and cause EXC_BREAKPOINT/SIGTRAP.
            if let Err(e) = show_launcher_widget(app.handle().clone()) {
                eprintln!("[setup] show_launcher_widget failed: {e}");
            }
            let _ = apply_overlay_policy_for_label(
                &app.handle().clone(),
                "launcher",
                OverlayMode::FullscreenOverlay,
            );

            // ── Deep-link: handle auth ticket + bring widget to front ────
            // scribeshade://auth-callback?ticket=TOKEN  ← browser login flow
            //   Extract the ticket and emit it to the launcher webview so the
            //   widget can sign in via Clerk's "ticket" strategy without ever
            //   showing a webview or the main window.
            //
            // Any other deep link (e.g. scribeshade://oauth-callback) just
            // brings the appropriate window to the front as before.
            let deep_link_handle = app.handle().clone();
            app.handle().deep_link().on_open_url(move |event| {
                let urls = event.urls();
                let url_str = urls.first().map(|u| u.as_str().to_owned()).unwrap_or_default();

                // ── auth-callback: extract ticket, emit to launcher ────────
                if url_str.starts_with("scribeshade://auth-callback") {
                    if let Ok(parsed) = url::Url::parse(&url_str) {
                        let ticket = parsed
                            .query_pairs()
                            .find(|(k, _)| k == "ticket")
                            .map(|(_, v)| v.into_owned());

                        if let Some(ticket) = ticket {
                            // Ticket present: widget signs in via Clerk ticket strategy
                            let _ = deep_link_handle.emit("auth:tauri-ticket", &ticket);
                        } else {
                            // No ticket: widget reloads to pick up shared localStorage session
                            let _ = deep_link_handle.emit("auth:reload", ());
                        }
                    } else {
                        // Parse failed but URL starts with auth-callback — still reload
                        let _ = deep_link_handle.emit("auth:reload", ());
                    }

                    // Bring launcher to front — do NOT open the main window
                    if let Some(widget) = deep_link_handle.get_webview_window("launcher") {
                        let _ = apply_overlay_policy_to_window(
                            &widget,
                            OverlayMode::FullscreenOverlay,
                        );
                        #[cfg(target_os = "macos")]
                        {
                            let _ = apply_macos_overlay_policy(&widget, true);
                            set_overlay_passthrough(&widget);
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                            let _ = widget.show();
                            let _ = widget.set_focus();
                            set_overlay_passthrough(&widget);
                        }
                    }
                    return;
                }

                // ── All other deep links: just bring the right window front ─
                if let Some(main) = deep_link_handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                } else if let Some(widget) = deep_link_handle.get_webview_window("launcher") {
                    let _ = apply_overlay_policy_to_window(
                        &widget,
                        OverlayMode::FullscreenOverlay,
                    );
                    #[cfg(target_os = "macos")]
                    {
                        let _ = apply_macos_overlay_policy(&widget, true);
                        set_overlay_passthrough(&widget);
                    }
                    #[cfg(not(target_os = "macos"))]
                    {
                        let _ = widget.show();
                        let _ = widget.set_focus();
                        set_overlay_passthrough(&widget);
                    }
                }
            });

            if let Ok(Some(_)) = app.handle().deep_link().get_current() {
                if let Some(widget) = app.handle().get_webview_window("launcher") {
                    let _ = apply_overlay_policy_to_window(&widget, OverlayMode::FullscreenOverlay);
                    #[cfg(target_os = "macos")]
                    {
                        let _ = apply_macos_overlay_policy(&widget, true);
                        set_overlay_passthrough(&widget);
                    }
                    #[cfg(not(target_os = "macos"))]
                    {
                        let _ = widget.show();
                        let _ = widget.set_focus();
                        set_overlay_passthrough(&widget);
                    }
                }
            }

            // ── Mini window events ─────────────────────────────────────────
            // When the active-session overlay is minimized, restore the widget.
            if let Some(mini_win) = app.get_webview_window("mini") {
                let mini_handle = app.handle().clone();
                mini_win.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::Resized(_) => {
                            if let Some(mini) = mini_handle.get_webview_window("mini") {
                                let minimized = mini.is_minimized().unwrap_or(false);
                                #[cfg(debug_assertions)]
                                println!("[Tauri][WindowLifecycle] mini resized; minimized={}", minimized);
                                if minimized {
                                    let _ = mini.hide();
                                    #[cfg(debug_assertions)]
                                    println!("[Tauri][WindowLifecycle] mini hidden after minimize event");
                                    if !SESSION_ACTIVE.load(Ordering::SeqCst) {
                                        if let Some(widget) = mini_handle.get_webview_window("launcher") {
                                            let _ = apply_overlay_policy_to_window(
                                                &widget,
                                                OverlayMode::FullscreenOverlay,
                                            );
                                            #[cfg(target_os = "macos")]
                                            {
                                                let _ = apply_macos_overlay_policy(&widget, true);
                                                set_overlay_passthrough(&widget);
                                            }
                                            #[cfg(not(target_os = "macos"))]
                                            {
                                                let _ = widget.show();
                                                let _ = widget.set_focus();
                                                set_overlay_passthrough(&widget);
                                            }
                                            #[cfg(debug_assertions)]
                                            println!("[Tauri][WindowLifecycle] launcher restored after mini minimize");
                                        }
                                    }
                                }
                            } else {
                                #[cfg(debug_assertions)]
                                println!("[Tauri][WindowLifecycle] mini handle missing on resize event");
                            }
                        }
                        // BUG FIX: Intercept close requests on the mini overlay.
                        //
                        // ROOT CAUSE: Calling `getCurrentWindow().close()` from the
                        // frontend destroys the transparent + content-protected WKWebView.
                        // During teardown the GPU compositor momentarily renders the
                        // underlying framebuffer as solid black before the window
                        // disappears — visible to all screen-share participants.
                        //
                        // FIX: Prevent the window from being destroyed. Hide it instead.
                        // The window stays alive (just invisible) so the next session
                        // can call show_mini_top_center without recreating anything.
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                            if let Some(win) = mini_handle.get_webview_window("mini") {
                                let _ = win.hide();
                                println!("[Tauri][WindowLifecycle] mini close requested -> hide");
                            } else {
                                println!("[Tauri][WindowLifecycle] mini close requested but handle missing");
                            }
                        }
                        _ => {}
                    }
                });
            }

            // Cancellation flag for the macOS reinforce loop — set on launcher Destroyed.
            #[cfg(target_os = "macos")]
            let reinforce_stop = Arc::new(AtomicBool::new(false));

            // ── macOS: re-apply overlay policy on lifecycle events ───────────
            //
            // macOS resets window levels after any focus / show lifecycle
            // event (Tauri internally calls makeKeyAndOrderFront which
            // re-enters the Quartz Compositor at the current level — which
            // may have been downgraded to NSFloatingWindowLevel (3) by
            // system events like Mission Control, Exposé, or another app
            // stealing focus).
            //
            // The fix: install a persistent on_window_event listener on both
            // overlay windows. On every Focused(_) event we re-apply level 25
            // (NSStatusWindowLevel) atomically on the main thread. This costs
            // one msg_send per focus event and is invisible to the user.
            #[cfg(target_os = "macos")]
            {
                // launcher window — always shown
                if let Some(win) = app.get_webview_window("launcher") {
                    let exit_handle = app.handle().clone();
                    let launcher_handle = app.handle().clone();
                    let reinforce_stop_mac = reinforce_stop.clone();
                    win.on_window_event(move |event| {
                        match event {
                            tauri::WindowEvent::Focused(true)
                            | tauri::WindowEvent::Resized(_)
                            | tauri::WindowEvent::Moved(_)
                            | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                                if let Some(w) =
                                    launcher_handle.get_webview_window("launcher")
                                {
                                    reinforce_window_level(&w);
                                }
                            }
                            // BUG FIX: Exit the process when the launcher is destroyed.
                            //
                            // ROOT CAUSE: With NSApplicationActivationPolicyAccessory
                            // (no Dock icon) and skipTaskbar=true (no taskbar entry)
                            // there is no OS-level way to reopen the app after the
                            // launcher window is closed. The process keeps running
                            // because the mini window (always alive, just hidden) holds
                            // a window handle that prevents Tauri from exiting. The user
                            // sees nothing and must kill the process via Task Manager.
                            //
                            // FIX: When the launcher is destroyed (user-initiated close or
                            // any other destruction path), terminate the process cleanly.
                            // The next app launch starts a fresh process with the widget
                            // visible immediately.
                            tauri::WindowEvent::Destroyed => {
                                reinforce_stop_mac.store(true, Ordering::Relaxed);
                                exit_handle.exit(0);
                            }
                            _ => {}
                        }
                    });
                }

                // mini overlay — shown during active sessions
                if let Some(win) = app.get_webview_window("mini") {
                    let mini_handle = app.handle().clone();
                    win.on_window_event(move |event| {
                        if matches!(
                            event,
                            tauri::WindowEvent::Focused(true)
                                | tauri::WindowEvent::Resized(_)
                                | tauri::WindowEvent::Moved(_)
                                | tauri::WindowEvent::ScaleFactorChanged { .. }
                        ) {
                            if let Some(w) = mini_handle.get_webview_window("mini") {
                                reinforce_window_level(&w);
                            }
                        }
                    });
                }
            }

            // ── macOS: Space-transition overlay reinforcement ─────────────────
            //
            // ROOT CAUSE: When another app enters native fullscreen macOS creates
            // a new private compositor Space for that app. Tauri fires no window
            // event on our windows during this transition, so the Focused-event
            // re-application above never runs. macOS can reset NSWindowLevel and
            // NSWindowCollectionBehavior during the Space compositor handoff,
            // causing the overlay to disappear behind the fullscreen app.
            //
            // FIX: A lightweight background task re-applies the popup menu
            // window level plus collection behavior (canJoinAllSpaces |
            // stationary | ignoresCycle | fullScreenAuxiliary) to every visible
            // overlay window every 500 ms. CPU impact is negligible.
            // 500 ms chosen over 2 s so the overlay reappears within half a
            // second after a Space transition (native fullscreen entry/exit,
            // Mission Control, hot corners). The previous 2 s interval left a
            // visible gap where the overlay was behind the fullscreen app.
            //
            // This handles: fullscreen Space entry/exit, Mission Control, Exposé,
            // hot corners, and any other event that silently resets window
            // compositor properties outside of Tauri's event model.
            #[cfg(target_os = "macos")]
            {
                let reinforce_handle = app.handle().clone();
                let reinforce_stop_loop = reinforce_stop.clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        if reinforce_stop_loop.load(Ordering::Relaxed) { break; }
                        for label in ["launcher", "mini"] {
                            if let Some(win) = reinforce_handle.get_webview_window(label) {
                                if win.is_visible().unwrap_or(false) {
                                    reinforce_window_level(&win);
                                }
                            }
                        }
                    }
                });
            }

            // ── Windows / Linux: exit when launcher is closed ──────────────
            // On macOS the Destroyed handler is registered in the
            // #[cfg(target_os = "macos")] block above. Add the same clean-exit
            // logic here for Windows and Linux where that block is not compiled.
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(win) = app.get_webview_window("launcher") {
                    let exit_handle = app.handle().clone();
                    win.on_window_event(move |event| {
                        if let tauri::WindowEvent::Destroyed = event {
                            exit_handle.exit(0);
                        }
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_floating, capture_screen, show_mini_top_center, set_mini_state,
            set_mini_size_instant,
            start_audio_stream, stop_audio_stream, list_audio_devices,
            start_display_audio_stream, stop_display_audio_stream,
            start_system_audio_transcription, stop_system_audio_transcription,
            start_mic_transcription, stop_mic_transcription,
            stop_all_audio_transcription,
            open_screen_recording_settings, open_microphone_settings,
            ensure_microphone_permission,
            get_macos_app_identity,
            check_microphone_permission, request_microphone_permission,
            check_screen_recording_permission, request_screen_recording_permission,
            open_macos_privacy_settings, set_macos_activation_policy,
            set_session_active, toggle_content_protection, handle_launcher_click,
            open_main_dashboard, show_launcher_widget,
            get_cursor_position, set_cursor_passthrough,
            auth_get_persisted_session, auth_set_persisted_session,
            auth_clear_persisted_session, auth_emit_state_changed,
        ])
        .run(tauri::generate_context!());
    if let Err(err) = run_result {
        eprintln!("[startup] tauri runtime error: {err}");
    }
}
