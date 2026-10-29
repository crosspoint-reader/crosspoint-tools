#!/usr/bin/env node
// Byte-compares the browser generator (src/lib/cpfont) against the reference
// Python generator (fontconvert_sdcard.py) for the same inputs.
//
// Usage:
//   node scripts/font-builder/parity.mjs \
//     --regular path/to/Font-Regular.ttf [--bold ...] [--italic ...] [--bolditalic ...] \
//     [--fallback-regular ...] [--fallback2-regular ...] [--default-fallbacks] \
//     [--intervals base,latin-ext] [--sizes 12,14] [--name Family]
//
// Requires: python3 with freetype-py + fonttools (same deps the CI workflow
// installed), matching the FreeType version pinned in wasm/build.sh.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildCpfonts } from '../../src/lib/cpfont/build.js'
import { resolveIntervals } from '../../src/lib/cpfont/intervals.js'
import { DEFAULT_FALLBACK_FILES, defaultFallbackNames } from '../../src/lib/cpfont/fallbacks.js'

// fileURLToPath, not URL.pathname: the latter keeps percent-encoding (a repo
// path with a space arrives as %20) and prefixes a slash on Windows drives.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const FALLBACK_DIR = path.join(HERE, 'default-fallback-fonts')

function parseArgs(argv) {
  const args = { intervals: 'base', sizes: '14', styles: {}, fallbacks: [], defaultFallbacks: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    switch (flag) {
      case '--regular': case '--bold': case '--italic': case '--bolditalic':
        args.styles[flag.slice(2)] = value; i++; break
      case '--fallback-regular':
        args.fallbacks[0] = { regular: value }; i++; break
      case '--fallback2-regular':
        args.fallbacks[1] = { regular: value }; i++; break
      case '--default-fallbacks':
        args.defaultFallbacks = true; break
      case '--intervals': args.intervals = value; i++; break
      case '--sizes': args.sizes = value; i++; break
      case '--name': args.name = value; i++; break
      default:
        throw new Error(`Unknown argument: ${flag}`)
    }
  }
  if (!args.styles.regular) throw new Error('--regular is required')
  return args
}

const args = parseArgs(process.argv.slice(2))
const sizes = args.sizes.split(',').map((size) => parseInt(size.trim(), 10))
const family = args.name
  ?? path.basename(args.styles.regular).replace(/\.(ttf|otf)$/i, '').replace(/-Regular$/i, '')

// The hosted builder appends the bundled defaults after any user fallbacks;
// --default-fallbacks exercises that same chain.
const defaultFallbackList = args.defaultFallbacks ? defaultFallbackNames(args.intervals) : []

const work = mkdtempSync(path.join(tmpdir(), 'cpfont-parity-'))
const pythonOut = path.join(work, 'py')
mkdirSync(pythonOut, { recursive: true })

const pythonArgs = []
for (const [style, file] of Object.entries(args.styles)) pythonArgs.push(`--${style}`, file)
if (args.fallbacks[0]?.regular) pythonArgs.push('--fallback-regular', args.fallbacks[0].regular)
if (args.fallbacks[1]?.regular) pythonArgs.push('--fallback2-regular', args.fallbacks[1].regular)
for (const name of defaultFallbackList) {
  pythonArgs.push('--default-fallback-font', path.join(FALLBACK_DIR, name))
}
pythonArgs.push('--name', family, '--intervals', args.intervals, '--sizes', sizes.join(','),
  '--output-dir', pythonOut)

console.log('==> python fontconvert_sdcard.py')
const pythonLog = execFileSync('python3', [path.join(HERE, 'fontconvert_sdcard.py'), ...pythonArgs],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
writeFileSync(path.join(work, 'python.log'), pythonLog)

console.log('==> browser generator (wasm)')
const read = (file) => new Uint8Array(readFileSync(file))
const jsLog = []
const built = await buildCpfonts({
  family,
  sizes,
  intervals: resolveIntervals(args.intervals),
  styles: Object.fromEntries(Object.entries(args.styles).map(([style, file]) => [style, read(file)])),
  fallbacks: args.fallbacks.map((entry) => (entry ? { regular: read(entry.regular) } : null)),
  defaultFallbacks: defaultFallbackList.map((name) => ({
    name,
    bytes: read(path.join(FALLBACK_DIR, name)),
  })),
  log: (line) => jsLog.push(line),
})
writeFileSync(path.join(work, 'js.log'), jsLog.join('\n'))

// Keep both sides on disk so a failure can be inspected glyph by glyph.
const jsOut = path.join(work, 'js')
mkdirSync(jsOut, { recursive: true })
for (const file of built) writeFileSync(path.join(jsOut, file.name), file.data)

// --- comparison ---
//
// Everything except glyph bitmaps must match exactly. Bitmaps are allowed a
// small tolerance: FreeType's TrueType bytecode interpreter does its hinting
// arithmetic in C `long`, which is 32-bit under wasm and 64-bit in the Python
// generator's native build, so a handful of antialiased edge pixels can land
// one 2-bit level apart. CFF/OTF outlines, autohinted and unhinted rendering
// are unaffected and compare byte for byte.
const BITMAP_TOLERANCE = 0.0005

function parseCpfont(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const styleCount = dv.getUint8(12)
  const styles = []
  for (let s = 0; s < styleCount; s++) {
    const base = HEADER_SIZE + s * TOC_ENTRY_SIZE
    const intervalCount = dv.getUint32(base + 4, true)
    const glyphCount = dv.getUint32(base + 8, true)
    const kernLeftCount = dv.getUint16(base + 17, true)
    const kernRightCount = dv.getUint16(base + 19, true)
    const kernLeftClasses = dv.getUint8(base + 21)
    const kernRightClasses = dv.getUint8(base + 22)
    const ligatureCount = dv.getUint8(base + 23)

    let cursor = dv.getUint32(base + 24, true)
    const sections = {}
    const section = (name, length) => {
      sections[name] = [cursor, cursor + length]
      cursor += length
    }
    section('intervals', intervalCount * 12)
    section('glyphs', glyphCount * 16)
    section('kernLeft', kernLeftCount * 3)
    section('kernRight', kernRightCount * 3)
    section('kernMatrix', kernLeftClasses * kernRightClasses)
    section('ligatures', ligatureCount * 8)
    const bitmapsAt = cursor

    const codepoints = []
    for (let i = 0; i < intervalCount; i++) {
      const start = dv.getUint32(sections.intervals[0] + i * 12, true)
      const end = dv.getUint32(sections.intervals[0] + i * 12 + 4, true)
      for (let cp = start; cp <= end; cp++) codepoints.push(cp)
    }

    const glyphs = []
    for (let g = 0; g < glyphCount; g++) {
      const at = sections.glyphs[0] + g * 16
      glyphs.push({
        codePoint: codepoints[g],
        dataLength: dv.getUint16(at + 8, true),
        dataOffset: dv.getUint32(at + 12, true),
      })
    }

    styles.push({ toc: bytes.subarray(base, base + TOC_ENTRY_SIZE), sections, bitmapsAt, glyphs })
  }
  return { header: bytes.subarray(0, HEADER_SIZE), styles }
}

const sameBytes = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i])

