---
description: "Use when writing, editing, or reviewing any Tauri Rust code (lib.rs, build.rs, Cargo.toml, tauri.conf.json, capabilities). Enforces Windows + macOS + Linux cross-platform parity: cfg gates, OS-specific crate usage, stubs for non-supported platforms, window management, audio, rpath, and capability declarations."
applyTo: "src-tauri/**"
---

# Tauri Cross-Platform Rules (Windows · macOS · Linux)

Every change to `src-tauri/` must compile and behave correctly on all three platforms. Follow these
rules without exception.

---

## 1. Platform Decision Matrix

Before writing any OS-level code, walk this decision tree:

```
Is there a Tauri built-in plugin (tauri-plugin-fs, tauri-plugin-shell, etc.)?
  → YES: Use it. It is already cross-platform.
  → NO ↓
Is there a pure-Rust cross-platform crate (notify, cpal, arboard, sysinfo, …)?
  → YES: Prefer it over platform-specific code.
  → NO ↓
Use #[cfg(target_os = …)] branches — one per OS, plus a fallback.
```

---

## 2. cfg Gate Rules

### Every platform-specific block needs a matching fallback

```rust
// ✅ CORRECT — all three platforms covered
#[cfg(target_os = "macos")]
fn do_thing() { /* objc2 / screencapturekit */ }

#[cfg(target_os = "windows")]
fn do_thing() { /* windows-rs / winvd */ }

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn do_thing() { /* Linux: gtk / x11 / wayland stub or implementation */ }
```

```rust
// ❌ WRONG — Linux has no implementation, won't compile on Linux
#[cfg(target_os = "macos")]
fn do_thing() { … }

#[cfg(not(target_os = "macos"))]  // ← silently excludes Linux fallback differentiation
fn do_thing() { … }
```

### Tauri commands must have stubs for every platform

If a command is only implemented on one OS, provide a stub `Result` for all others:

```rust
#[cfg(target_os = "macos")]
#[tauri::command]
async fn start_display_audio_stream() -> Result<u16, String> { … }

#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_display_audio_stream() -> Result<u16, String> {
    Err("Display audio capture is not supported on Windows".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn start_display_audio_stream() -> Result<u16, String> {
    Err("Display audio capture is not supported on Linux".into())
}
```

---

## 3. Cargo.toml — Platform-Scoped Dependencies

Use `[target.'cfg(…)'.dependencies]` for every OS-specific crate. Never put
platform-only crates in `[dependencies]`.

```toml
# ✅ Platform-scoped
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-app-kit = { version = "0.3", features = ["NSWindow"] }
screencapturekit = { version = "1", features = ["macos_13_0"] }
cpal = "0.15"

[target.'cfg(target_os = "windows")'.dependencies]
winvd = "0.0.49"
windows = { version = "0.58", features = ["Win32_Foundation", "Win32_Graphics_Dwm", "Win32_UI_WindowsAndMessaging", "Win32_UI_Shell"] }

# Linux-specific crates go here if needed
# [target.'cfg(target_os = "linux")'.dependencies]
# gtk = "0.18"
```

---

## 4. Window Management — OS Parity

Every window-level OS customization block must cover all three platforms. Use
this pattern for the shared operations: `show_mini_top_center`, `show_launcher_widget`,
`set_mini_state`, and any future window positioning commands.

```rust
// macOS: NSStatusWindowLevel + canJoinAllSpaces
#[cfg(target_os = "macos")]
{
    const NS_STATUS_WINDOW_LEVEL: i64 = 25;
    unsafe {
        let ns_win = window.ns_window().map_err(|e| e.to_string())?;
        let ns_win_ptr = ns_win as *mut objc2::runtime::AnyObject;
        let _: () = objc2::msg_send![ns_win_ptr, setLevel: NS_STATUS_WINDOW_LEVEL];
        let behavior: u64 = 1 | 16 | 64; // canJoinAllSpaces | stationary | ignoresCycle
        let _: () = objc2::msg_send![ns_win_ptr, setCollectionBehavior: behavior];
    }
}

// Windows: pin to all virtual desktops + strip DWM chrome
#[cfg(target_os = "windows")]
{
    if let Ok(hwnd) = window.hwnd() {
        let win_hwnd = windows::Win32::Foundation::HWND(hwnd.0);
        let _ = winvd::pin_window(win_hwnd);
        remove_window_border(win_hwnd);
    }
}

// Linux: no equivalent — set_always_on_top(true) is sufficient via Tauri
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
{
    // set_always_on_top is handled generically above this block
}
```

---

## 5. build.rs — rpath Order (macOS)

When adding Swift/screencapturekit rpath entries in `build.rs`, the **system path
must come first** to prevent `dyld` from loading duplicate Swift runtime copies:

