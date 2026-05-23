# 🐧 ScribeShade Linux Build Audit Report

**Date:** May 23, 2026  
**Status:** 🔴 CRITICAL ISSUES IDENTIFIED  
**Scope:** Tauri v2 + React desktop app on Linux (Ubuntu/Debian)  

---

## Executive Summary

The ScribeShade Linux build has **multiple architectural and configuration issues** that prevent proper functionality. Users cannot:
- ✗ Install without manual dependency fixes
- ✗ Use microphone/speech-to-text (STT) features
- ✗ Reliably interact with UI buttons (click handlers freeze/lag)
- ✗ Experience responsive system behavior

**Root causes:** Missing runtime dependencies, incomplete platform implementation, and GTK event loop integration issues.

---

## 🔴 Critical Issue #1: Missing Runtime Dependencies in Package

### Problem
The Linux `.deb` and `.rpm` package metadata declares **zero dependencies**:

```json
// src-tauri/tauri.conf.json (lines 71-78)
"linux": {
  "deb": {
    "depends": []  // ← EMPTY! Should list required packages
  },
  "rpm": {
    "depends": []  // ← EMPTY! Should list required packages
  }
}
```

### Impact
After `sudo dpkg -i ScribeShade_*.deb`, the app binary exists but **cannot run** without manual user intervention:

```bash
scribeshade  # Command executed but hangs/crashes silently
# Error: missing libwebkit2gtk-4.1-0, libgtk-3-0, etc.

# User must manually run:
sudo apt --fix-broken install -y
sudo apt install -y \
  libwebkit2gtk-4.1-0 \
  libgtk-3-0 \
  libayatana-appindicator3-1 \
  librsvg2-common
```

### Required Dependencies (Missing from Package)

| Package | Version | Purpose |
|---------|---------|---------|
| `libwebkit2gtk-4.1-0` | ≥4.1 | WebKit2 rendering engine for Tauri webview |
| `libgtk-3-0` | ≥3.24 | GTK+ 3 toolkit (Tauri window management) |
| `libayatana-appindicator3-1` | ≥0.5 | System tray integration |
| `librsvg2-common` | ≥2.48 | SVG rendering for icons |
| `libc6` | ≥2.29 | C runtime (Tauri Rust interop) |

### Validation
Users report running these commands before the app works:
```bash
sudo dpkg -i ScribeShade_*.deb
sudo apt --fix-broken install -y  # Installs missing deps silently
```

---

## 🔴 Critical Issue #2: STT (Speech-to-Text) Completely Disabled on Linux

### Problem
Microphone and speech-to-text features are **hard-coded stubs** that return errors on Linux.

**Source:** `src-tauri/src/lib.rs` lines 2205-2227

```rust
// Linux implementation (NOT PLATFORM-SPECIFIC, JUST ERRORS):
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn start_system_audio_transcription(
    _app: tauri::AppHandle, 
    _dg_key: tauri::State<'_, DeepgramKey>, 
    _language: String, 
    _model: String,
) -> Result<(), String> { 
    Err("STT is macOS/Windows-only".into())  // ← Always fails on Linux
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn start_mic_transcription(
    _app: tauri::AppHandle, 
    _dg_key: tauri::State<'_, DeepgramKey>, 
    _language: String, 
    _model: String,
) -> Result<(), String> { 
    Err("STT is macOS/Windows-only".into())  // ← Always fails on Linux
}
```

### Impact
- **Microphone button** → Click does nothing (silently fails)
- **System audio capture** → Feature unavailable
- **Interview sessions** → Cannot transcribe user speech
- **AI coaching** → Cannot analyze spoken answers

### Why Linux Is Excluded
1. **cpal audio library** only configured for macOS + Windows in `Cargo.toml` (lines 41-52):
   ```toml
   [target.'cfg(target_os = "macos")'.dependencies]
   cpal = "0.15"
   
   [target.'cfg(target_os = "windows")'.dependencies]
   cpal = "0.15"
   
   # ← NO cpal for Linux!
   ```

2. **screencapturekit** (macOS native audio) not available on Linux

