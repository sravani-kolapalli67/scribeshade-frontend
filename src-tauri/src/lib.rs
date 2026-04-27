use tauri::{Manager, WebviewWindowBuilder, WebviewUrl, AppHandle, Window, PhysicalPosition, LogicalSize};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use screenshots::Screen;
use screenshots::image::{imageops::FilterType, DynamicImage};
use base64::{Engine as _, engine::general_purpose};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

/// Monotonic version counter — every new animation request bumps this.
/// In-flight animation loops compare on each tick and exit if outdated,
/// so the latest call always wins without explicit task cancellation.
static ANIM_VERSION: AtomicU64 = AtomicU64::new(0);

/// Guards the native screen-stream background task.
/// Set to false to signal the running loop to exit.
static STREAM_RUNNING: AtomicBool = AtomicBool::new(false);

/// Holds the shutdown sender for the active WebSocket server.
/// Dropping it (by replacing with None) signals the server to shut down.
static WS_SHUTDOWN: Mutex<Option<tokio::sync::oneshot::Sender<()>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Metadata about a single display — sent to the frontend for the screen picker
// ---------------------------------------------------------------------------
#[derive(serde::Serialize, Clone)]
struct ScreenInfo {
    id: usize,
    name: String,
    width: u32,
    height: u32,
    thumbnail: String, // data:image/jpeg;base64,…
    is_primary: bool,
    /// true for the synthetic "Entire Screen" entry that captures all displays combined.
    capture_all: bool,
    /// CGWindowID when this entry represents an application window; null for displays.
    window_id: Option<u32>,
    /// Application bundle name for window entries; null for display entries.
    app_name: Option<String>,
}

// ---------------------------------------------------------------------------
// macOS-only: enumerate visible application windows and capture them
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
struct MacOSWindowEntry {
    window_id: u32,
    app_name: String,
    title: String,
    width: u32,
    height: u32,
}

