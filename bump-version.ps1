# Bump the version across package.json, tauri.conf.json, and Cargo.toml
# Usage: .\bump-version.ps1 patch | minor | major

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("patch","minor","major")]
    [string]$BumpType
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# 1. Bump package.json
npm version $BumpType --no-git-tag-version | Out-Null

$NewVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Bumping to v$NewVersion ..."

# 2. Update src-tauri/tauri.conf.json
$TauriConf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$TauriConf.version = $NewVersion
# Use UTF8NoBOM to avoid a BOM that breaks Tauri's JSON parser
$json = $TauriConf | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText(
    (Resolve-Path "src-tauri\tauri.conf.json"),
    $json + "`n",
    [System.Text.UTF8Encoding]::new($false)
)

# 3. Update the [package] version in src-tauri/Cargo.toml
$CargoPath = "src-tauri\Cargo.toml"
$CargoContent = Get-Content $CargoPath -Raw
# Only replace the first occurrence (the [package] version, not dependency versions)
$CargoContent = $CargoContent -replace '(?m)^version = "[^"]*"', "version = `"$NewVersion`""
[System.IO.File]::WriteAllText(
    (Resolve-Path $CargoPath),
    $CargoContent,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "v$NewVersion applied to:"
Write-Host "  package.json"
Write-Host "  src-tauri/tauri.conf.json"
Write-Host "  src-tauri/Cargo.toml"