```rust
// ✅ CORRECT — system path first
println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
println!("cargo:rustc-link-arg=-Wl,-rpath,{toolchain_swift}");
println!("cargo:rustc-link-arg=-Wl,-rpath,{toolchain_swift55}");
println!("cargo:rustc-link-arg=-Wl,-rpath,{sdk_swift}");

// ❌ WRONG — toolchain first causes "Class implemented in both …" ObjC warnings
println!("cargo:rustc-link-arg=-Wl,-rpath,{toolchain_swift}");
…
println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift"); // too late
```

All `build.rs` rpath blocks must be wrapped in `#[cfg(target_os = "macos")]` so
they have no effect on Windows or Linux builds.

---

## 6. tauri.conf.json — Cross-Platform Window Properties

### Transparency
`"transparent": true` requires `"macOSPrivateApi": true` in the `app` object on macOS.
Always add it whenever any window uses transparency:

```json
{
  "app": {
    "macOSPrivateApi": true,
    "windows": [ … ]
  }
}
```

### Window properties compatibility matrix

| Property | macOS | Windows | Linux |
|---|---|---|---|
| `decorations: false` | ✅ | ✅ | ✅ |
| `transparent: true` | Requires `macOSPrivateApi` | ✅ | Compositor-dependent |
| `alwaysOnTop: true` | Level 3 (can be beaten) | ✅ | ✅ |
| `visibleOnAllWorkspaces` | ✅ via `canJoinAllSpaces` | Via `winvd::pin_window` | N/A |
| `skipTaskbar` | ✅ | ✅ | ✅ |

When `alwaysOnTop: true` is not strong enough on macOS, elevate to
`NSStatusWindowLevel (25)` via `objc2::msg_send!` (see §4 above).

---

## 7. Capabilities

Every new `#[tauri::command]` or plugin must be declared in
`src-tauri/capabilities/default.json`. The `"windows"` array in capabilities
currently uses `"*"` (all windows). This is acceptable for this project.

```json
{
  "permissions": [
    "core:default",
    "core:window:allow-<new-permission>"
  ]
}
```

New permissions to add when introducing commands that touch:
- File I/O → `fs:read-all` / `fs:write-all`  
- Shell → `shell:allow-open`  
- Notifications → `notification:default`  
- Clipboard → `clipboard-manager:default`

---

## 8. Rust Safety in Commands

- **Never** use `.unwrap()` or `.expect()` inside `#[tauri::command]` handlers.
  Always return `Result<T, String>` and use `.map_err(|e| e.to_string())?`.
- All blocking OS calls (file I/O, audio device enumeration, display capture init)
  must run in `tokio::task::spawn_blocking` or a dedicated `std::thread::spawn`.
- State shared across commands: `Arc<Mutex<T>>` (write-heavy) or `Arc<RwLock<T>>`
  (read-heavy), registered via `.manage(…)` in `run()`.
- Never store `WebviewWindow` handles across `async` boundaries — use `AppHandle`.

---

## 9. Audio — Platform Coverage

| Feature | macOS | Windows | Linux |
|---|---|---|---|
| Mic capture | `cpal` (default input device) | `cpal` (same) | `cpal` (same) |
| Display/system audio | `screencapturekit` (macOS 13+) | Not supported — return `Err(…)` | Not supported — return `Err(…)` |
| List audio devices | `cpal` host enumeration | `cpal` host enumeration | `cpal` host enumeration |

`screencapturekit` is macOS-only. Its commands (`start_display_audio_stream`,
`stop_display_audio_stream`) must always have stub implementations for Windows
and Linux that return a descriptive `Err(String)`.

---

## 10. Validation Checklist

Run before every commit that touches `src-tauri/`:

```sh
# 1. Check all three targets compile (macOS host — cross-check with CI for others)
cargo build --manifest-path src-tauri/Cargo.toml

# 2. Confirm no new warnings (-D warnings catches unused cfg blocks)
cargo rustc --manifest-path src-tauri/Cargo.toml -- -D warnings

# 3. Verify tauri.conf.json is valid
cargo tauri dev --no-dev-server  # or: cargo tauri build
```

**Mental checklist for every change:**
- [ ] Added `#[cfg(target_os = "macos")]` block? → Added Windows + Linux stubs/impl.
- [ ] Added `#[cfg(target_os = "windows")]` block? → Added macOS + Linux stubs/impl.
- [ ] New OS-specific crate in `Cargo.toml`? → Scoped under `[target.'cfg(…)'.dependencies]`.
- [ ] Window uses `transparent: true`? → `macOSPrivateApi: true` in `tauri.conf.json`.
- [ ] New `#[tauri::command]`? → Registered in `invoke_handler!` + declared in `capabilities/default.json`.
- [ ] rpath added in `build.rs`? → System path `/usr/lib/swift` comes first.
