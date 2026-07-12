#!/usr/bin/env bash
# Linux release build for Xteink Unlocker.
#
#  1. cargo build       — produces unlocker-helper for the native Linux arch
#  2. tauri build       — produces .deb, .rpm, and .AppImage. Helper is
#                         included via tauri.linux.conf.json bundle.resources
#                         so it lands at resource_dir()/unlocker-helper.
#  3. updater signing   — Tauri auto-signs the .AppImage with
#                         TAURI_SIGNING_PRIVATE_KEY, producing a sibling
#                         .AppImage.sig that the auto-updater verifies.
#
# Linux auto-update only works for users who run the .AppImage.
# Users on .deb / .rpm need to upgrade through their package manager.
#
# Usage:
#   ./scripts/build-linux.sh [major|minor|patch]
#   LINUX_TARGET=aarch64-unknown-linux-gnu ./scripts/build-linux.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

# ── Load .env.local if present ──
if [[ -f .env.local ]]; then
    # shellcheck disable=SC2046
    export $(grep -v '^#' .env.local | xargs)
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    echo "warning: TAURI_SIGNING_PRIVATE_KEY not set — auto-update bundle won't be signed" >&2
fi

HOST_ARCH="$(uname -m)"
DEFAULT_TARGET="x86_64-unknown-linux-gnu"
case "$HOST_ARCH" in
    x86_64|amd64) DEFAULT_TARGET="x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) DEFAULT_TARGET="aarch64-unknown-linux-gnu" ;;
esac
LINUX_TARGET="${LINUX_TARGET:-$DEFAULT_TARGET}"

# ── Optional: bump version first ──
if [[ -n "${1:-}" ]]; then
    echo "==> Bumping version (${1})"
    if [[ -x "${REPO_ROOT}/scripts/bump-version.sh" ]]; then
        ./scripts/bump-version.sh "$1"
    else
        echo "warning: scripts/bump-version.sh not found; skipping bump" >&2
    fi
fi

# ── Check for required system packages ──
echo "==> Checking system dependencies"
MISSING=()
for pkg in pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
        MISSING+=("$pkg")
    fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo "Missing required packages:" >&2
    printf '  %s\n' "${MISSING[@]}" >&2
    echo "Install with: sudo apt install ${MISSING[*]}" >&2
    exit 1
fi

# ── Ensure rust target ──
echo "==> Ensuring rust target ${LINUX_TARGET}"
rustup target add "${LINUX_TARGET}" >/dev/null

# ── Build the helper ──
# No --target: tauri.linux.conf.json bundles the helper from
# ../../target/release/unlocker-helper (i.e. the default, un-prefixed target
# dir). Building with --target places it under
# target/<triple>/release/ instead, which the bundler can't find. The Linux
# runners are native for each release architecture, so the default target matches.
echo "==> Building unlocker-helper (release)"
cargo build --release -p unlocker-helper

HELPER_BIN_SRC="${REPO_ROOT}/target/release/unlocker-helper"
[[ -x "${HELPER_BIN_SRC}" ]] || { echo "helper binary missing: ${HELPER_BIN_SRC}" >&2; exit 1; }
file "${HELPER_BIN_SRC}"

# ── Build the Tauri app ──
# Pulls in tauri.linux.conf.json which references the helper binary as a
# bundle resource so it ends up at resource_dir()/unlocker-helper inside
# the AppImage / deb / rpm.
echo "==> Building Tauri app (${LINUX_TARGET})"
( cd app && npm run tauri -- build \
    --target "${LINUX_TARGET}" \
    --config src-tauri/tauri.linux.conf.json )

# ── Locate produced artifacts ──
BUNDLE_DIR="target/${LINUX_TARGET}/release/bundle"
APPIMAGE=$(find "${BUNDLE_DIR}/appimage" -name "*.AppImage" -type f 2>/dev/null | head -1)
APPIMAGE_SIG=$(find "${BUNDLE_DIR}/appimage" -name "*.AppImage.sig" -type f 2>/dev/null | head -1)
DEB=$(find "${BUNDLE_DIR}/deb" -name "*.deb" -type f 2>/dev/null | head -1)
RPM=$(find "${BUNDLE_DIR}/rpm" -name "*.rpm" -type f 2>/dev/null | head -1)

[[ -f "${APPIMAGE}" ]] || { echo "no AppImage produced" >&2; exit 1; }

if [[ -n "${DEB}" ]]; then
    DEB_CONTENTS=$(mktemp)
    dpkg-deb -c "${DEB}" > "${DEB_CONTENTS}"
    if ! grep -q '/unlocker-helper$' "${DEB_CONTENTS}"; then
        rm -f "${DEB_CONTENTS}"
        echo "Debian package is missing bundled unlocker-helper" >&2
        exit 1
    fi
    rm -f "${DEB_CONTENTS}"
fi

echo
echo "Linux build complete."
echo "  AppImage:        ${APPIMAGE}"
[[ -n "${APPIMAGE_SIG}" ]] && echo "  Updater sig:     ${APPIMAGE_SIG}"
[[ -n "${DEB}" ]] && echo "  Debian package:  ${DEB}"
[[ -n "${RPM}" ]] && echo "  RPM package:     ${RPM}"
echo
echo "  Note: auto-update only fires for AppImage installs. .deb / .rpm users"
echo "        upgrade via apt/dnf or by re-running the installer."
