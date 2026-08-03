// Font Builder helpers, ported from public/fonts.html inline scripts.
// Behavior is preserved verbatim; only the DOM wiring moved into React.

const STYLE_PATTERNS = [
  { style: 'bolditalic', re: /[-_ ]?(bold[-_ ]?italic|bold[-_ ]?oblique|bolditalic|boldoblique|BdIt|bi)$/i },
  { style: 'bold', re: /[-_ ]?(bold|Bd)$/i },
  { style: 'italic', re: /[-_ ]?(italic|It|oblique)$/i },
  { style: 'regular', re: /[-_ ]?(regular|normal|book|roman|medium|Rg)$/i },
]

const EXTRA_WEIGHT_RE =
  /(thin|hairline|extra[-_ ]?light|ultra[-_ ]?light|light|medium|semi[-_ ]?bold|demi[-_ ]?bold|extra[-_ ]?bold|ultra[-_ ]?bold|black|heavy)[-_ ]?(italic|oblique)/i

function detectStyle(stem) {
  for (let i = 0; i < STYLE_PATTERNS.length; i++) {
    if (STYLE_PATTERNS[i].re.test(stem)) return STYLE_PATTERNS[i].style
  }
  return 'regular'
}

function extractFamily(stem) {
  for (let i = 0; i < STYLE_PATTERNS.length; i++) {
    stem = stem.replace(STYLE_PATTERNS[i].re, '')
  }
  return stem.replace(/[-_ ]+$/, '')
}

// Analyze a folder selection. Mirrors bindFamilyAutoDetect's change handler:
// filters to .ttf/.otf, drops extra weights, groups by family, picks the family
// with the most detected styles. Returns null when nothing usable was selected.
export function analyzeFontFolder(fileList) {
  let files = Array.from(fileList || [])
  if (!files.length) return null

  files = files.filter((f) => /\.(ttf|otf)$/i.test(f.name))
  if (!files.length) return null

  files = files.filter((f) => {
    const stem = f.name.replace(/\.(ttf|otf)$/i, '')
    return !EXTRA_WEIGHT_RE.test(stem)
  })
  if (!files.length) return null

  const families = {}
  files.sort((a, b) => a.name.localeCompare(b.name))
  for (let i = 0; i < files.length; i++) {
    const stem = files[i].name.replace(/\.(ttf|otf)$/i, '')
    const fam = extractFamily(stem)
    if (!families[fam]) families[fam] = { files: [], styles: {} }
    const style = detectStyle(stem)
    families[fam].styles[style] = files[i]
    families[fam].files.push(files[i])
  }

  let bestFam = ''
  let bestCount = 0
  for (const fam in families) {
    const count = Object.keys(families[fam].styles).length
    if (count > bestCount) {
      bestCount = count
      bestFam = fam
    }
  }

  const result = { regular: null, bold: null, italic: null, bolditalic: null }
  if (families[bestFam]) {
    const styles = families[bestFam].styles
    result.regular = styles.regular || null
    result.bold = styles.bold || null
    result.italic = styles.italic || null
    result.bolditalic = styles.bolditalic || null
  }

  const otherFamilies = Object.keys(families).filter((f) => f !== bestFam)

  return { result, familyName: bestFam, otherFamilies }
}

// Set a file input's FileList programmatically (same DataTransfer trick as the
// original page) so the native input shows the detected filename.
export function setFileInput(inputEl, file) {
  if (!inputEl || !file) return
  const dt = new DataTransfer()
  dt.items.add(file)
  inputEl.files = dt.files
}

export function sanitizeFamilyName(name) {
  return (name || 'CustomFont').replace(/[^A-Za-z0-9_-]+/g, '')
}

export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

