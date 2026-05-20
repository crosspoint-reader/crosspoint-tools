#!/usr/bin/env bash
# Cut a release.
#
# Usage: ./scripts/release.sh [major|minor|patch]
#
# Steps:
#   1. Bump version
#   2. Build + sign + notarize macOS via build-macos.sh
#   3. Commit version files, tag, push
#   4. Upload artifacts to Cloudflare R2 + refresh latest.json

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

if [[ -z "${1:-}" ]]; then
    echo "Usage: $0 [major|minor|patch]" >&2
    exit 1
fi
BUMP_TYPE=$1

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "master" ]]; then
    echo "warning: on branch '$CURRENT_BRANCH', not 'master'"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

# Refuse if there are unrelated unstaged changes.
if ! git diff --quiet --exit-code -- \
    ':!app/src-tauri/tauri.conf.json' \
    ':!app/package.json' \
    ':!Cargo.toml' \
    ':!Cargo.lock'; then
    echo "error: uncommitted changes; commit or stash first" >&2
    exit 1
fi

OLD_VERSION=$(grep '"version"' app/src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo "Current version: $OLD_VERSION"

echo
echo "=== Building macOS (with bump) ==="
./scripts/build-macos.sh "$BUMP_TYPE"

NEW_VERSION=$(grep '"version"' app/src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo
echo "New version: $NEW_VERSION"

if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
    echo "error: tag v$NEW_VERSION already exists" >&2
    exit 1
fi

echo
echo "=== Committing version bump ==="
git add app/src-tauri/tauri.conf.json app/package.json Cargo.toml Cargo.lock 2>/dev/null || true
git commit -m "Bump version to $NEW_VERSION"

echo
echo "=== Tagging v$NEW_VERSION ==="
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo
echo "=== Pushing ==="
git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"

echo
echo "=== Uploading to Cloudflare R2 ==="
./scripts/upload-to-cloudflare.sh

echo
echo "=== Release complete ==="
echo "  Version: $NEW_VERSION"
echo "  Tag:     v$NEW_VERSION"
echo "  Updates: https://unlocker-releases.crosspointreader.com/latest.json"
