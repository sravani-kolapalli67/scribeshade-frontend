#!/usr/bin/env bash
set -euo pipefail

: "${MACOS_SELF_SIGNED_CERTIFICATE:?MACOS_SELF_SIGNED_CERTIFICATE is required}"
: "${MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD:?MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD is required}"

TMP_P12="${RUNNER_TEMP:-/tmp}/scribeshade-selfsigned.p12"
KEYCHAIN_NAME="${MACOS_SELF_SIGNED_KEYCHAIN_NAME:-build.keychain}"

echo "$MACOS_SELF_SIGNED_CERTIFICATE" | base64 --decode > "$TMP_P12"

security create-keychain -p "$MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD" "$KEYCHAIN_NAME"
security default-keychain -s "$KEYCHAIN_NAME"
security unlock-keychain -p "$MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD" "$KEYCHAIN_NAME"
security import "$TMP_P12" \
  -k "$KEYCHAIN_NAME" \
  -P "$MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign

security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$MACOS_SELF_SIGNED_CERTIFICATE_PASSWORD" \
  "$KEYCHAIN_NAME"

security find-identity -v -p codesigning "$KEYCHAIN_NAME"

rm -f "$TMP_P12"
