# Build script for Windows.
# Usage:  .\scripts\build-windows.ps1 [major|minor|patch]
# If a bump type is provided, the version is incremented before build.
#
# Pipeline:
#   1. Optionally bump version in tauri.conf.json + Cargo.toml + package.json
#   2. cargo build --release -p unlocker-helper  (so the bundled exe exists)
#   3. npm run tauri -- build  (NSIS + MSI, picks up tauri.windows.conf.json)
#   4. signtool sign  (if Sectigo USB cert present)

param(
    [string]$BumpType
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $RepoRoot

# ── Find Windows SDK signtool ───────────────────────────────────────────────
# Tauri does its own signtool lookup that doesn't honor PATH on every code path,
# so set TAURI_WINDOWS_SIGNTOOL_PATH explicitly. PATH is also added so any
# manual / fallback invocation resolves the same binary.
$sdkBase = "C:\Program Files (x86)\Windows Kits\10\bin"
$sdkPath = Get-ChildItem $sdkBase -Directory -Filter "10.*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1
if ($sdkPath) {
    $sdkBin = Join-Path $sdkPath.FullName "x64"
    $env:PATH = "$sdkBin;$env:PATH"
    $env:TAURI_WINDOWS_SIGNTOOL_PATH = Join-Path $sdkBin "signtool.exe"
    Write-Host "Added Windows SDK to PATH: $sdkBin"
} else {
    Write-Warning "Windows SDK not found at $sdkBase — signtool unavailable"
}

# ── Load .env.local ─────────────────────────────────────────────────────────
if (Test-Path .env.local) {
    Get-Content .env.local | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim('"')
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

# ── Version bump ────────────────────────────────────────────────────────────
if ($BumpType) {
    $configPath = "app\src-tauri\tauri.conf.json"
    $configContent = Get-Content $configPath -Raw
    if ($configContent -match '"version":\s*"(\d+)\.(\d+)\.(\d+)"') {
        $major = [int]$matches[1]; $minor = [int]$matches[2]; $patch = [int]$matches[3]
        $currentVersion = "$major.$minor.$patch"

        switch ($BumpType) {
            "major" { $major++; $minor = 0; $patch = 0 }
            "minor" { $minor++; $patch = 0 }
            "patch" { $patch++ }
            default { Write-Error "Invalid bump type. Use: major, minor, or patch"; exit 1 }
        }

        $newVersion = "$major.$minor.$patch"
        Write-Host "Bumping version: $currentVersion -> $newVersion"

        $configContent = $configContent -replace '"version":\s*"[^"]+"', "`"version`": `"$newVersion`""
        Set-Content $configPath $configContent -NoNewline

        $cargoPath = "Cargo.toml"
        $cargoContent = Get-Content $cargoPath -Raw
        $cargoContent = $cargoContent -replace '(\[workspace\.package\][\s\S]*?\nversion\s*=\s*)"[^"]+"', "`$1`"$newVersion`""
        Set-Content $cargoPath $cargoContent -NoNewline

        if (Test-Path "app\package.json") {
            $pkgContent = Get-Content "app\package.json" -Raw
            $pkgContent = $pkgContent -replace '"version":\s*"[^"]+"', "`"version`": `"$newVersion`""
            Set-Content "app\package.json" $pkgContent -NoNewline
        }
    }
}

# ── Tauri update signing ────────────────────────────────────────────────────
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    Write-Warning "TAURI_SIGNING_PRIVATE_KEY not set — auto-update bundles won't be signed"
}

# ── Code-signing cert check ─────────────────────────────────────────────────
Write-Host "Checking for code signing certificate..."
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -like "*SoFriendly*" }
if ($cert) {
    Write-Host "Found: $($cert.Subject)" -ForegroundColor Green
    Write-Host "Thumbprint: $($cert.Thumbprint)"
    Write-Host "Expires: $($cert.NotAfter)"
} else {
    Write-Warning "Code signing certificate not found — make sure your Sectigo USB token is plugged in."
    $response = Read-Host "Continue without code signing? (y/N)"
    if ($response -ne 'y') { exit 1 }
}

# ── WinDivert SDK ───────────────────────────────────────────────────────────
# windivert-sys links WinDivert.dll at build time and needs WINDIVERT_PATH to
# find WinDivert.lib. The .dll is a plain import of the helper exe, so it must
# also sit next to it at runtime or the helper won't start at all (only the
# missing .sys driver is fail-soft). bundle.resources ships both into the
# install dir alongside unlocker-helper.exe; the copy below covers running
# target\release\unlocker-helper.exe directly during dev.
$windivertDir = Join-Path $RepoRoot "vendor\windivert\x64"
if (-not (Test-Path "$windivertDir\WinDivert.lib")) {
    Write-Error "WinDivert SDK missing at $windivertDir (need WinDivert.lib, WinDivert.dll, WinDivert64.sys from https://reqrypt.org/windivert.html)"
    exit 1
}
$env:WINDIVERT_PATH = $windivertDir
Write-Host "WINDIVERT_PATH: $windivertDir"

# ── Build helper exe first so bundle.resources can pick it up ───────────────
Write-Host ""
Write-Host "Building privileged helper..."
cargo build --release -p unlocker-helper
if ($LASTEXITCODE -ne 0) { Write-Error "helper build failed"; exit 1 }

Copy-Item "$windivertDir\WinDivert.dll","$windivertDir\WinDivert64.sys" `
    (Join-Path $RepoRoot "target\release") -Force

# ── Build Tauri app ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Building Tauri app (NSIS + MSI)..."
Set-Location "$RepoRoot\app"
npm run tauri -- build
if ($LASTEXITCODE -ne 0) { Write-Error "tauri build failed"; exit 1 }
Set-Location $RepoRoot

# Authenticode signing happens inside the Tauri bundle step via
# bundle.windows.signCommand → scripts/sign-windows-artifact.ps1, so the
# updater .sig is computed against the already-signed binary.

$bundleRoot = "target\release\bundle"
Write-Host ""
Write-Host "Artifacts in: $bundleRoot"
Get-ChildItem -Path "$bundleRoot\msi" -ErrorAction SilentlyContinue
Get-ChildItem -Path "$bundleRoot\nsis" -ErrorAction SilentlyContinue
