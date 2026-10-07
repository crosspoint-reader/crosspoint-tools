# Cut a Windows release.
#
# Usage: .\scripts\release-windows.ps1 [major|minor|patch]
#
# Steps (mirrors scripts/release.sh for macOS):
#   1. Bump version + build + sign via build-windows.ps1
#   2. Commit version files, tag, push
#   3. Upload artifacts to Cloudflare R2 + refresh latest-windows-x86_64.json

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("major", "minor", "patch")]
    [string]$BumpType
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $RepoRoot

$CurrentBranch = (git branch --show-current).Trim()
if ($CurrentBranch -ne "master") {
    Write-Warning "on branch '$CurrentBranch', not 'master'"
    $response = Read-Host "Continue anyway? (y/N)"
    if ($response -ne 'y') { exit 1 }
}

# Refuse if there are unrelated uncommitted changes.
git diff --quiet --exit-code -- `
    ':!app/src-tauri/tauri.conf.json' `
    ':!app/package.json' `
    ':!Cargo.toml' `
    ':!Cargo.lock'
if ($LASTEXITCODE -ne 0) {
    Write-Error "uncommitted changes; commit or stash first"
    exit 1
}

$configContent = Get-Content "app\src-tauri\tauri.conf.json" -Raw
if ($configContent -notmatch '"version":\s*"([^"]+)"') {
    Write-Error "Could not read version from tauri.conf.json"; exit 1
}
$OldVersion = $matches[1]
Write-Host "Current version: $OldVersion"

Write-Host ""
Write-Host "=== Building Windows (with bump) ===" -ForegroundColor Green
& "$RepoRoot\scripts\build-windows.ps1" $BumpType
if ($LASTEXITCODE -ne 0) { Write-Error "build-windows.ps1 failed"; exit 1 }

$configContent = Get-Content "app\src-tauri\tauri.conf.json" -Raw
if ($configContent -notmatch '"version":\s*"([^"]+)"') {
    Write-Error "Could not read version from tauri.conf.json"; exit 1
}
$NewVersion = $matches[1]
Write-Host ""
Write-Host "New version: $NewVersion"

git rev-parse --verify "v$NewVersion" *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Error "tag v$NewVersion already exists"
    exit 1
}

Write-Host ""
Write-Host "=== Committing version bump ===" -ForegroundColor Green
git add app/src-tauri/tauri.conf.json app/package.json Cargo.toml Cargo.lock
git commit -m "Bump version to $NewVersion"
if ($LASTEXITCODE -ne 0) { Write-Error "git commit failed"; exit 1 }

Write-Host ""
Write-Host "=== Tagging v$NewVersion ===" -ForegroundColor Green
git tag -a "v$NewVersion" -m "Release v$NewVersion"
if ($LASTEXITCODE -ne 0) { Write-Error "git tag failed"; exit 1 }

Write-Host ""
Write-Host "=== Pushing ===" -ForegroundColor Green
git push origin $CurrentBranch
if ($LASTEXITCODE -ne 0) { Write-Error "git push (branch) failed"; exit 1 }
git push origin "v$NewVersion"
if ($LASTEXITCODE -ne 0) { Write-Error "git push (tag) failed"; exit 1 }

Write-Host ""
Write-Host "=== Uploading to Cloudflare R2 ===" -ForegroundColor Green
& "$RepoRoot\scripts\upload-to-cloudflare.ps1"
if ($LASTEXITCODE -ne 0) { Write-Error "upload-to-cloudflare.ps1 failed"; exit 1 }

Write-Host ""
Write-Host "=== Release complete ===" -ForegroundColor Cyan
Write-Host "  Version: $NewVersion"
Write-Host "  Tag:     v$NewVersion"
Write-Host "  Updates: https://unlocker-releases.crosspointreader.com/latest-windows-x86_64.json"