/// Enumerate on-screen application windows using CGWindowListCopyWindowInfo.
/// Returns entries suitable for the screen-picker UI.
#[cfg(target_os = "macos")]
fn enumerate_app_windows() -> Vec<MacOSWindowEntry> {
    use core_foundation::array::CFArray;
    use core_foundation::base::{TCFType, CFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::display::{
        CGWindowListCopyWindowInfo, kCGWindowListOptionOnScreenOnly,
        kCGWindowListExcludeDesktopElements, kCGNullWindowID,
    };

    let option = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
    let raw = unsafe { CGWindowListCopyWindowInfo(option, kCGNullWindowID) };
    if raw.is_null() {
        return vec![];
    }

    // CFArray::wrap_under_create_rule takes ownership and releases on drop.
    let array: CFArray<CFType> = unsafe { CFArray::wrap_under_create_rule(raw) };
    let mut results: Vec<MacOSWindowEntry> = Vec::new();

    for item in array.iter() {
        // Each element is a CFDictionaryRef; wrap under get-rule (not owned by us).
        let dict: CFDictionary<CFString, CFType> = unsafe {
            CFDictionary::wrap_under_get_rule(item.as_CFTypeRef() as *mut _)
        };

        let get_str = |key: &str| -> Option<String> {
            let cf_key = CFString::new(key);
            dict.find(&cf_key).and_then(|val| {
                let str_ref = val.as_CFTypeRef() as core_foundation::string::CFStringRef;
                if str_ref.is_null() {
                    return None;
                }
                Some(unsafe { CFString::wrap_under_get_rule(str_ref) }.to_string())
            })
        };

        let get_i32 = |key: &str| -> Option<i32> {
            let cf_key = CFString::new(key);
            dict.find(&cf_key).and_then(|val| {
                let num_ref = val.as_CFTypeRef() as core_foundation::number::CFNumberRef;
                if num_ref.is_null() {
                    return None;
                }
                unsafe { CFNumber::wrap_under_get_rule(num_ref) }.to_i32()
            })
        };

        let app_name = get_str("kCGWindowOwnerName").unwrap_or_default();
        let title = get_str("kCGWindowName").unwrap_or_default();
        let window_id = get_i32("kCGWindowNumber").unwrap_or(0) as u32;
        if window_id == 0 || app_name.is_empty() {
            continue;
        }

        // kCGWindowSharingState: 0 = None (not capturable), 1 = ReadOnly, 2 = ReadWrite.
        // Skip windows we can't capture.
        let sharing_state = get_i32("kCGWindowSharingState").unwrap_or(0);
        if sharing_state == 0 {
            continue;
        }

        // kCGWindowLayer: 0 = normal app window, small positive = panel/floating.
        // Very high values = menu bar, Dock, Spotlight, etc.  Skip anything above 10.
        let layer = get_i32("kCGWindowLayer").unwrap_or(0);
        if layer > 10 || layer < 0 {
            continue;
        }

        // Parse kCGWindowBounds sub-dictionary
        let cf_bounds_key = CFString::new("kCGWindowBounds");
        let (w, h) = if let Some(bounds_val) = dict.find(&cf_bounds_key) {
            let bd: CFDictionary<CFString, CFType> = unsafe {
                CFDictionary::wrap_under_get_rule(bounds_val.as_CFTypeRef() as *mut _)
            };
            let bw = {
                let k = CFString::new("Width");
                bd.find(&k)
                    .and_then(|v| {
                        unsafe { CFNumber::wrap_under_get_rule(v.as_CFTypeRef() as _) }.to_i32()
                    })
                    .unwrap_or(0) as u32
            };
            let bh = {
                let k = CFString::new("Height");
                bd.find(&k)
                    .and_then(|v| {
                        unsafe { CFNumber::wrap_under_get_rule(v.as_CFTypeRef() as _) }.to_i32()
                    })
                    .unwrap_or(0) as u32
            };
            (bw, bh)
        } else {
            (0, 0)
        };

        // Skip tiny/hidden windows and ScribeShade's own windows
        if w < 200 || h < 100 {
            continue;
        }
        let lower = app_name.to_lowercase();
        if lower.contains("craftvita") || lower.contains("scribeshade") {
            continue;
        }

        results.push(MacOSWindowEntry {
            window_id,
            app_name,
            title,
            width: w,
            height: h,
        });
    }

    results
}

/// Capture a specific application window on macOS via CGWindowListCreateImage.
///
/// Performance: Instead of capturing at full/Retina resolution (which can be
/// 2880×1800 on a Retina display) and then resizing in software, we let Core
/// Graphics downscale directly by drawing the CGImage into a CGContext that is
/// already sized to the output dimensions.  This reduces the pixel buffer from
/// ~20 MB to ~1 MB and eliminates the software resize step entirely.
///
/// `max_w` is the maximum output width; height is scaled proportionally.
#[cfg(target_os = "macos")]
fn capture_window_macos(window_id: u32, max_w: u32) -> Option<screenshots::image::RgbaImage> {
    use foreign_types::ForeignType;
    use core_graphics::base::{kCGBitmapByteOrder32Little, kCGImageAlphaNoneSkipFirst};
    use core_graphics::color_space::CGColorSpace;
    use core_graphics::context::CGContext;
    use core_graphics::display::{
        kCGWindowImageBoundsIgnoreFraming, kCGWindowListOptionIncludingWindow,
    };
    use core_graphics::geometry::{CGPoint, CGRect, CGSize};
    use core_graphics::image::CGImage;

    // CGRectNull — tells CG to use the window's natural bounds.
    let null_rect = CGRect::new(
        &CGPoint::new(f64::INFINITY, f64::INFINITY),
        &CGSize::new(0.0, 0.0),
    );

    let cg_image_ref = unsafe {
        core_graphics::display::CGWindowListCreateImage(
            null_rect,
            kCGWindowListOptionIncludingWindow,
            window_id,
            kCGWindowImageBoundsIgnoreFraming,
        )
    };
    if cg_image_ref.is_null() {
        return None;
    }

    let cg_image = unsafe { CGImage::from_ptr(cg_image_ref) };
    let src_w = cg_image.width() as u32;
    let src_h = cg_image.height() as u32;
    if src_w == 0 || src_h == 0 {
        return None;
    }

    // Scale to fit max_w, maintaining aspect ratio.
    // On Retina displays src_w is 2× the logical width; this collapses it back.
    let scale = (max_w as f64 / src_w as f64).min(1.0);
    let out_w = ((src_w as f64 * scale) as u32).max(1);
    let out_h = ((src_h as f64 * scale) as u32).max(1);

    // Create a BGRA bitmap context at the TARGET size and draw the CGImage into it.
    // Core Graphics performs the downscale using its own accelerated path —
    // no separate software resize step is needed.
    let color_space = CGColorSpace::create_device_rgb();
    let mut buf = vec![0u8; 4 * out_w as usize * out_h as usize];
    let context = CGContext::create_bitmap_context(
        Some(buf.as_mut_ptr() as *mut _),
        out_w as usize,
        out_h as usize,
        8,
        4 * out_w as usize,
        &color_space,
        kCGBitmapByteOrder32Little | kCGImageAlphaNoneSkipFirst,
    );
    context.draw_image(
        CGRect::new(
            &CGPoint::new(0.0, 0.0),
            &CGSize::new(out_w as f64, out_h as f64),
        ),
        &cg_image,
    );

    // Convert BGRA → RGBA.  The buffer is now out_w × out_h pixels, not the
    // full Retina resolution — typically 18–70× less work than before.
    let mut rgba = screenshots::image::RgbaImage::new(out_w, out_h);
    for (i, pixel) in rgba.pixels_mut().enumerate() {
        let o = i * 4;
        *pixel = screenshots::image::Rgba([buf[o + 2], buf[o + 1], buf[o], 255]);
    }
    Some(rgba)
}

/// Stitch multiple RGBA images side-by-side horizontally into one combined image.
/// Used to build the "Entire Screen" thumbnail and combined stream frames.
fn stitch_screens_horizontal(
    images: &[screenshots::image::RgbaImage],
) -> screenshots::image::RgbaImage {
    let total_w: u32 = images.iter().map(|i| i.width()).sum();
    let max_h: u32 = images.iter().map(|i| i.height()).max().unwrap_or(1);
    let mut combined = screenshots::image::RgbaImage::new(total_w.max(1), max_h);
    let mut x_offset = 0i64;
    for img in images {
        screenshots::image::imageops::replace(&mut combined, img, x_offset, 0);
        x_offset += img.width() as i64;
    }
    combined
}

/// List all connected displays with a small thumbnail of each.
/// The first entry is always a synthetic "Entire Screen" option (capture_all = true)
/// that streams all displays stitched side-by-side.
#[tauri::command]
async fn list_screens() -> Result<Vec<ScreenInfo>, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let mut result = Vec::with_capacity(screens.len() + 1);

    // Capture every display and build its thumbnail.
    // Raw captures are also kept for stitching the combined thumbnail.
    let mut raw_captures: Vec<screenshots::image::RgbaImage> = Vec::with_capacity(screens.len());
    let mut individual: Vec<ScreenInfo> = Vec::with_capacity(screens.len());

    for (i, screen) in screens.iter().enumerate() {
        let image = screen.capture().map_err(|e| e.to_string())?;
        let thumb_buf = screenshots::image::imageops::resize(&image, 320, 180, FilterType::Nearest);
        let thumb = DynamicImage::from(thumb_buf);
        let mut buf = std::io::Cursor::new(Vec::new());
        thumb
            .write_to(&mut buf, screenshots::image::ImageFormat::Jpeg)
            .map_err(|e| e.to_string())?;
        let b64 = general_purpose::STANDARD.encode(buf.into_inner());
        raw_captures.push(image);
        individual.push(ScreenInfo {
            id: i,
            name: if screen.display_info.is_primary {
                "Primary Display".to_string()
            } else {
                format!("Display {}", i + 1)
            },
            width: screen.display_info.width,
            height: screen.display_info.height,
            thumbnail: format!("data:image/jpeg;base64,{b64}"),
            is_primary: screen.display_info.is_primary,
            capture_all: false,
            window_id: None,
            app_name: None,
        });
    }

    // Build a stitched thumbnail for the "Entire Screen" entry.
    let combined_w: u32 = individual.iter().map(|s| s.width).sum();
    let combined_h: u32 = individual.iter().map(|s| s.height).max().unwrap_or(0);
    let combined_thumb = if !raw_captures.is_empty() {
        let stitched = stitch_screens_horizontal(&raw_captures);
        let scale = (640.0 / stitched.width() as f64).min(180.0 / stitched.height() as f64);
        let tw = ((stitched.width() as f64 * scale) as u32).max(1);
        let th = ((stitched.height() as f64 * scale) as u32).max(1);
        let small = screenshots::image::imageops::resize(&stitched, tw, th, FilterType::Nearest);
        let mut buf = std::io::Cursor::new(Vec::new());
        DynamicImage::from(small)
            .write_to(&mut buf, screenshots::image::ImageFormat::Jpeg)
            .map_err(|e| e.to_string())?;
        format!(
            "data:image/jpeg;base64,{}",
            general_purpose::STANDARD.encode(buf.into_inner())
        )
    } else {
        String::new()
    };

    // "Entire Screen" is always the first option in the picker.
    result.push(ScreenInfo {
        id: 0, // unused when capture_all = true
        name: "Entire Screen".to_string(),
        width: combined_w,
        height: combined_h,
        thumbnail: combined_thumb,
        is_primary: false,
        capture_all: true,
        window_id: None,
        app_name: None,
    });
    result.extend(individual);

    // On macOS, also enumerate visible application windows so the user can
    // share a specific browser window / app window rather than a full display.
    #[cfg(target_os = "macos")]
    {
        for win in enumerate_app_windows() {
            // Build a thumbnail for this window
            let thumb = capture_window_macos(win.window_id, 320)
                .map(|img| {
                    let scale =
                        (320.0 / img.width() as f64).min(180.0 / img.height() as f64);
                    let tw = ((img.width() as f64 * scale) as u32).max(1);
                    let th = ((img.height() as f64 * scale) as u32).max(1);
                    let small =
                        screenshots::image::imageops::resize(&img, tw, th, FilterType::Nearest);
                    let mut buf = std::io::Cursor::new(Vec::new());
                    if DynamicImage::from(small)
                        .write_to(&mut buf, screenshots::image::ImageFormat::Jpeg)
                        .is_ok()
                    {
                        format!(
                            "data:image/jpeg;base64,{}",
                            general_purpose::STANDARD.encode(buf.into_inner())
                        )
                    } else {
                        String::new()
                    }
                })
                .unwrap_or_default();

            let display_name = if win.title.is_empty() {
                win.app_name.clone()
            } else {
                format!("{} — {}", win.app_name, win.title)
            };

            result.push(ScreenInfo {
                id: 0, // unused for window entries
                name: display_name,
                width: win.width,
                height: win.height,
                thumbnail: thumb,
                is_primary: false,
                capture_all: false,
                window_id: Some(win.window_id),
                app_name: Some(win.app_name),
            });
        }
    }

    Ok(result)
}

