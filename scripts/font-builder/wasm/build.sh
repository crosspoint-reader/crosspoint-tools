#!/usr/bin/env bash
# Build cpfont_ft.c + FreeType (+ HarfBuzz) into a single-file wasm ES module.
#
# Output (committed): src/lib/cpfont/wasm/freetype.mjs
#
# Versions track the libraries the reference Python generator links against
# (scripts/font-builder/fontconvert_sdcard.py via the freetype-py wheel).
# Keeping them equal is what makes the browser generator byte-identical:
#
#   * FreeType version — the TrueType hinting and the rasterizer change between
#     releases. Check with: python3 -c "import freetype; print(freetype.version())"
#   * HarfBuzz presence — FreeType's auto-hinter asks HarfBuzz which characters
#     a script covers when it computes blue zones. A FreeType built without
#     HarfBuzz hints some glyphs (symbol and emoji fonts especially) up to a
#     pixel differently, so HarfBuzz is built in even though nothing here
#     shapes text. This needs the usual two-pass dance: FreeType without
#     HarfBuzz, then HarfBuzz against it, then FreeType again with HarfBuzz.
#
# Requires emsdk (emcc, emcmake) and cmake on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
OUT_DIR="$REPO/src/lib/cpfont/wasm"
WORK="$HERE/.build"
PREFIX="$WORK/prefix"

FT_VERSION="2.13.2"
FT_SHA256="12991c4e55c506dd7f9b765933e62fd2be2e06d421505d7950a132e4f1bb484d"
HB_VERSION="14.5.0"
HB_SHA256="b7132e148358a45185c9feafd049dbaf243649d3c44414b3534d9c95d18592b9"

JOBS="$(getconf _NPROCESSORS_ONLN)"
mkdir -p "$WORK" "$OUT_DIR" "$PREFIX"

fetch() {  # fetch <url> <tarball> <sha256|SKIP> <expected-dir>
  local url="$1" tarball="$2" sha="$3" dir="$4"
  if [ -d "$dir" ]; then return; fi
  if [ ! -f "$tarball" ]; then
    echo "==> Downloading $(basename "$url")"
    curl -sSfL -o "$tarball" "$url"
  fi
  if [ "$sha" != "SKIP" ]; then
    echo "$sha  $tarball" | shasum -a 256 -c -
  fi
  tar -xf "$tarball" -C "$(dirname "$dir")"
}

FT_SRC="$WORK/freetype-$FT_VERSION"
HB_SRC="$WORK/harfbuzz-$HB_VERSION"
fetch "https://download.savannah.gnu.org/releases/freetype/freetype-$FT_VERSION.tar.xz" \
  "$WORK/freetype-$FT_VERSION.tar.xz" "$FT_SHA256" "$FT_SRC"
fetch "https://github.com/harfbuzz/harfbuzz/releases/download/$HB_VERSION/harfbuzz-$HB_VERSION.tar.xz" \
  "$WORK/harfbuzz-$HB_VERSION.tar.xz" "$HB_SHA256" "$HB_SRC"

# No zlib/bzip2/png: those only matter for compressed and bitmap-embedded
# inputs, and the builder only accepts TTF/OTF outlines.
FT_COMMON=(
  -DCMAKE_BUILD_TYPE=Release
  -DBUILD_SHARED_LIBS=OFF
  -DCMAKE_INSTALL_PREFIX="$PREFIX"
  -DFT_DISABLE_ZLIB=TRUE
  -DFT_DISABLE_BZIP2=TRUE
  -DFT_DISABLE_PNG=TRUE
  -DFT_DISABLE_BROTLI=TRUE
)

if [ ! -f "$PREFIX/lib/libharfbuzz.a" ]; then
  echo "==> FreeType pass 1 (no HarfBuzz)"
  emcmake cmake -S "$FT_SRC" -B "$WORK/ft-pass1" "${FT_COMMON[@]}" \
    -DFT_DISABLE_HARFBUZZ=TRUE >/dev/null
  cmake --build "$WORK/ft-pass1" -j "$JOBS" >/dev/null
  cmake --install "$WORK/ft-pass1" >/dev/null

  echo "==> HarfBuzz (against pass-1 FreeType)"
  emcmake cmake -S "$HB_SRC" -B "$WORK/hb" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DCMAKE_INSTALL_PREFIX="$PREFIX" \
    -DCMAKE_FIND_ROOT_PATH="$PREFIX" \
    -DCMAKE_PREFIX_PATH="$PREFIX" \
    -DHB_HAVE_FREETYPE=ON \
    -DHB_HAVE_GLIB=OFF \
    -DHB_HAVE_ICU=OFF \
    -DHB_BUILD_SUBSET=OFF \
    -DHB_BUILD_TESTS=OFF \
    -DHB_BUILD_UTILS=OFF >/dev/null
  cmake --build "$WORK/hb" -j "$JOBS" >/dev/null
  cmake --install "$WORK/hb" >/dev/null
fi

if [ ! -f "$WORK/ft/libfreetype.a" ]; then
  echo "==> FreeType pass 2 (with HarfBuzz)"
  emcmake cmake -S "$FT_SRC" -B "$WORK/ft" "${FT_COMMON[@]}" \
    -DFT_REQUIRE_HARFBUZZ=TRUE \
    -DCMAKE_FIND_ROOT_PATH="$PREFIX" \
    -DCMAKE_PREFIX_PATH="$PREFIX" \
    -DHarfBuzz_INCLUDE_DIR="$PREFIX/include/harfbuzz" \
    -DHarfBuzz_LIBRARY="$PREFIX/lib/libharfbuzz.a" >/dev/null
  cmake --build "$WORK/ft" -j "$JOBS" >/dev/null
  grep -q "^#define FT_CONFIG_OPTION_USE_HARFBUZZ" "$WORK/ft/include/freetype/config/ftoption.h" \
    || { echo "HarfBuzz was not enabled in the FreeType build" >&2; exit 1; }
fi

echo "==> Linking cpfont_ft wasm module"
# Emits freetype.mjs (glue) + freetype.wasm (the module). The wrapper in
# src/lib/cpfont/freetype.js locates the .wasm itself — a Vite `?url` import in
# the browser, a filesystem read under node — so the binary ships as a real
# .wasm the browser streams and caches, instead of base64 inside the JS.
emcc "$HERE/cpfont_ft.c" "$WORK/ft/libfreetype.a" "$PREFIX/lib/libharfbuzz.a" \
  -I "$FT_SRC/include" \
  -O3 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createFreeTypeModule \
  -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH=1 \
  -sFILESYSTEM=0 \
  -sEXPORTED_FUNCTIONS='["_cp_init","_cp_face_new","_cp_face_free","_cp_face_set_size","_cp_coverage_range","_cp_render_glyph","_cp_face_metrics","_cp_char_indices","_cp_charmap_dump","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP32","HEAPU32"]' \
  -o "$OUT_DIR/freetype.mjs"

echo "==> Wrote $OUT_DIR/freetype.mjs ($(du -h "$OUT_DIR/freetype.mjs" | cut -f1))"
