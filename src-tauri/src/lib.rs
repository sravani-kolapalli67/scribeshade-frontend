use tauri::{Manager, WebviewWindowBuilder, WebviewUrl, AppHandle, Window, PhysicalPosition, LogicalSize};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use screenshots::Screen;
use base64::{Engine as _, engine::general_purpose};
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use std::sync::Arc;

/// Monotonic version counter — every new animation request bumps this.
static ANIM_VERSION: AtomicU64 = AtomicU64::new(0);

// ── Native audio WebSocket state ─────────────────────────────────────────────
// On macOS, WKWebView never returns audio tracks from getDisplayMedia.
// We capture the default input device (mic, or a virtual loopback device such
// as BlackHole that routes app/tab audio) in Rust via cpal, then stream raw
// PCM frames over a localhost WebSocket so the frontend can feed them to
// Deepgram directly.

#[cfg(target_os = "macos")]
static AUDIO_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
static AUDIO_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);

/// ScreenCaptureKit display audio stream state.
/// Captures system/tab audio from the primary display — does NOT require a
/// virtual audio device (BlackHole/Loopback).  Requires macOS 13.0+ and the
/// user to have granted Screen Recording permission.
#[cfg(target_os = "macos")]
static DISPLAY_AUDIO_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
static DISPLAY_AUDIO_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);

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
        win.close().map_err(|e| e.to_string())?;
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
    window.set_minimizable(false).unwrap();
    window.set_maximizable(false).unwrap();

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
        "bar"      => (700, 222),
        "expanded" => (700, height.unwrap_or(185).clamp(120, 720)),
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

    if AUDIO_RUNNING.load(Ordering::SeqCst) {
        let port = AUDIO_PORT.load(Ordering::SeqCst);
        if port != 0 {
            return Ok(port);
        }
    }

    let host = cpal::default_host();

    let device = if let Some(ref name) = device_name {
        host.input_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().map(|n| n.contains(name.as_str())).unwrap_or(false))
            .ok_or_else(|| format!("Audio device '{}' not found", name))?
    } else {
        host.default_input_device()
            .ok_or("No default input device")?
    };

    let config = device.default_input_config().map_err(|e| e.to_string())?;
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as u32;

    // Broadcast channel — new WS clients subscribe, cpal thread publishes
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(64);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();

    // Spawn cpal on a dedicated OS thread (cpal streams are !Send)
    AUDIO_RUNNING.store(true, Ordering::SeqCst);
    std::thread::spawn(move || {
        let tx = tx_capture;

        let err_fn = |e| eprintln!("[cpal] stream error: {e}");

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    if !AUDIO_RUNNING.load(Ordering::Relaxed) { return; }
                    // Convert f32 → i16 PCM
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
            _ => return,
        };

        if let Ok(s) = stream {
            let _ = s.play();
            while AUDIO_RUNNING.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            // stream dropped here → cpal stops
        }
    });

    // Bind axum WebSocket server on a random port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    AUDIO_PORT.store(port, Ordering::SeqCst);

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
                        // Send metadata frame first
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

    // Return existing port if already running
    if DISPLAY_AUDIO_RUNNING.load(Ordering::SeqCst) {
        let port = DISPLAY_AUDIO_PORT.load(Ordering::SeqCst);
        if port != 0 {
            return Ok(port);
        }
    }

    // Broadcast channel: SCKit callback thread → axum WS clients
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(128);
    let tx_arc = Arc::new(tx);
    let tx_capture = tx_arc.clone();

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
                eprintln!("[sckit] SCShareableContent::get() failed: {e:?}");
                DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
        };

        let displays = content.displays();
        let display = match displays.into_iter().next() {
            Some(d) => d,
            None => {
                eprintln!("[sckit] no display found");
                DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
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

                // Convert f32 LE PCM → i16 LE PCM for Deepgram linear16 encoding.
                // SCKit delivers float32; interleave non-interleaved buffers.
                let mut pcm: Vec<u8> = Vec::new();

                if num_bufs == 1 {
                    // Single buffer = interleaved (all channels, e.g. stereo i2)
                    if let Some(buf) = abl.get(0) {
                        for chunk in buf.data().chunks_exact(4) {
                            let f = f32::from_le_bytes([
                                chunk[0], chunk[1], chunk[2], chunk[3]
                            ]);
                            let v = (f.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                            pcm.extend_from_slice(&v.to_le_bytes());
                        }
                    }
                } else {
                    // Multiple buffers = non-interleaved (one buffer per channel)
                    let samples_per_ch = abl.get(0)
                        .map(|b| b.data().len() / 4)
                        .unwrap_or(0);
                    for i in 0..samples_per_ch {
                        for b in 0..num_bufs {
                            if let Some(buf) = abl.get(b) {
                                let raw = buf.data();
                                let off = i * 4;
                                if off + 4 <= raw.len() {
                                    let f = f32::from_le_bytes([
                                        raw[off], raw[off+1], raw[off+2], raw[off+3]
                                    ]);
                                    let v = (f.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                                    pcm.extend_from_slice(&v.to_le_bytes());
                                }
                            }
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
            eprintln!("[sckit] start_capture failed: {e:?}");
            DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
            return;
        }

        while DISPLAY_AUDIO_RUNNING.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let _ = stream.stop_capture();
        // stream, content, display, filter dropped here (on this thread)
    });

    // Bind axum WebSocket server on a random localhost port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    DISPLAY_AUDIO_PORT.store(port, Ordering::SeqCst);

    // First WS message is JSON metadata so the frontend can configure Deepgram
    let sample_rate: u32 = 48000;
    let channels: u32 = 2;
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
    DISPLAY_AUDIO_RUNNING.store(false, Ordering::SeqCst);
    DISPLAY_AUDIO_PORT.store(0, Ordering::SeqCst);
}

// Stubs for non-macOS so the invoke_handler compiles on all platforms
#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn start_audio_stream(_device_name: Option<String>) -> Result<u16, String> {
    Err("Native audio capture is macOS-only".into())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn stop_audio_stream() {}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn list_audio_devices() -> Vec<String> { vec![] }

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn start_display_audio_stream() -> Result<u16, String> {
    Err("Display audio capture is macOS-only".into())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn stop_display_audio_stream() {}
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() { 
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Create the main window manually so we can attach a navigation_handler.
            // This intercepts all external URLs (e.g. Google OAuth) and opens them
            // in the OS system browser instead of the Tauri webview.
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("ScribeShade")
                .inner_size(1200.0, 800.0)
                .center()
                .resizable(false)
                .maximized(true)
                .skip_taskbar(true)
                .on_navigation(move |url| {
                    let scheme = url.scheme();
                    let host = url.host_str().unwrap_or("");
                    // Allow Tauri internal URLs and local dev server
                    if scheme == "tauri"
                        || host == "localhost"
                        || host == "tauri.localhost"
                        || host == "127.0.0.1"
                    {
                        return true;
                    }
                    // All external URLs → OS system browser
                    let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    false
                })
                .build()?;
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

            // Deep-link handler — focuses main window whenever the OS opens
            // craftvita:// (e.g. the "Return to ScribeShade" button in the
            // browser after OAuth). The JS onOpenUrl listener in App.tsx
            // handles URL routing; Rust only needs to bring the window forward.
            let deep_link_handle = app.handle().clone();
            app.handle().deep_link().on_open_url(move |_event| {
                if let Some(win) = deep_link_handle.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            });

            // Handle the case where the app was cold-launched by a craftvita://
            // deep link (e.g. OS invoked the .app bundle directly). The JS
            // onOpenUrl will also fire, but focusing here ensures the window is
            // visible before the React router processes the URL.
            if let Ok(Some(_)) = app.handle().deep_link().get_current() {
                if let Some(win) = app.handle().get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_floating, capture_screen, show_mini_top_center, set_mini_state,
            start_audio_stream, stop_audio_stream, list_audio_devices,
            start_display_audio_stream, stop_display_audio_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}