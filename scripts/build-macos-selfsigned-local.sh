#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

MACOS_SELF_SIGNING_IDENTITY="${MACOS_SELF_SIGNING_IDENTITY:-ScribeShade Local Code Signing}"
LOCAL_CONFIG_PATH="src-tauri/tauri.macos.selfsigned.local.conf.json"

cat > "${LOCAL_CONFIG_PATH}" <<EOF
{
  "bundle": {
    "macOS": {
      "infoPlist": "Info.plist",
      "entitlements": "entitlements.plist",
      "minimumSystemVersion": "13.0",
      "signingIdentity": "${MACOS_SELF_SIGNING_IDENTITY}"
    }
  }
}
EOF

echo "Building self-signed macOS app with identity: ${MACOS_SELF_SIGNING_IDENTITY}"
pnpm tauri build --target universal-apple-darwin --config "${LOCAL_CONFIG_PATH}"

APP_PATH="$(find src-tauri/target/universal-apple-darwin/release/bundle/macos -maxdepth 1 -type d -name "*.app" | head -n 1 || true)"
if [ -z "${APP_PATH}" ]; then
  APP_PATH="$(find src-tauri/target/release/bundle/macos -maxdepth 1 -type d -name "*.app" | head -n 1 || true)"
fi

if [ -z "${APP_PATH}" ]; then
  echo "ERROR: Could not find built .app bundle." >&2
  echo "Checked:" >&2
  echo "  src-tauri/target/universal-apple-darwin/release/bundle/macos/*.app" >&2
  echo "  src-tauri/target/release/bundle/macos/*.app" >&2
  exit 1
fi

echo "Built app: ${APP_PATH}"
echo
echo "Inspecting signature:"
codesign -dv --verbose=4 "${APP_PATH}"
echo
echo "Verifying signature integrity:"
codesign --verify --deep --strict --verbose=4 "${APP_PATH}"
echo
echo "Dumping effective entitlements:"
codesign -d --entitlements :- "${APP_PATH}"

echo
echo "Next steps:"
echo "1. Copy app to /Applications"
echo "   cp -R \"${APP_PATH}\" /Applications/ScribeShade.app"
echo "2. Remove quarantine"
echo "   xattr -dr com.apple.quarantine /Applications/ScribeShade.app"
echo "3. Open app"
echo "   open /Applications/ScribeShade.app"
echo "4. Grant Microphone and Screen/System Audio Recording permissions in System Settings"
echo "5. Fully quit and reopen ScribeShade after enabling Screen Recording permission"