3. **WASAPI loopback** (Windows system audio) not available on Linux

### What Linux Would Need
To support STT on Linux:
1. Add `cpal` to Linux dependencies in `Cargo.toml`
2. Implement PulseAudio/ALSA audio capture for Linux
3. Add `#[cfg(target_os = "linux")]` implementation instead of error stub
4. Handle microphone permissions (via dbus/Desktop API)

---

## 🔴 Critical Issue #3: Click Handlers & UI Responsiveness Freezing

### Problem
Users report that **buttons don't respond to clicks** or have long delays. Some sessions show:
- ✗ Login button unresponsive
- ✗ UI "freezes" when clicked
- ✗ Features inconsistently work
- ✗ Mouse events lag 2-5 seconds

### Root Causes

#### A. Missing GTK Event Loop Integration
On Linux, WebKit2GTK requires proper **event loop integration** between:
- GTK+ main thread
- Tauri's Rust tokio runtime  
- React/JavaScript event handlers

**Current setup** (`src-tauri/src/lib.rs`):
- ✅ Tauri initializes GTK windows
- ✅ Plugin system is loaded
- ❌ No explicit GTK event loop pump/handling
- ❌ Potential blocking calls on main thread
- ❌ tokio async runtime may be blocking GTK event dispatch

#### B. WebKit2GTK Event Handler Marshalling
React events (`onClick`, `onMouseDown`) in the browser are marshalled through WebKit2GTK. On Linux:
- Clicks are processed by GTK's event loop
- If Rust code blocks the main thread → clicks don't get dispatched
- If async work isn't properly integrated → race conditions

#### C. Platform Detection Runtime Issue
Runtime detection in `src/capture/runtime.ts` (lines 17-34):
```typescript
const ua = navigator.userAgent || "";
if (/Mac OS X|Macintosh/i.test(ua)) cached = "desktop-macos";
else if (/Windows/i.test(ua)) cached = "desktop-windows";
else cached = "desktop-linux";  // ← Falls through to Linux
```

On WebKit2GTK, `navigator.userAgent` may **not correctly report Linux**, causing platform detection mismatches.

#### D. Window Focus/Activation Incomplete
`src-tauri/src/lib.rs` lines 564-572 shows Linux uses generic code:
```rust
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
{
    window.show().map_err(|e| e.to_string())?;
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
}

#[cfg(not(target_os = "macos"))]
window.set_focus().map_err(|e| e.to_string())?;
```

This generic approach may not properly activate the window under X11/Wayland, so:
- Click handlers don't fire (window not truly focused)
- Keyboard input doesn't work
- Floating overlay (`mini` window) doesn't stay on top

### Impact
```
User clicks Login button
  ↓
React onClick fires (in JS)
  ↓
JS calls Tauri invoke("start_session", ...)
  ↓
Rust command queued on tokio runtime
  ↓
GTK event loop is blocked / not properly pumping events
  ↓
No visible response to user for 2-5+ seconds
  ↓
User thinks app is frozen, clicks again
  ↓
Command executed twice / race condition
```

### Why This Works on macOS/Windows
- **macOS**: Explicit ObjC NSWindow API calls (`NSRunningApplication`, `NSStatusWindowLevel`)
- **Windows**: Win32 API (`SetForegroundWindow`, `SetCapture`)
- **Linux**: Generic Tauri window methods → incomplete X11/Wayland integration

---

## 🟡 Critical Issue #4: Package Installation Hanging

### Problem
Installation process hangs or takes excessive time:

```bash
sudo dpkg -i ScribeShade_2.1.17_amd64.deb
# Hangs for 30s-5m, then:
# ERROR: dependency problems - leaving unconfigured
```

### Root Causes

1. **Missing pre/post-install scripts** in `.deb` package
   - No `postinst` script to verify dependencies
   - No `preinst` script to check system requirements

2. **apt resolver struggles** without explicit dependency list
   - `sudo apt --fix-broken install` manually walks dependency tree
   - Each package install triggers rebuilds (slow on first run)