// Interval preset checkboxes; values MUST match the INTERVAL_PRESETS keys in
// scripts/font-builder/fontconvert_sdcard.py (the script CI runs).
export const INTERVAL_PRESETS = [
  { value: 'reading', label: 'Reading', note: '(Fiction)', defaultChecked: true },
  { value: 'default', label: 'Default', note: '(CrossPoint)' },
  { value: 'latin-ext', label: 'Latin Extended' },
  { value: 'greek', label: 'Greek' },
  { value: 'cyrillic', label: 'Cyrillic' },
  { value: 'vietnamese', label: 'Vietnamese' },
  { value: 'hebrew', label: 'Hebrew' },
  { value: 'arabic', label: 'Arabic', note: '(Farsi, Urdu)' },
  { value: 'armenian', label: 'Armenian' },
  { value: 'georgian', label: 'Georgian' },
  { value: 'ethiopic', label: 'Ethiopic' },
  { value: 'cherokee', label: 'Cherokee' },
  { value: 'tifinagh', label: 'Tifinagh' },
  { value: 'bengali', label: 'Bengali' },
  { value: 'thai', label: 'Thai' },
  { value: 'hangul', label: 'Hangul', note: '(Korean)' },
  { value: 'cjk-sc', label: 'Chinese', note: '(Simplified)' },
  { value: 'cjk-tc', label: 'Chinese', note: '(Traditional)' },
  { value: 'cjk-jp', label: 'Japanese' },
  { value: 'symbols', label: 'Symbols & Arrows' },
  { value: 'ipa-chars', label: 'IPA characters' },
]

// Presets that pull in CJK scripts. CrossPoint's built-in UI fonts (menus, book
// titles) are Latin-only and come in 8/10/12 pt; the firmware draws CJK UI text
// by mapping a same-size .cpfont from the loaded family over each of them, so
// CJK builds must also ship the small UI sizes (see DEFAULT_UI_SIZES).
export const CJK_PRESET_VALUES = ['hangul', 'cjk-sc', 'cjk-tc', 'cjk-jp']

// Default UI-fallback point sizes appended to CJK builds. 12 pt is normally
// covered by the Small reader size.
export const DEFAULT_UI_SIZES = ['8', '10']

// CJK block ranges, mirroring utf8IsCjkCodepoint in the reader firmware
// (lib/Utf8/Utf8.h) — the ranges that trigger UI font fallback on device.
const CJK_BLOCKS = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x2e80, 0x2fdf], // CJK Radicals Supplement, Kangxi Radicals
  [0x3000, 0x33ff], // CJK punctuation, Kana, Bopomofo, Hangul Compat
  [0x3400, 0x4dbf], // CJK Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa960, 0xa97f], // Hangul Jamo Extended-A
  [0xac00, 0xd7ff], // Hangul Syllables, Jamo Extended-B
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe30, 0xfe4f], // CJK Compatibility Forms
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
  [0x20000, 0x2ebef], // CJK Extensions B-F
  [0x2f800, 0x2fa1f], // CJK Compatibility Ideographs Supplement
  [0x30000, 0x323af], // CJK Extensions G-H
]

// True when the custom-ranges field (e.g. "(0x4E00-0x9FFF),(0x3040-0x309F)")
// overlaps any CJK block, so CJK typed as raw ranges also gets the UI sizes.
export function customIntervalsContainCjk(text) {
  const re = /0x([0-9a-f]+)\s*-\s*0x([0-9a-f]+)/gi
  let m
  while ((m = re.exec(text || '')) !== null) {
    const lo = parseInt(m[1], 16)
    const hi = parseInt(m[2], 16)
    if (isNaN(lo) || isNaN(hi)) continue
    for (const [blockLo, blockHi] of CJK_BLOCKS) {
      if (lo <= blockHi && hi >= blockLo) return true
    }
  }
  return false
}

// Lazy-load JSZip from the same CDN URL the old page used. Resolves to the
// JSZip constructor, or null if the script failed to load (the caller then
// falls back to individual downloads, exactly like the old page).
let jszipPromise = null
export function loadJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) return Promise.resolve(window.JSZip)
  if (!jszipPromise) {
    jszipPromise = new Promise((resolve) => {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
      s.defer = true
      s.onload = () => resolve(window.JSZip || null)
      s.onerror = () => resolve(null)
      document.head.appendChild(s)
    })
  }
  return jszipPromise
}
