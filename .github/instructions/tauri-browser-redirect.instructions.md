---
description: "Use when implementing or modifying how the Tauri desktop app redirects users to the system browser, handles OAuth, opens external URLs, lazily creates the main dashboard window, or processes deep links. Apply when editing lib.rs open_main_dashboard command, WidgetApp.tsx login/billing/navigation links, GoogleOAuthButton.tsx, or App.tsx deep-link handler."
applyTo: "src-tauri/src/lib.rs,src/pages/Launcher/WidgetApp.tsx,src/components/GoogleOAuthButton.tsx,src/App.tsx"
---

# Tauri: Browser Redirect & External URL Handling

## Core Principle

**The `"main"` dashboard window does not exist at startup.** `tauri.conf.json` declares only the `launcher` and `mini` windows (`visible: false`). The dashboard is created lazily the first time `open_main_dashboard` is invoked.

## Window Architecture

| Label | HTML | Created by | Purpose |
|---|---|---|---|
| `launcher` | `launcher.html` | `show_launcher_widget()` in `lib.rs` on startup | Floating widget |
| `mini` | `floating.html` | Tauri command when a session becomes active | Session overlay |
| `main` | `index.html` | `open_main_dashboard` Tauri command (lazy) | Full dashboard |

---

## Opening the Dashboard / Navigation from the Launcher Widget

**Never use `invoke("open_main_dashboard", ...)` or `window.open()` from the launcher widget.** Both open URLs inside the Tauri webview. All dashboard navigation links in the launcher must open in the OS system browser via `@tauri-apps/plugin-opener`.

```ts
import { openUrl } from "@tauri-apps/plugin-opener";

// Always use the FRONTEND_URL constant (defined at the top of WidgetApp.tsx)
// const FRONTEND_URL = `https://${import.meta.env.VITE_FRONTEND_URL ?? "scribeshade-01-frontend.vercel.app"}`;

await openUrl(`${FRONTEND_URL}/dashboard`);
```

| Widget action | URL path |
|---|---|
| Login button | `/sign-in` |
| Dashboard menu item | `/dashboard` |
| Past sessions | `/sessions` |
| Billing | `/billing` |

The `open_main_dashboard` Tauri command still exists in `lib.rs` and remains valid for Rust-side deep-link handling. **Do not call it from the launcher frontend.**

---

## External URL → System Browser Guard

The `on_navigation` callback on the `"main"` window (in `open_main_dashboard`, `lib.rs`) intercepts every navigation:

```
tauri://…          → allowed inside webview
localhost / 127.0.0.1 / tauri.localhost  → allowed
*.razorpay.com / *.razorpay.in           → allowed (payment gateway)

Everything else    → opened in OS system browser via opener.open_url()
                     navigation cancelled (return false)
```

### To add a new domain that must open inside the webview

1. Add an `if host.ends_with("example.com") { return true; }` branch to the `on_navigation` closure in `lib.rs`.
2. If the domain requires network access, add it to `src-tauri/capabilities/default.json`.

### To open an external URL from the launcher widget

Use the platform `openUrl()` function from `@tauri-apps/plugin-opener`, not `window.open`:

```ts
import { openUrl } from "@tauri-apps/plugin-opener";
await openUrl("https://example.com");
```

`window.open` also works because all webview windows share the same navigation guard, but `openUrl()` is explicit and avoids creating blank webview tabs.

---

## Google OAuth Flow

The desktop app **never opens the OAuth provider inside the webview.** The canonical flow:

| Step | Code location | What happens |
|---|---|---|
| 1 | `GoogleOAuthButton.tsx` | `tauri-plugin-oauth` starts local HTTP server on port **10001** |
| 2 | `GoogleOAuthButton.tsx` | `listen("oauth://url", …)` registers Tauri event listener |
| 3 | `GoogleOAuthButton.tsx` | Clerk generates Google auth URL with `redirectUrl: "http://localhost:10001"` |
| 4 | `GoogleOAuthButton.tsx` | `openUrl(authUrl)` via `tauri-plugin-opener` → **system browser** |
| 5 | (browser) | User signs in; browser hits `http://localhost:10001` |
| 6 | `GoogleOAuthButton.tsx` | `oauth://url` event fires; `window.history.replaceState` sets Clerk params |
| 7 | `GoogleOAuthButton.tsx` | `handleRedirectCallback()` → `navigate("/dashboard")` |
| 8 | `GoogleOAuthButton.tsx` | Local server shut down via `cancel(port)` after 3 s |

**Do not change port 10001** without also updating the allowed redirect URLs in the Clerk dashboard and any platform firewall rules.

---

## Deep Links (`craftvita://`)

The `craftvita` URL scheme is registered in `tauri.conf.json`. The flow when the OS delivers a deep link:

**Rust (`lib.rs` `on_open_url`):**
- If `"main"` window exists → `show()` + `set_focus()`
- If not → show the `"launcher"` widget instead

**Frontend (`src/App.tsx` `onOpenUrl`):**
```ts
if (url.startsWith("craftvita://oauth-callback")) {
  navigate(`/sso-callback${new URL(url).search}`);
}
```

Rules:
- Always gate `onOpenUrl` calls with `isTauri()` — this API does not exist in the web deployment.
- Handle unknown `craftvita://` paths gracefully (log and ignore); never throw.

---

## Tauri Detection

```ts
import { isTauri } from "@/lib/utils";

if (isTauri()) {
  // desktop path
} else {
  // web browser fallback
}
```

- `isTauri()` checks `"__TAURI__" in window` at runtime.
- **Never** use `process.env`, `import.meta.env`, or user-agent sniffing for this.
- Gate _all_ `@tauri-apps/*` imports behind `isTauri()` or dynamic `import()` to avoid crashes in the web deployment.

---

## Clerk Configuration

Both `src/main.tsx` and `src/pages/Launcher/WidgetApp.tsx` must include `"tauri:"` in `allowedRedirectProtocols`:

```tsx
<ClerkProvider
  publishableKey={PUBLISHABLE_KEY}
  allowedRedirectProtocols={["tauri:", "http:", "https:"]}
>
```

Omitting `"tauri:"` causes Clerk to silently block redirect URIs in the desktop app, breaking OAuth.
