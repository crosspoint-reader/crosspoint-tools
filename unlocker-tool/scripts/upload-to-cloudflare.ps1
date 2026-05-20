# Upload Windows artifacts to R2, then merge a windows-x86_64 entry into
# latest.json so the Tauri updater picks it up. Run after build-windows.ps1.
#
# Required env (loaded from .env.local if present):
#   CLOUDFLARE_ACCOUNT_ID
#   CLOUDFLARE_R2_ACCESS_KEY  (or AWS_ACCESS_KEY_ID)
#   CLOUDFLARE_R2_SECRET_KEY  (or AWS_SECRET_ACCESS_KEY)
#
# Optional:
#   CLOUDFLARE_R2_BUCKET   defaults to "unlocker-releases"

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $RepoRoot

if (Test-Path .env.local) {
    Get-Content .env.local | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim('"')
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

if (-not $env:CLOUDFLARE_R2_ACCESS_KEY) { $env:CLOUDFLARE_R2_ACCESS_KEY = $env:AWS_ACCESS_KEY_ID }
if (-not $env:CLOUDFLARE_R2_SECRET_KEY) { $env:CLOUDFLARE_R2_SECRET_KEY = $env:AWS_SECRET_ACCESS_KEY }

if (-not $env:CLOUDFLARE_ACCOUNT_ID -or -not $env:CLOUDFLARE_R2_ACCESS_KEY -or -not $env:CLOUDFLARE_R2_SECRET_KEY) {
    Write-Error "Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_R2_ACCESS_KEY / CLOUDFLARE_R2_SECRET_KEY in .env.local"
    exit 1
}

if (-not $env:CLOUDFLARE_R2_BUCKET) { $env:CLOUDFLARE_R2_BUCKET = "unlocker-releases" }

$env:AWS_ACCESS_KEY_ID = $env:CLOUDFLARE_R2_ACCESS_KEY
$env:AWS_SECRET_ACCESS_KEY = $env:CLOUDFLARE_R2_SECRET_KEY
$R2_ENDPOINT = "https://$($env:CLOUDFLARE_ACCOUNT_ID).r2.cloudflarestorage.com"

# ── Read version ────────────────────────────────────────────────────────────
$configContent = Get-Content "app\src-tauri\tauri.conf.json" -Raw
if ($configContent -notmatch '"version":\s*"([^"]+)"') {
    Write-Error "Could not read version from tauri.conf.json"; exit 1
}
$VERSION = $matches[1]
Write-Host "Uploading version: $VERSION" -ForegroundColor Cyan

function Upload-File {
    param([string]$LocalPath, [string]$RemoteKey)
    if (Test-Path $LocalPath) {
        Write-Host "Uploading: $RemoteKey"
        & aws s3 cp $LocalPath "s3://$($env:CLOUDFLARE_R2_BUCKET)/$RemoteKey" `
            --endpoint-url $R2_ENDPOINT --no-progress
        if ($LASTEXITCODE -ne 0) { Write-Warning "Upload failed: $RemoteKey" }
    } else {
        Write-Host "Skipping (not found): $LocalPath" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Uploading Windows artifacts ===" -ForegroundColor Green

$bundleRoot = "target\release\bundle"

# NSIS .exe is what the Tauri updater consumes on Windows. Filter by $VERSION
# so a stale installer from a previous build can't be picked up by accident.
$nsisFile = Get-ChildItem -Path "$bundleRoot\nsis\*${VERSION}*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nsisFile) {
    Upload-File $nsisFile.FullName "v$VERSION/XteinkUnlocker_${VERSION}_x64-setup.exe"
    if (Test-Path "$($nsisFile.FullName).sig") {
        Upload-File "$($nsisFile.FullName).sig" "v$VERSION/XteinkUnlocker_${VERSION}_x64-setup.exe.sig"
    }
}

# Optional MSI mirror.
$msiFile = Get-ChildItem -Path "$bundleRoot\msi\*${VERSION}*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($msiFile) {
    Upload-File $msiFile.FullName "v$VERSION/XteinkUnlocker_${VERSION}_x64.msi"
}

Write-Host ""
Write-Host "=== Writing latest-windows-x86_64.json ===" -ForegroundColor Green

# Each platform owns its own update manifest so cutting a Windows release
# never touches the macOS one. Tauri's updater picks the right file via
# {{target}}-{{arch}} substitution in the endpoint URL.

$winSig = ""
if ($nsisFile -and (Test-Path "$($nsisFile.FullName).sig")) {
    $winSig = (Get-Content "$($nsisFile.FullName).sig" -Raw).Trim()
}

$latest = [PSCustomObject]@{
    version  = $VERSION
    notes    = "Update to version $VERSION"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [PSCustomObject]@{
        "windows-x86_64" = [PSCustomObject]@{
            signature = $winSig
            url       = "https://unlocker-releases.crosspointreader.com/v$VERSION/XteinkUnlocker_${VERSION}_x64-setup.exe"
        }
    }
}

$latestJsonPath = Join-Path $RepoRoot "$bundleRoot\latest-windows-x86_64.json"
$json = $latest | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($latestJsonPath, $json, [System.Text.UTF8Encoding]::new($false))

Upload-File $latestJsonPath "latest-windows-x86_64.json"

Write-Host ""
Write-Host "=== Upload complete ===" -ForegroundColor Green
Write-Host "Windows update endpoint: https://unlocker-releases.crosspointreader.com/latest-windows-x86_64.json"