/// Stream JPEG frames from the chosen display, all displays combined, or a
/// specific application window to the frontend via a localhost WebSocket server.
///
/// On macOS, uses ScreenCaptureKit for low-latency hardware-accelerated capture
/// with optional system audio.  On other platforms, falls back to the
/// `screenshots` crate (Windows path unchanged).
///
/// Returns the localhost port the WebSocket server is bound on.  The frontend
/// connects to `ws://127.0.0.1:{port}` to receive binary JPEG frames.
///
/// Priority: `window_id` (Some) > `capture_all` (true) > `screen_id`.
#[tauri::command]
async fn start_native_screen_stream(
    screen_id: usize,
    capture_all: bool,
    window_id: Option<u32>,
) -> Result<u16, String> {
    // Stop any in-flight stream first.
    stop_native_screen_stream();

    // Bind to a random localhost port (OS assigns it).
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    if let Ok(mut guard) = WS_SHUTDOWN.lock() {
        *guard = Some(shutdown_tx);
    }

    STREAM_RUNNING.store(true, Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        #[cfg(target_os = "macos")]
        {
            run_sckit_ws_server(listener, shutdown_rx, screen_id, capture_all, window_id).await;
        }
        #[cfg(not(target_os = "macos"))]
        {
            run_screenshots_ws_server(listener, shutdown_rx, screen_id, capture_all).await;
        }
        STREAM_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(port)
}

/// Stop the background screen-stream loop and close the WebSocket server.
#[tauri::command]
fn stop_native_screen_stream() {
    STREAM_RUNNING.store(false, Ordering::SeqCst);
    if let Ok(mut guard) = WS_SHUTDOWN.lock() {
        // Dropping the sender signals the shutdown receiver.
        *guard = None;
    }
}

// ---------------------------------------------------------------------------
// macOS: ScreenCaptureKit + axum WebSocket server
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
async fn run_sckit_ws_server(
    listener: tokio::net::TcpListener,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    screen_id: usize,
    capture_all: bool,
    window_id: Option<u32>,
) {
    use std::sync::Arc;
    use tokio::sync::broadcast;
    use axum::{Router, extract::{WebSocketUpgrade, State}};

    // Channel: the capture thread pushes raw JPEG bytes; each WS connection
    // receives a clone of the latest frame.
    let (frame_tx, _) = broadcast::channel::<Arc<Vec<u8>>>(4);
    let frame_tx = Arc::new(frame_tx);
    let frame_tx_capture = frame_tx.clone();

    // Spawn SCKit capture on a dedicated thread (required: SCKit callbacks
    // fire on the capture thread and must not be blocked).
    std::thread::spawn(move || {
        if let Err(e) = sckit_capture_loop(frame_tx_capture, screen_id, capture_all, window_id) {
            eprintln!("[SCKit capture] error: {e}");
        }
    });

    // Build axum router.
    let app = Router::new()
        .route("/", axum::routing::get(
            move |ws: WebSocketUpgrade, State(tx): State<Arc<broadcast::Sender<Arc<Vec<u8>>>>>| async move {
                ws.on_upgrade(move |socket| handle_ws_client(socket, tx))
            }
        ))
        .with_state(frame_tx);

    let server = axum::serve(listener, app);
    tokio::select! {
        res = server => {
            if let Err(e) = res { eprintln!("[WS server] error: {e}"); }
        }
        _ = shutdown_rx => {}
    }
}

#[cfg(target_os = "macos")]
async fn handle_ws_client(
    mut socket: axum::extract::ws::WebSocket,
    tx: std::sync::Arc<tokio::sync::broadcast::Sender<std::sync::Arc<Vec<u8>>>>,
) {
    use axum::extract::ws::Message;
    let mut rx = tx.subscribe();
    while STREAM_RUNNING.load(Ordering::Relaxed) {
        match rx.recv().await {
            Ok(frame) => {
                if socket.send(Message::Binary((*frame).clone())).await.is_err() {
                    break;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(_) => break,
        }
    }
}

/// Core capture loop: runs on its own OS thread. Pulls frames from SCKit,
/// encodes them as JPEG, and broadcasts to all connected WS clients.
#[cfg(target_os = "macos")]
fn sckit_capture_loop(
    frame_tx: std::sync::Arc<tokio::sync::broadcast::Sender<std::sync::Arc<Vec<u8>>>>,
    screen_id: usize,
    capture_all: bool,
    window_id: Option<u32>,
) -> Result<(), String> {
    use screencapturekit::prelude::*;
    use screencapturekit::cv::CVPixelBufferLockFlags;
    use std::sync::Arc;

    // Get all shareable content.
    let content = SCShareableContent::get().map_err(|e| format!("{e:?}"))?;

    // Build the content filter.
    let filter: SCContentFilter = if let Some(wid) = window_id {
        // Window capture
        let windows = content.windows();
        let win = windows.iter()
            .find(|w| w.window_id() == wid)
            .ok_or_else(|| format!("Window {wid} not found"))?;
        SCContentFilter::create().with_window(win).build()
    } else if capture_all {
        // All displays: use the first display (multi-display stitch via SCKit
        // requires separate streams; single display covers the full desktop).
        let display = content.displays().into_iter().next()
            .ok_or("No displays found")?;
        SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build()
    } else {
        let displays = content.displays();
        let display = displays.get(screen_id)
            .or_else(|| displays.first())
            .ok_or("No displays found")?;
        SCContentFilter::create()
            .with_display(display)
            .with_excluding_windows(&[])
            .build()
    };

    // Configuration: 720×405, BGRA, ~5 fps, queue_depth=3 (reduces lag), system audio.
    let config = SCStreamConfiguration::new()
        .with_width(720)
        .with_height(405)
        .with_pixel_format(PixelFormat::BGRA)
        .with_captures_audio(true)
        .with_sample_rate(48000)
        .with_channel_count(2)
        .with_queue_depth(3)
        .with_fps(5);

    let frame_tx_outer = Arc::clone(&frame_tx);

    let mut stream = SCStream::new(&filter, &config);

    stream.add_output_handler(
        move |sample: CMSampleBuffer, output_type: SCStreamOutputType| {
            if !matches!(output_type, SCStreamOutputType::Screen) {
                return;
            }
            if !STREAM_RUNNING.load(Ordering::Relaxed) { // global AtomicBool
                return;
            }

            let Some(pixel_buffer) = sample.image_buffer() else { return };
            let Ok(guard) = pixel_buffer.lock(CVPixelBufferLockFlags::READ_ONLY) else { return };

            let width = pixel_buffer.width();
            let height = pixel_buffer.height();
            let bytes_per_row = pixel_buffer.bytes_per_row();
            let raw = guard.as_slice();

            // Convert BGRA → RGB, respecting the row stride (bytes_per_row).
            // CVPixelBuffer rows are padded to alignment boundaries so
            // bytes_per_row >= width * 4.  Ignoring the stride causes the
            // horizontal scan-line corruption visible in the video preview.
            let mut rgb = vec![0u8; width * height * 3];
            for row in 0..height {
                let src_row_start = row * bytes_per_row;
                let dst_row_start = row * width * 3;
                for col in 0..width {
                    let s = src_row_start + col * 4;
                    let d = dst_row_start + col * 3;
                    if s + 2 < raw.len() {
                        rgb[d]     = raw[s + 2]; // R ← B channel in BGRA
                        rgb[d + 1] = raw[s + 1]; // G
                        rgb[d + 2] = raw[s];     // B ← R channel in BGRA
                    }
                }
            }

            // Encode as JPEG quality 55.
            let img = screenshots::image::RgbImage::from_raw(
                width as u32, height as u32, rgb,
            );
            let Some(img) = img else { return };
            let dyn_img = DynamicImage::ImageRgb8(img);
            let mut cursor = std::io::Cursor::new(Vec::with_capacity(60 * 1024));
            let encoder = screenshots::image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut cursor, 55,
            );
            if dyn_img.write_with_encoder(encoder).is_err() { return };

            let jpeg_bytes = Arc::new(cursor.into_inner());
            let _ = frame_tx_outer.send(jpeg_bytes);
        },
        SCStreamOutputType::Screen,
    );

    stream.start_capture().map_err(|e| format!("{e:?}"))?;

    // Keep the thread alive until STREAM_RUNNING is cleared.
    while STREAM_RUNNING.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let _ = stream.stop_capture();
    Ok(())
}

// ---------------------------------------------------------------------------
// Non-macOS (Windows): screenshots crate + axum WebSocket server
// ---------------------------------------------------------------------------
#[cfg(not(target_os = "macos"))]
async fn run_screenshots_ws_server(
    listener: tokio::net::TcpListener,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    screen_id: usize,
    capture_all: bool,
) {
    use std::sync::Arc;
    use tokio::sync::broadcast;
    use axum::{Router, extract::{WebSocketUpgrade, State}};
    use axum::extract::ws::Message;

    let (frame_tx, _) = broadcast::channel::<Arc<Vec<u8>>>(4);
    let frame_tx = Arc::new(frame_tx);
    let frame_tx_cap = frame_tx.clone();

    let screens = match Screen::all() {
        Ok(s) => s,
        Err(e) => { eprintln!("[screenshots] {e}"); return; }
    };
    let screens = Arc::new(screens);

    tauri::async_runtime::spawn(async move {
        while STREAM_RUNNING.load(Ordering::SeqCst) {
            let tick = std::time::Instant::now();
            let sc = Arc::clone(&screens);
            let tx = Arc::clone(&frame_tx_cap);

            let result = tokio::task::spawn_blocking(move || -> Option<Vec<u8>> {
                let raw_image = if capture_all {
                    let images: Vec<_> = sc.iter().filter_map(|s| s.capture().ok()).collect();
                    if images.is_empty() { return None; }
                    stitch_screens_horizontal(&images)
                } else {
                    let screen = *sc.get(screen_id)?;
                    screen.capture().ok()?
                };

                let small = screenshots::image::imageops::resize(
                    &raw_image, 720, 405, FilterType::Nearest,
                );
                let dyn_img = DynamicImage::from(small);
                let mut cursor = std::io::Cursor::new(Vec::with_capacity(80 * 1024));
                let encoder = screenshots::image::codecs::jpeg::JpegEncoder::new_with_quality(
                    &mut cursor, 55,
                );
                dyn_img.write_with_encoder(encoder).ok()?;
                Some(cursor.into_inner())
            }).await;

            if let Ok(Some(bytes)) = result {
                let _ = tx.send(Arc::new(bytes));
            }

            let elapsed = tick.elapsed();
            let budget = std::time::Duration::from_millis(200);
            if elapsed < budget {
                tokio::time::sleep(budget - elapsed).await;
            }
        }
    });

    let app = Router::new()
        .route("/", axum::routing::get(
            move |ws: WebSocketUpgrade, State(tx): State<Arc<broadcast::Sender<Arc<Vec<u8>>>>>| async move {
                ws.on_upgrade(move |mut socket| async move {
                    let mut rx = tx.subscribe();
                    while STREAM_RUNNING.load(Ordering::Relaxed) {
                        match rx.recv().await {
                            Ok(frame) => {
                                if socket.send(Message::Binary((*frame).clone())).await.is_err() {
                                    break;
                                }
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(_) => break,
                        }
                    }
                })
            }
        ))
        .with_state(frame_tx);

    let server = axum::serve(listener, app);
    tokio::select! {
        res = server => { if let Err(e) = res { eprintln!("[WS server] {e}"); } }
        _ = shutdown_rx => {}
    }
}

/// Capture a full-resolution PNG for AI screenshot analysis.
/// Priority: `window_id` (Some) > `capture_all` (true) > `screen_id`.
#[tauri::command]
async fn capture_screen_by_id(
    screen_id: usize,
    capture_all: bool,
    window_id: Option<u32>,
) -> Result<String, String> {
    let image: DynamicImage = if let Some(wid) = window_id {
        #[cfg(target_os = "macos")]
        {
            // For AI screenshots capture at higher resolution (1280 px wide)
            // so the AI has enough detail to read text.
            let rgba = capture_window_macos(wid, 1280)
                .ok_or_else(|| format!("Failed to capture window {wid}"))?;
            DynamicImage::from(rgba)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = wid;
            return Err("Window capture is only supported on macOS".to_string());
        }
    } else if capture_all {
        let screens = Screen::all().map_err(|e| e.to_string())?;
        let images: Vec<_> = screens.iter().filter_map(|s| s.capture().ok()).collect();
        if images.is_empty() {
            return Err("No screens available to capture".to_string());
        }
        DynamicImage::from(stitch_screens_horizontal(&images))
    } else {
        let screens = Screen::all().map_err(|e| e.to_string())?;
        let screen = screens
            .get(screen_id)
            .copied()
            .ok_or_else(|| format!("Screen {screen_id} not found"))?;
        DynamicImage::from(screen.capture().map_err(|e| e.to_string())?)
    };

    let mut buffer = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, screenshots::image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(buffer.into_inner());
    Ok(format!("data:image/png;base64,{b64}"))
}

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
            // On macOS, resizable must be true for maximized(true) to take effect;
            // the OS disables the zoom/maximize path for non-resizable windows.
            #[cfg(target_os = "macos")]
            let resizable = true;
            #[cfg(not(target_os = "macos"))]
            let resizable = false;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("CraftVita")
                .inner_size(1200.0, 800.0)
                .center()
                .resizable(resizable)
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
            // craftvita:// (e.g. the "Return to CraftVita" button in the
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
            list_screens, start_native_screen_stream, stop_native_screen_stream, capture_screen_by_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}