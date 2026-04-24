use tauri::{Manager, WebviewWindowBuilder, WebviewUrl, AppHandle, Window, PhysicalPosition};
use screenshots::Screen;
use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
fn toggle_floating(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("floating") {
        win.close().map_err(|e| e.to_string())?;
    } else {
        WebviewWindowBuilder::new(&app, "floating", WebviewUrl::App("floating.html".into()))
            .title("Mini Overlay")
            .inner_size(300f64, 200f64)
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
    window.show().unwrap();

    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            let _ = winvd::pin_window(windows::Win32::Foundation::HWND(hwnd.0));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() { 
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![toggle_floating, capture_screen, show_mini_top_center])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}