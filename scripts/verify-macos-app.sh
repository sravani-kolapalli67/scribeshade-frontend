#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-/Applications/ScribeShade.app}"
EXPECTED_IDENTIFIER="${EXPECTED_IDENTIFIER:-com.hiddenmindsolutions.scribeshade-frontend}"
EXPECTED_AUTHORITY="${EXPECTED_AUTHORITY:-}"

if [ ! -d "$APP_PATH" ]; then
  echo "App not found at: $APP_PATH" >&2
  exit 1
fi

echo "Inspecting app identity and signature: $APP_PATH"
SIGN_INFO="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1)"
echo "$SIGN_INFO"

if ! echo "$SIGN_INFO" | grep -q "Identifier=${EXPECTED_IDENTIFIER}"; then
  echo "Identifier mismatch. Expected: ${EXPECTED_IDENTIFIER}" >&2
  exit 1
fi

if [ -n "$EXPECTED_AUTHORITY" ]; then
  if ! echo "$SIGN_INFO" | grep -q "Authority=${EXPECTED_AUTHORITY}"; then
    echo "Authority mismatch. Expected Authority=${EXPECTED_AUTHORITY}" >&2
    exit 1
  fi
fi

echo "Verifying signature integrity"
codesign --verify --deep --strict --verbose=4 "$APP_PATH"

echo "Assessing Gatekeeper policy"
if ! spctl --assess --type execute --verbose=4 "$APP_PATH"; then
  echo "WARNING: spctl assessment failed (expected for non-notarized/self-signed apps)." >&2
fi

echo "Dumping effective entitlements"
codesign -d --entitlements :- "$APP_PATH"

echo "Verification complete."
