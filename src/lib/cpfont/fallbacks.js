// Bundled default fallback fonts.
//
// These are hole-fillers appended after any user-supplied fallback family, so
// codepoints the chosen family lacks still render on device. The list and the
// CJK selection rules come from the former build-fonts.yml CI step; the files
// live in scripts/font-builder/default-fallback-fonts/ and are served at
// /font-fallbacks/<name> (see the fontFallbacks plugin in vite.config.js).
//
// Noto color emoji fonts are intentionally absent: the converter rasterizes
// monochrome FreeType bitmaps.

export const DEFAULT_FALLBACK_FILES = [
  'NotoSans-Regular.ttf',
  'NotoSansHebrew-Regular.ttf',
  'NotoSansArmenian-Regular.ttf',
  'NotoSansGeorgian-Regular.ttf',
  'NotoSansEthiopic-Regular.ttf',
  'NotoSansCherokee-Regular.ttf',
  'NotoSansTifinagh-Regular.ttf',
  'NotoSansCoptic-Regular.ttf',
  'NotoSansMath-Regular.ttf',
  'NotoSansSymbols-Regular.ttf',
  'NotoSansSymbols2-Regular.ttf',
  'NotoEmoji-Regular.ttf',
]

export const FALLBACK_BASE_PATH = '/font-fallbacks/'

// Which CJK font leads depends on the selected coverage: a JP build wants
// Japanese glyph shapes first, a TC build Traditional, and so on. Builds with
// no CJK coverage still carry one CJK fallback for stray ideographs.
function cjkFallbacks(intervals) {
  const tokens = new Set(String(intervals || '').split(',').map((token) => token.trim().toLowerCase()))
  if (tokens.has('cjk-jp')) return ['NotoSansCJKjp-Regular.otf', 'NotoSansCJKsc-Regular.otf']
  if (tokens.has('cjk-tc')) return ['NotoSansCJKtc-Regular.otf', 'NotoSansCJKsc-Regular.otf']
  if (tokens.has('cjk-sc')) return ['NotoSansCJKsc-Regular.otf', 'NotoSansCJKjp-Regular.otf']
  return ['NotoSansCJKjp-Regular.otf']
}

// Ordered list of bundled fallback filenames for a coverage selection.
export function defaultFallbackNames(intervals) {
  return [...DEFAULT_FALLBACK_FILES, ...cjkFallbacks(intervals)]
}

// Rough download size, for progress reporting before any byte arrives.
export const FALLBACK_APPROX_BYTES = {
  'NotoSansCJKjp-Regular.otf': 16_467_736,
  'NotoSansCJKsc-Regular.otf': 16_437_364,
  'NotoSansCJKtc-Regular.otf': 16_435_884,
}

// Fetches the bundled fallbacks, newest-first in the browser HTTP cache. The
// CJK files are ~16 MB each, so this reports progress per file.
export async function fetchDefaultFallbacks(names, options = {}) {
  const { basePath = FALLBACK_BASE_PATH, onProgress = () => {}, signal } = options
  const fonts = []
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    onProgress({ name, index: i, total: names.length })
    const response = await fetch(basePath + name, { signal })
    if (!response.ok) {
      throw new Error(`Could not load the bundled fallback font ${name} (${response.status})`)
    }
    fonts.push({ name, bytes: new Uint8Array(await response.arrayBuffer()) })
  }
  return fonts
}
