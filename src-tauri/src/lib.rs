use std::fs;
use std::path::Path;

// Existing greet command stays
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// New command to upload resume
#[tauri::command]
fn upload_resume(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err("File does not exist".into());
    }

    let ext = file_path.extension().and_then(|s| s.to_str()).unwrap_or("");
    if ext != "pdf" && ext != "docx" {
        return Err("Only PDF or DOCX files are allowed".into());
    }

    let dest_dir = std::env::current_dir().unwrap().join("uploaded_resumes");
    fs::create_dir_all(&dest_dir).unwrap();
    let dest_path = dest_dir.join(file_path.file_name().unwrap());
    fs::copy(file_path, &dest_path).map_err(|e| e.to_string())?;

    Ok(dest_path.to_str().unwrap().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // .plugin(tauri_plugin_opener::init())
        // .invoke_handler(tauri::generate_handler![greet, upload_resume])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}