#!/bin/bash
# Bump the version across package.json, tauri.conf.json, and Cargo.toml
# Usage: ./bump-version.sh patch | minor | major

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 patch|minor|major"
  exit 1
fi

# 1. Bump package.json (this is the source of truth)
npm version "$1" --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")

# 2. Update src-tauri/tauri.conf.json
jq --arg v "$NEW_VERSION" '.version = $v' src-tauri/tauri.conf.json > /tmp/tauri.conf.tmp.json \
  && mv /tmp/tauri.conf.tmp.json src-tauri/tauri.conf.json

# 3. Update src-tauri/Cargo.toml (first occurrence of version = "..." under [package])
sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml

echo "✓ Bumped to v$NEW_VERSION"
echo "  → package.json"
echo "  → src-tauri/tauri.conf.json"
echo "  → src-tauri/Cargo.toml"
