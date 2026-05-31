This directory owns the website's SD-card font generator.

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

Fallback families are hole-fillers, not full merges.

- The primary family is checked first for every codepoint.
- Fallback family 1 only contributes codepoints the primary family does not have.
- Fallback family 2 only contributes codepoints missing from both earlier families.
- If a codepoint exists in the primary family, the fallback families do not override it.
- If no family in the chain has a codepoint, it is omitted from the generated `.cpfont`.

That same ownership split is also used when extracting kerning and ligatures, so
fallback families only contribute data for the codepoints they actually supply.

If you resync from upstream later, treat it like a real vendor update:

- compare output compatibility
- keep local website-specific changes explicit
- verify `CPFONT_VERSION` still matches firmware expectations