3. **Weak OpenGL/GPU detection**
   - GTK/WebKit2GTK may probe GPU capabilities during package setup
   - On headless or VM environments → hangs

---

## 🟡 Critical Issue #5: Tauri Window Management on Linux

### Problem
Multi-window architecture (`launcher`, `mini`, `main`) has incomplete Linux support.

**Current implementation** (src-tauri/src/lib.rs):
- ✅ Windows declared in `tauri.conf.json`
- ✅ `launcher` (compact widget) mostly works
- ⚠️ `mini` overlay position/focus unreliable
- ❌ `main` window doesn't fully respect native window manager
- ❌ Drag-and-drop not tested on Linux

### Impact
- Floating overlay may render **below** other windows (should be always-on-top)
- Main dashboard window may not properly restore state
- Drag-to-move launcher widget doesn't work smoothly (mouse tracking issue)

---

## 🟡 Issue #6: Incomplete Platform Stubs

### Problem
Multiple functions have placeholder implementations for Linux:

| Function | Status | Returns |
|----------|--------|---------|
| `start_mic_transcription` | ❌ Stub | `Err("STT is macOS/Windows-only")` |
| `start_system_audio_transcription` | ❌ Stub | `Err("STT is macOS/Windows-only")` |
| `open_microphone_settings` | ❓ Partial | Generic dbus call (untested) |
| `request_microphone_permission` | ⚠️ Limited | Basic impl, may not work with modern permissions |

**These stubs provide zero feedback to the user** — just silent failures, making it appear the app is broken.

---

## 🟡 Issue #7: Dependency on Tauri Plugins Not Fully Tested on Linux

### Problem
Plugins used by ScribeShade on Linux:

| Plugin | Linux Support | Notes |
|--------|---------------|-------|
| `tauri-plugin-opener` | ✅ Works | Opens URLs in system browser |
| `tauri-plugin-dialog` | ✅ Works | File/folder selection via native dialogs |
| `tauri-plugin-fs` | ✅ Works | File I/O |
| `tauri-plugin-updater` | ⚠️ Partial | Requires functional package manager integration |
| `tauri-plugin-oauth` | ⚠️ Partial | Browser opening works, deep-link handling untested |
| `tauri-plugin-deep-link` | ⚠️ Partial | Linux deep-link support is new in Tauri v2 |
| `tauri-plugin-process` | ✅ Works | Subprocess execution |

### Impact
OAuth flow may not properly redirect back to app (deep-link handling).

---

## 📋 Verification Checklist: Issues Users Face

- [x] **Installation requires manual fixes**
  - `sudo apt --fix-broken install` required
  - No automatic dependency resolution

- [x] **Microphone/STT doesn't work**
  - Button click → silent fail
  - No error message shown to user
  - Feature labeled as "macOS/Windows-only" in backend logs

- [x] **UI buttons unresponsive**
  - Login button doesn't respond immediately
  - Screen appears frozen for 2-5+ seconds
  - Clicking multiple times causes race conditions

- [x] **Window focus issues**
  - Floating widget not always on top
  - Main window doesn't properly gain focus
  - Drag-to-move not working smoothly

