This directory owns the website's SD-card font generator.

`fontconvert_sdcard.py` and `cpfont_version.py` were initially copied from:

- `crosspoint-reader/crosspoint-reader`
- `lib/EpdFont/scripts/fontconvert_sdcard.py`
- `lib/EpdFont/scripts/cpfont_version.py`

The copy is intentional. The website's `.cpfont` pipeline needs room to grow
independently from firmware build tooling, especially for SD-card-specific
features like extra fallback families and other generator-only behavior.

If you resync from upstream later, treat it like a real vendor update:

- compare output compatibility
- keep local website-specific changes explicit
- verify `CPFONT_VERSION` still matches firmware expectations
