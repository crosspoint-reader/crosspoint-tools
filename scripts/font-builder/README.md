This directory owns the reference implementation of the website's SD-card font
generator.

The website itself no longer runs this script: `/fonts` converts fonts in the
visitor's browser (`src/lib/cpfont`, a WebAssembly FreeType build). This script
stays as the reference the browser generator is ported from and compared
against:

```bash
pip install freetype-py fonttools
node ../../scripts/font-builder/parity.mjs --regular SomeFont-Regular.ttf \
  --default-fallbacks --intervals reading --sizes 14
```

`parity.mjs` runs both generators and requires byte equality everywhere except
glyph bitmaps, which get a small documented tolerance (see the repo README).
Any change to coverage resolution, kerning, ligatures, or the binary layout has
to land in both implementations in the same change.

`fontconvert_sdcard.py` and `cpfont_version.py` were initially copied from:

- `crosspoint-reader/crosspoint-reader`
- `lib/EpdFont/scripts/fontconvert_sdcard.py`
- `lib/EpdFont/scripts/cpfont_version.py`

The copy is intentional. The website's `.cpfont` pipeline needs room to grow
independently from firmware build tooling, especially for SD-card-specific
features like extra fallback families and other generator-only behavior.

Today that includes ordered fallback-family coverage for SD-card fonts, which
the website can iterate on without waiting for upstream firmware tooling.

## Fallback coverage behavior

Fallback families are hole-fillers, not full merges. The hosted builder also
adds bundled default fallback fonts after any user-provided fallbacks.

- The primary family is checked first for every codepoint.
- Fallback family 1 only contributes codepoints the primary family does not have.
- Fallback family 2 only contributes codepoints missing from both earlier families.
- Bundled default fallbacks only contribute codepoints missing from all uploaded families.
- If a codepoint exists in the primary family, the fallback families do not override it.
- If no family in the chain has a codepoint, it is omitted from the generated `.cpfont`.

That same ownership split is also used when extracting kerning and ligatures, so
fallback families only contribute data for the codepoints they actually supply.

The default fallback font files live in `default-fallback-fonts/`. They are
committed to this repo; a Vite plugin (see `vite.config.js`) serves them at
`/font-fallbacks/<name>` for the browser generator, and this script reads them
straight off disk via `--default-fallback-font`. Noto color emoji fonts are intentionally not used because the current
converter rasterizes monochrome FreeType glyph bitmaps.

## Interval coverage behavior

Every generated `.cpfont` includes `base` coverage first. `base` is intentionally
small: ASCII/basic Latin plus Unicode General Punctuation. This keeps ordinary
letters, numbers, spaces, smart quotes, dashes, and ellipses available without
forcing broad Latin/Cyrillic/math coverage into large CJK or Hangul builds.

`default` is an optional preset for broad CrossPoint-style reading coverage. Any
`--intervals` presets or custom ranges are additive on top of `base`. The final
interval list is merged and deduplicated before glyph coverage is resolved.
The `reading` preset intentionally includes `default` coverage plus its
fiction-oriented extras, preserving the older behavior where selecting
`reading` also gave users the built-in/default readable ranges.

If you resync from upstream later, treat it like a real vendor update:

- compare output compatibility
- keep local website-specific changes explicit
- verify `CPFONT_VERSION` still matches firmware expectations
