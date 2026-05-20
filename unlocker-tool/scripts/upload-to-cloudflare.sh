#!/usr/bin/env bash
# Push the latest macOS build artifacts to R2, then merge a fresh entry into
# latest.json so the Tauri updater picks it up. Run after build-macos.sh.
#
# Required env (loaded from .env.local if present):
#   CLOUDFLARE_ACCOUNT_ID
#   CLOUDFLARE_R2_ACCESS_KEY  (or AWS_ACCESS_KEY_ID)
#   CLOUDFLARE_R2_SECRET_KEY  (or AWS_SECRET_ACCESS_KEY)
#
# Optional:
#   CLOUDFLARE_R2_BUCKET   defaults to "unlocker-releases"

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

if [[ -f .env.local ]]; then
    # shellcheck disable=SC2046
    export $(grep -v '^#' .env.local | xargs)
fi

[[ -z "${CLOUDFLARE_R2_ACCESS_KEY:-}" ]] && CLOUDFLARE_R2_ACCESS_KEY="${AWS_ACCESS_KEY_ID:-}"
[[ -z "${CLOUDFLARE_R2_SECRET_KEY:-}" ]] && CLOUDFLARE_R2_SECRET_KEY="${AWS_SECRET_ACCESS_KEY:-}"

: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID not set}"
: "${CLOUDFLARE_R2_ACCESS_KEY:?CLOUDFLARE_R2_ACCESS_KEY not set}"
: "${CLOUDFLARE_R2_SECRET_KEY:?CLOUDFLARE_R2_SECRET_KEY not set}"

CLOUDFLARE_R2_BUCKET="${CLOUDFLARE_R2_BUCKET:-unlocker-releases}"
R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"

VERSION=$(grep '"version"' app/src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo "Uploading version: $VERSION"

# ── Extract release notes from CHANGELOG.md (if present) ──
extract_changelog() {
  local version=$1
  local changelog_file="CHANGELOG.md"
  [[ -f "$changelog_file" ]] || { echo "Update to version ${version}"; return; }

  local notes
  notes=$(awk -v ver="$version" '
    /^## \[/ {
      if (found) exit
      if ($0 ~ "\\[" ver "\\]") found=1
      next
    }
    found && !/^## / { print }
  ' "$changelog_file" | sed '/^$/d' | sed 's/^- /• /')

  if [[ -z "$notes" ]]; then
    notes=$(awk '
      /^## \[/ {
        if (found) exit
        found=1
        next
      }
      found && !/^## / { print }
    ' "$changelog_file" | sed '/^$/d' | sed 's/^- /• /')
  fi
  echo "$notes"
}

CHANGELOG_NOTES=$(extract_changelog "$VERSION")
[[ -z "$CHANGELOG_NOTES" ]] && CHANGELOG_NOTES="Update to version ${VERSION}"
echo "Changelog notes:"
echo "$CHANGELOG_NOTES"

upload_file() {
  local file=$1
  local key=$2
  if [[ -f "$file" ]]; then
    echo "Uploading: $key"
    AWS_ACCESS_KEY_ID="$CLOUDFLARE_R2_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$CLOUDFLARE_R2_SECRET_KEY" \
    aws s3 cp "$file" "s3://${CLOUDFLARE_R2_BUCKET}/${key}" \
      --endpoint-url "$R2_ENDPOINT" \
      --no-progress
  else
    echo "Skipping (not found): $file"
  fi
}

echo
echo "=== Uploading macOS artifacts ==="

DMG_FILE=$(find target/universal-apple-darwin/release/bundle/dmg -name "*.dmg" 2>/dev/null | head -1)
[[ -n "${DMG_FILE:-}" ]] && upload_file "$DMG_FILE" "v${VERSION}/XteinkUnlocker_${VERSION}_universal.dmg"

TAR_FILE="target/universal-apple-darwin/release/bundle/XteinkUnlocker_${VERSION}_darwin-universal.app.tar.gz"
if [[ -f "$TAR_FILE" ]]; then
  upload_file "$TAR_FILE" "v${VERSION}/XteinkUnlocker_${VERSION}_darwin-universal.app.tar.gz"
  [[ -f "${TAR_FILE}.sig" ]] && upload_file "${TAR_FILE}.sig" "v${VERSION}/XteinkUnlocker_${VERSION}_darwin-universal.app.tar.gz.sig"
else
  echo "Warning: $TAR_FILE not found — run build-macos.sh first" >&2
fi

echo
echo "=== Writing per-arch macOS update manifests ==="

# Each platform / arch owns its own update manifest so cutting a macOS release
# never touches the Windows one (and vice versa). Tauri's updater picks the
# right file via {{target}}-{{arch}} substitution in the endpoint URL.
#
# We ALSO continue updating the legacy shared `latest.json` with macOS-only
# entries — installs cut before the per-platform endpoint was introduced
# (≤ 0.1.7 macOS) only know that URL, so dropping it would strand them.
# Crucially: never include a `windows-x86_64` entry here, because pre-0.1.8
# binaries (the only ones still hitting `latest.json`) are all macOS — and
# Windows users on 0.1.8+ should not fall through to this file.

if [[ ! -f "${TAR_FILE}.sig" ]]; then
  echo "No macOS signature; manifests not written." >&2
else
  # Read sig and changelog through jq directly from files / piped input so
  # we never inject a stray trailing newline. A here-string (<<<) appends
  # one, and the Tauri updater's base64 decoder then chokes on it
  # ("Invalid symbol 10, offset N" — symbol 10 is LF).
  MAC_SIG_JSON=$(jq -Rs . < "${TAR_FILE}.sig")
  NOTES_JSON=$(printf '%s' "$CHANGELOG_NOTES" | jq -Rs .)

  PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  TAR_URL="https://unlocker-releases.crosspointreader.com/v${VERSION}/XteinkUnlocker_${VERSION}_darwin-universal.app.tar.gz"

  mkdir -p target/release/bundle

  for ARCH in aarch64 x86_64; do
    OUT="target/release/bundle/latest-darwin-${ARCH}.json"
    cat > "$OUT" <<JSON
{
  "version": "${VERSION}",
  "notes": ${NOTES_JSON},
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "darwin-${ARCH}": {
      "signature": ${MAC_SIG_JSON},
      "url": "${TAR_URL}"
    }
  }
}
JSON
    upload_file "$OUT" "latest-darwin-${ARCH}.json"
  done

  # Legacy shared file — macOS entries only, for pre-0.1.8 installs.
  LEGACY="target/release/bundle/latest.json"
  cat > "$LEGACY" <<JSON
{
  "version": "${VERSION}",
  "notes": ${NOTES_JSON},
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "darwin-aarch64": {
      "signature": ${MAC_SIG_JSON},
      "url": "${TAR_URL}"
    },
    "darwin-x86_64": {
      "signature": ${MAC_SIG_JSON},
      "url": "${TAR_URL}"
    }
  }
}
JSON
  upload_file "$LEGACY" "latest.json"
fi

echo
echo "=== Upload complete ==="
echo "macOS update endpoints:"
echo "  https://unlocker-releases.crosspointreader.com/latest-darwin-aarch64.json"
echo "  https://unlocker-releases.crosspointreader.com/latest-darwin-x86_64.json"
echo "Legacy (≤ 0.1.7 macOS installs):"
echo "  https://unlocker-releases.crosspointreader.com/latest.json"
