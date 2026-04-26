use tauri::{Manager, WebviewWindowBuilder, WebviewUrl, AppHandle, Window, PhysicalPosition, LogicalSize};
use screenshots::Screen;
use base64::{Engine as _, engine::general_purpose};
use std::sync::atomic::{AtomicU64, Ordering};

/// Monotonic version counter — every new animation request bumps this.
/// In-flight animation loops compare on each tick and exit if outdated,
/// so the latest call always wins without explicit task cancellation.
static ANIM_VERSION: AtomicU64 = AtomicU64::new(0);

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
        win.close().map_err(|e| e.to_string())?;
    } else {
        WebviewWindowBuilder::new(&app, "floating", WebviewUrl::App("floating.html".into()))
            .title("Mini Overlay")
            // .inner_size(300f64, 200f64)
            .position(20f64, 20f64)
            .always_on_top(true)
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
async fn capture_screen(window: Window) -> Result<String, String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    
    // Find the screen that contains the window, or fallback to the first screen
    let screen = Screen::from_point(position.x, position.y)
        .map_err(|e| e.to_string())?;
        
    let image = screen.capture().map_err(|e| e.to_string())?;
    let mut buffer = std::io::Cursor::new(Vec::new());
    image.write_to(&mut buffer, screenshots::image::ImageFormat::Png).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(buffer.into_inner());
    
    Ok(format!("data:image/png;base64,{}", b64))
}


#[tauri::command]
fn show_mini_top_center(app: AppHandle) {
    let window = app.get_webview_window("mini").unwrap();

    let monitor = window.primary_monitor().unwrap().unwrap();
    let screen = monitor.size();
    let size = window.outer_size().unwrap();

    let x = (screen.width as i32 - size.width as i32) / 2;
    let y = 10;

    window.set_position(PhysicalPosition { x, y }).unwrap();
    window.set_always_on_top(true).unwrap();

    // Strip all DWM chrome BEFORE showing the window so it never flashes
    // with the default Windows frame/border/shadow.
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            let win_hwnd = windows::Win32::Foundation::HWND(hwnd.0);
            let _ = winvd::pin_window(win_hwnd);
            remove_window_border(win_hwnd);
            // Install rounded-corner click-through hit-testing (runs once; safe to
            // re-register with same ID — just updates the ref_data).
            unsafe {
                let _ = windows::Win32::UI::Shell::SetWindowSubclass(
                    win_hwnd, Some(mini_subclass_proc), 1, 0,
                );
            }
        }
    }

    window.show().unwrap();
}

/// Animate the mini overlay to one of three discrete states.
///
/// React owns the *intent* (idle bar / expanded panel / collapsed badge)
/// and a content-derived `height` for the expanded case. Rust owns the
/// smooth, monotonic eased animation — keeping per-frame `set_size` calls
/// off the JS thread and out of the IPC bus.
#[tauri::command]
async fn set_mini_state(
    app: AppHandle,
    state: String,
    height: Option<u32>,
) -> Result<(), String> {
    let win = app.get_webview_window("mini").ok_or("mini window missing")?;

    let (target_w, target_h): (u32, u32) = match state.as_str() {
        "badge"    => (180, 36),
        "bar"      => (520, 222),
        "expanded" => (520, height.unwrap_or(185).clamp(120, 720)),
        other      => return Err(format!("unknown mini state: {other}")),
    };

    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let cur = win.inner_size().map_err(|e| e.to_string())?;
    let cur_w = (cur.width  as f64 / scale).round() as u32;
    let cur_h = (cur.height as f64 / scale).round() as u32;
    if cur_w == target_w && cur_h == target_h {
        return Ok(());
    }

    let version = ANIM_VERSION.fetch_add(1, Ordering::SeqCst) + 1;
    let win_clone = win.clone();

    tauri::async_runtime::spawn(async move {
        let start = std::time::Instant::now();
        let duration_ms: f32 = 220.0;
        let start_w = cur_w as f32;
        let start_h = cur_h as f32;
        let dx = target_w as f32 - start_w;
        let dy = target_h as f32 - start_h;

        loop {
            if ANIM_VERSION.load(Ordering::SeqCst) != version { return; }

            let elapsed = start.elapsed().as_millis() as f32;
            let t = (elapsed / duration_ms).min(1.0);
            let eased = 1.0 - (1.0 - t).powi(3); // ease-out cubic
            let w = (start_w + dx * eased).round() as u32;
            let h = (start_h + dy * eased).round() as u32;
            let _ = win_clone.set_size(LogicalSize::new(w, h));

            if t >= 1.0 { return; }
            tokio::time::sleep(std::time::Duration::from_millis(8)).await;
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() { 
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                if let Some(win) = app.get_webview_window("mini") {
                    if let Ok(hwnd) = win.hwnd() {
                        let win_hwnd = windows::Win32::Foundation::HWND(hwnd.0);
                        remove_window_border(win_hwnd);
                        // Install rounded-corner click-through subclass so the
                        // transparent corners pass clicks to whatever's under us.
                        unsafe {
                            let _ = windows::Win32::UI::Shell::SetWindowSubclass(
                                win_hwnd, Some(mini_subclass_proc), 1, 0,
                            );
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_floating, capture_screen, show_mini_top_center, set_mini_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}