function compare(name, expected, actual) {
  const problems = []
  if (!sameBytes(expected.subarray(0, HEADER_SIZE), actual.subarray(0, HEADER_SIZE))) {
    problems.push('header differs')
    return { problems, bitmapDiff: 0, bitmapBytes: 0, glyphsAffected: [] }
  }

  const py = parseCpfont(expected)
  const js = parseCpfont(actual)
  if (py.styles.length !== js.styles.length) {
    problems.push(`style count ${js.styles.length} != python ${py.styles.length}`)
    return { problems, bitmapDiff: 0, bitmapBytes: 0, glyphsAffected: [] }
  }

  let bitmapDiff = 0
  let bitmapBytes = 0
  const glyphsAffected = []

  for (let s = 0; s < py.styles.length; s++) {
    const a = py.styles[s]
    const b = js.styles[s]
    if (!sameBytes(a.toc, b.toc)) problems.push(`style ${s}: TOC entry differs`)
    for (const [section, [from, to]] of Object.entries(a.sections)) {
      const other = b.sections[section]
      if (!other || !sameBytes(expected.subarray(from, to), actual.subarray(other[0], other[1]))) {
        problems.push(`style ${s}: section ${section} differs`)
      }
    }

    for (let g = 0; g < a.glyphs.length; g++) {
      const ga = a.glyphs[g]
      const gb = b.glyphs[g]
      bitmapBytes += ga.dataLength
      if (ga.dataLength !== gb.dataLength || ga.dataOffset !== gb.dataOffset) continue
      let glyphDiff = 0
      for (let i = 0; i < ga.dataLength; i++) {
        if (expected[a.bitmapsAt + ga.dataOffset + i] !== actual[b.bitmapsAt + gb.dataOffset + i]) glyphDiff++
      }
      if (glyphDiff > 0) {
        bitmapDiff += glyphDiff
        if (glyphsAffected.length < 8) {
          glyphsAffected.push(`U+${ga.codePoint.toString(16).toUpperCase().padStart(4, '0')}(style ${s})`)
        }
      }
    }
  }

  return { problems, bitmapDiff, bitmapBytes, glyphsAffected }
}

const HEADER_SIZE = 32
const TOC_ENTRY_SIZE = 32

let failures = 0
const pythonFiles = new Set(readdirSync(pythonOut))
for (const file of built) {
  if (!pythonFiles.has(file.name)) {
    console.log(`FAIL ${file.name}: python produced no such file`)
    failures++
    continue
  }
  const expected = read(path.join(pythonOut, file.name))
  const actual = file.data
  if (expected.length !== actual.length) {
    console.log(`FAIL ${file.name}: size ${actual.length} != python ${expected.length}`)
    failures++
    continue
  }

  const { problems, bitmapDiff, bitmapBytes, glyphsAffected } = compare(file.name, expected, actual)
  const ratio = bitmapBytes ? bitmapDiff / bitmapBytes : 0
  if (problems.length) {
    console.log(`FAIL ${file.name}: ${problems.join('; ')}`)
    failures++
  } else if (bitmapDiff === 0) {
    console.log(`ok   ${file.name} (${expected.length} bytes identical)`)
  } else if (ratio <= BITMAP_TOLERANCE) {
    console.log(`ok   ${file.name} (${expected.length} bytes; ${bitmapDiff}/${bitmapBytes} bitmap bytes ` +
      `differ, ${(ratio * 100).toFixed(4)}% <= tolerance; hinting-sensitive glyphs: ${glyphsAffected.join(' ')})`)
  } else {
    console.log(`FAIL ${file.name}: ${bitmapDiff}/${bitmapBytes} bitmap bytes differ ` +
      `(${(ratio * 100).toFixed(4)}% > ${(BITMAP_TOLERANCE * 100).toFixed(4)}% tolerance); ` +
      `glyphs: ${glyphsAffected.join(' ')}`)
    failures++
  }
}
for (const name of pythonFiles) {
  if (!built.some((file) => file.name === name)) {
    console.log(`FAIL ${name}: browser generator produced no such file`)
    failures++
  }
}

console.log(`\nlogs: ${work}`)
if (failures === 0) rmSync(work, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)