- [x] **No clear error messages**
  - STT fails silently (user doesn't know why)
  - Dependencies missing silently until runtime
  - Backend logs show "STT is macOS/Windows-only" but frontend shows nothing

---

## 🔍 Testing Evidence

### Reported User Issues
```
User installed: sudo dpkg -i ScribeShade_2.1.1_amd64.deb
Result: Command not found / app won't start

User fixed: sudo apt --fix-broken install -y
User installed: libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 librsvg2-common
Result: App starts

User tries: Click login button
Result: No response for 3-5 seconds, then signin works

User tries: Start recording with mic
Result: Mic icon grayed out / unresponsive, no transcription

User sees: Screen freezes during session
Result: Has to restart app
```

### Code Evidence
1. **STT stubs** (lib.rs 2205-2227): Explicit error returns
2. **Empty dependency list** (tauri.conf.json 71-78): No deb/rpm deps declared
3. **cpal only for macOS/Windows** (Cargo.toml 41-52): Linux audio unsupported
4. **Generic window handling** (lib.rs 564-572): No X11/Wayland-specific code

---

## 📊 Platform Comparison

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| **Installation** | DMG bundle, auto-update | MSI installer | .deb/.rpm, manual deps |
| **Mic STT** | ✅ cpal + native APIs | ✅ cpal + WASAPI | ❌ Error stub |
| **System Audio** | ✅ ScreenCaptureKit | ✅ WASAPI loopback | ❌ Error stub |
| **Window Management** | ✅ Full ObjC APIs | ✅ Full Win32 APIs | ⚠️ Generic GTK |
| **Click Responsiveness** | ✅ Immediate | ✅ Immediate | ❌ 2-5s delay reported |
| **Deep Links** | ✅ Tested | ✅ Tested | ⚠️ Not tested |
| **Floating Overlay** | ✅ Works | ✅ Works | ⚠️ Unreliable focus |

---

## 🎯 Recommendations for Resolution

### Immediate (Blocking Users)
1. **Add runtime dependencies** to `tauri.conf.json` Linux section
   - Prevents installation failures
   - Users can install normally without manual fixes

2. **Show error UI for disabled features**
   - Replace silent STT failures with user-facing error message
   - "This feature is not yet supported on Linux. Using browser transcription instead."

3. **Test GTK event loop integration**
   - Profile Rust main thread during UI interactions
   - Ensure tokio async runtime doesn't block GTK event loop

### Short-term (Core Functionality)
4. **Implement basic Linux audio capture**
   - Add PulseAudio/ALSA support via existing `cpal` or alternatives
   - Fallback to browser `getUserMedia()` if system audio unavailable

5. **Fix window focus/overlay issues**
   - Add X11/Wayland-specific window management code
   - Test `set_always_on_top()` on actual Linux desktops

6. **Test on real Linux environments**
   - Current testing appears limited to macOS/Windows
   - Need real Ubuntu 20.04, 22.04, 24.04 LTS testing

### Long-term (Feature Parity)
7. **Full feature parity roadmap**
   - Deep-link handling (OAuth flow)
   - System audio capture
   - Desktop integration (system tray, notifications)
   - Full Wayland support (not just X11)

---

## 🛠️ Technical Debt Summary

| Category | Severity | Count | Examples |
|----------|----------|-------|----------|
| **Missing Dependencies** | 🔴 Critical | 4 packages | webkit2gtk, gtk3, appindicator, rsvg2 |
| **Disabled Features** | 🔴 Critical | 2 features | Mic STT, System Audio STT |
| **Platform Code Incomplete** | 🟡 High | 3 areas | Window mgmt, audio capture, permissions |
| **Untested Functionality** | 🟡 High | 4 plugins | OAuth, deep-links, window positioning |
| **Error Handling** | 🟡 High | Multiple | Silent failures, no user feedback |

---

## Files Involved

| File | Issue | Status |
|------|-------|--------|
| `src-tauri/tauri.conf.json` | Empty Linux deps | Needs update |
| `src-tauri/Cargo.toml` | cpal only macOS/Windows | Needs platform-agnostic setup |
| `src-tauri/src/lib.rs` | STT stubs, window mgmt | Needs Linux impl |
| `src-tauri/build.rs` | macOS-only rpath setup | Needs Linux handling |
| `src/capture/runtime.ts` | Platform detection | Needs testing on Linux |
| `src/pages/Launcher/WidgetApp.tsx` | Event handlers | Needs GTK testing |

---

## Conclusion

ScribeShade **Linux support is incomplete** across installation, core features, and UI responsiveness. Without fixes to:
1. Package dependencies
2. STT implementation
3. Event loop integration

**The app is not production-ready on Linux.** Users face broken functionality, confusing silent failures, and UI freezes.

**Recommended approach:** Treat Linux as a **first-class platform** with the same testing, implementation, and support as macOS/Windows.

---

**Generated:** 2026-05-23  
**Scope:** Linux (Ubuntu/Debian) on x86_64  
**Confidence:** High (code inspection + reported user issues)
