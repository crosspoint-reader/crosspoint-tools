import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import {
  analyzeFontFolder,
  setFileInput,
  sanitizeFamilyName,
  INTERVAL_PRESETS,
  CJK_PRESET_VALUES,
  DEFAULT_UI_SIZES,
  customIntervalsContainCjk,
  normalizeCustomIntervals,
  formatSize,
  loadJSZip,
} from './fonts/fontBuilder.js'

const textInputCls =
  'mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none'
const fileInputBrandCls =
  'mt-1.5 block w-full text-sm text-stone-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100'
const fileInputStoneCls =
  'mt-1.5 block w-full text-sm text-stone-500 file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200'
const fileInputWhiteCls =
  'mt-1.5 block w-full text-sm text-stone-500 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-100'

const LOG_COLORS = { info: 'text-stone-500', success: 'text-brand-600', error: 'text-red-600' }

// Set by the backend-less static build (NO_BACKEND=1, see vite.config.js).
// The font builder itself never calls an API — it converts in the browser — but
// the pre-built font library needs the Worker to proxy GitHub release assets,
// whose host sends no CORS headers. A static deploy hides that section rather
// than firing a request that cannot succeed.
const NO_BACKEND = __NO_BACKEND__

function Code({ children, className = '' }) {
  return (
    <code className={`rounded bg-stone-100 px-1 py-0.5 font-mono text-xs text-stone-700 ${className}`}>
      {children}
    </code>
  )
}

export default function FontsPage() {
  const [prebuiltFonts, setPrebuiltFonts] = useState(null)
  const [prebuiltError, setPrebuiltError] = useState('')
  const [prebuiltDownloading, setPrebuiltDownloading] = useState(null)

  // -- form state -----------------------------------------------------------
  const [familyName, setFamilyName] = useState('')
  const [fallbackFamilyName, setFallbackFamilyName] = useState('')
  const [fallback2FamilyName, setFallback2FamilyName] = useState('')
  const [presets, setPresets] = useState(() => {
    const init = {}
    INTERVAL_PRESETS.forEach((p) => {
      init[p.value] = !!p.defaultChecked
    })
    return init
  })
  const [customIntervals, setCustomIntervals] = useState('')
  const [sizes, setSizes] = useState(['12', '14', '16', '18'])
  const [uiSizes, setUiSizes] = useState(DEFAULT_UI_SIZES)

  // CJK coverage selected (preset or custom range): the build must also ship
  // the small UI-fallback sizes so book titles/menus can render CJK on device.
  const cjkSelected =
    CJK_PRESET_VALUES.some((v) => presets[v]) || customIntervalsContainCjk(customIntervals)

  // Auto-detect result panels (monospace multi-line text; hidden when null)
  const [autoDetectResult, setAutoDetectResult] = useState(null)
  const [fallbackAutoDetectResult, setFallbackAutoDetectResult] = useState(null)
  const [fallback2AutoDetectResult, setFallback2AutoDetectResult] = useState(null)

  // -- build state ----------------------------------------------------------
  const [building, setBuilding] = useState(false)
  const [progress, setProgress] = useState(null) // { pct, text } or null (hidden)
  const [logLines, setLogLines] = useState(null) // array or null (hidden)
  const [results, setResults] = useState(null) // { files: [{filename,url,byteLength}] } or null

  // File inputs stay uncontrolled; the folder auto-detect fills them via
  // DataTransfer just like the original page, so filenames show natively.
  const regularRef = useRef(null)
  const boldRef = useRef(null)
  const italicRef = useRef(null)
  const boldItalicRef = useRef(null)
  const fallbackRegularRef = useRef(null)
  const fallback2RegularRef = useRef(null)

  const workerRef = useRef(null)
  const builtFilesRef = useRef([])
  const familyNameRef = useRef('')
  familyNameRef.current = familyName
  const logPanelRef = useRef(null)

  function log(msg, level) {
    setLogLines((prev) => [...(prev || []), { msg, level: level || 'info' }])
  }

  // Auto-scroll the log panel as lines stream in (was scrollIntoView per line).
  useEffect(() => {
    const el = logPanelRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logLines])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      builtFilesRef.current.forEach((file) => URL.revokeObjectURL(file.url))
    }
  }, [])

  useEffect(() => {
    if (NO_BACKEND) return undefined
    let cancelled = false
    fetch('/api/prebuilt-fonts')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the font library.')
        return response.json().catch(() => {
          throw new Error('Could not load the font library.')
        })
      })
      .then((manifest) => {
        if (!cancelled) setPrebuiltFonts(manifest.families)
      })
      .catch((error) => {
        if (!cancelled) setPrebuiltError(error.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function downloadPrebuiltFont(family) {
    setPrebuiltDownloading(family.name)
    setPrebuiltError('')
    try {
      const JSZip = await loadJSZip()
      if (!JSZip) throw new Error('Could not load the ZIP tool. Please try again.')

      const zip = new JSZip()
      const folder = zip.folder(family.name)
      await Promise.all(
        family.files.map(async (file) => {
          const response = await fetch('/api/prebuilt-fonts/' + encodeURIComponent(file.name))
          if (!response.ok) throw new Error('Could not download ' + file.name + '.')
          folder.file(file.name, await response.blob())
        })
      )
      const link = document.createElement('a')
      link.href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }))
      link.download = family.name + '_cpfonts.zip'
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (error) {
      setPrebuiltError(error.message)
    } finally {
      setPrebuiltDownloading(null)
    }
  }

  // -- folder auto-detect ---------------------------------------------------
  function handleFolder(e, config) {
    const analysis = analyzeFontFolder(e.target.files)
    if (!analysis) return
    const { result, familyName: fam, otherFamilies } = analysis

    setFileInput(config.regularRef.current, result.regular)
    if (config.boldRef) setFileInput(config.boldRef.current, result.bold)
    if (config.italicRef) setFileInput(config.italicRef.current, result.italic)
    if (config.boldItalicRef) setFileInput(config.boldItalicRef.current, result.bolditalic)

    if (fam) {
      config.setFamily((prev) => prev || fam.replace(/[-_]/g, ' '))
    }

    const lines = []
    if (result.regular) lines.push('Regular: ' + result.regular.name)
    if (config.boldRef && result.bold) lines.push('Bold: ' + result.bold.name)
    if (config.italicRef && result.italic) lines.push('Italic: ' + result.italic.name)
    if (config.boldItalicRef && result.bolditalic) lines.push('Bold Italic: ' + result.bolditalic.name)
    if (otherFamilies.length) {
      lines.push('Other families found: ' + otherFamilies.join(', '))
    }
    config.setResult(lines.join('\n'))
  }

  // -- intervals ------------------------------------------------------------
  function intervalSelection() {
    const parts = INTERVAL_PRESETS.filter((p) => presets[p.value]).map((p) => p.value)
    const custom = normalizeCustomIntervals(customIntervals)
    if (custom.ok && custom.value) parts.push(custom.value)
    return parts.length ? parts.join(',') : 'base'
  }

  // -- in-browser build ------------------------------------------------------
  //
  // The conversion runs in a Web Worker on a wasm FreeType build (src/lib/cpfont).
  // Nothing is uploaded: the fonts never leave the browser, and the only network
  // traffic is the bundled fallback fonts the worker pulls from /font-fallbacks/.
  function releaseResults() {
    builtFilesRef.current.forEach((file) => URL.revokeObjectURL(file.url))
    builtFilesRef.current = []
  }

  function runBuild(request) {
    workerRef.current?.terminate()
    const worker = new Worker(new URL('../lib/cpfont/cpfont.worker.js', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    const startedAt = Date.now()
    let sizesStarted = 0

    const finish = () => {
      worker.terminate()
      workerRef.current = null
      setBuilding(false)
    }

    return new Promise((resolve, reject) => {
      worker.onmessage = (event) => {
        const message = event.data
        if (message.type === 'log') {
          log(message.line, 'info')
          return
        }
        if (message.type === 'phase') {
          setProgress(
            message.phase === 'fallbacks'
              ? { pct: 5, text: 'Loading fallback fonts...' }
              : { pct: 20, text: 'Rasterizing glyphs...' }
          )
          return
        }
        if (message.type === 'progress') {
          if (message.phase === 'fallbacks') {
            // Fallback downloads get the first 20%; the CJK files are ~16 MB each.
            setProgress({
              pct: 5 + Math.round((message.index / message.total) * 15),
              text: `Loading fallback fonts (${message.index + 1}/${message.total})...`,
            })
          } else {
            setProgress({
              pct: 20 + Math.round((sizesStarted++ / request.sizes.length) * 75),
              text: `Building ${message.name}...`,
            })
          }
          return
        }
        if (message.type === 'done') {
          releaseResults()
          const files = message.files.map((file) => {
            const blob = new Blob([file.data], { type: 'application/octet-stream' })
            return {
              filename: file.name,
              url: URL.createObjectURL(blob),
              blob,
              byteLength: blob.size,
            }
          })
          builtFilesRef.current = files
          setResults({ files })
          setProgress({
            pct: 100,
            text: 'Done in ' + Math.round((Date.now() - startedAt) / 1000) + 's',
          })
          log('Generated ' + files.length + ' file(s)', 'success')
          finish()
          resolve()
          return
        }
        if (message.type === 'error') {
          finish()
          reject(new Error(message.message))
        }
      }

      worker.onerror = (event) => {
        finish()
        reject(new Error(event.message || 'The font builder failed to start'))
      }

      // Font bytes are transferred rather than copied — a CJK family runs to
      // tens of megabytes.
      const transfers = Object.values(request.styles).filter(Boolean)
      for (const family of request.fallbacks) {
        if (family) transfers.push(...Object.values(family).filter(Boolean))
      }
      worker.postMessage({ type: 'build', request }, transfers)
    })
  }

  // -- build ----------------------------------------------------------------
  async function startBuild() {
    const regularFile = regularRef.current.files[0]
    if (!regularFile) {
      alert('Please select a Regular font file.')
      return
    }
    const familyRaw = familyName.trim()
    if (!familyRaw) {
      alert('Please enter a font family name.')
      return
    }
    const customCheck = normalizeCustomIntervals(customIntervals)
    if (!customCheck.ok) {
      alert(customCheck.error)
      return
    }
    const intervals = intervalSelection()
    const fallbackFamilyRaw = fallbackFamilyName.trim()
    const fallbackRegular = fallbackRegularRef.current.files[0]
    const fallback2FamilyRaw = fallback2FamilyName.trim()
    const fallback2Regular = fallback2RegularRef.current.files[0]
    const hasFallbackFiles = !!fallbackRegular
    const hasFallback2Files = !!fallback2Regular
    if (hasFallbackFiles && !fallbackFamilyRaw) {
      alert('Please enter a fallback family 1 name.')
      return
    }
    if ((fallbackFamilyRaw || hasFallbackFiles) && !fallbackRegular) {
      alert('Please select a fallback family 1 Regular font file.')
      return
    }
    if (hasFallback2Files && !fallback2FamilyRaw) {
      alert('Please enter a fallback family 2 name.')
      return
    }
    if ((fallback2FamilyRaw || hasFallback2Files) && !fallback2Regular) {
      alert('Please select a fallback family 2 Regular font file.')
      return
    }

    setBuilding(true)
    setLogLines([])
    setResults(null)
    releaseResults()
    setProgress({ pct: 0, text: 'Reading font files...' })

    try {
      const sizeValues = [
        parseInt(sizes[0], 10) || 12,
        parseInt(sizes[1], 10) || 14,
        parseInt(sizes[2], 10) || 16,
        parseInt(sizes[3], 10) || 18,
      ]
      if (cjkSelected) {
        // CJK builds also ship the UI-fallback sizes; skip any that duplicate
        // a reader size (the firmware reuses the same-size file).
        const uiValues = [
          parseInt(uiSizes[0], 10) || parseInt(DEFAULT_UI_SIZES[0], 10),
          parseInt(uiSizes[1], 10) || parseInt(DEFAULT_UI_SIZES[1], 10),
        ]
        for (const v of uiValues) {
          if (!sizeValues.includes(v)) sizeValues.push(v)
        }
        sizeValues.sort((a, b) => a - b)
      }

      // ArrayBuffers, not Files: the worker gets the bytes transferred to it.
      const readFile = async (file) => (file ? await file.arrayBuffer() : null)
      const styles = {
        regular: await readFile(regularFile),
        bold: await readFile(boldRef.current.files[0]),
        italic: await readFile(italicRef.current.files[0]),
        bolditalic: await readFile(boldItalicRef.current.files[0]),
      }
      const fallbacks = [
        fallbackRegular ? { regular: await readFile(fallbackRegular) } : null,
        fallback2Regular ? { regular: await readFile(fallback2Regular) } : null,
      ]

      const styleCount = Object.values(styles).filter(Boolean).length
      log(`Converting ${styleCount} style(s) at ${sizeValues.length} size(s) in your browser...`, 'info')

      await runBuild({
        family: familyRaw,
        sizes: sizeValues,
        intervals,
        styles,
        fallbacks,
      })
    } catch (err) {
      log('Error: ' + err.message, 'error')
      setProgress((prev) => ({ pct: prev ? prev.pct : 0, text: 'Failed' }))
      setBuilding(false)
    }
  }

  // -- download all ---------------------------------------------------------
  async function downloadAll() {
    const builtFiles = builtFilesRef.current
    if (builtFiles.length === 0) return

    const JSZip = await loadJSZip()
    if (JSZip) {
      const zip = new JSZip()
      const fam = sanitizeFamilyName(familyNameRef.current)
      const folder = zip.folder(fam)
      for (const f of builtFiles) {
        folder.file(f.filename, f.blob)
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = fam + '_cpfonts.zip'
      a.click()
      URL.revokeObjectURL(a.href)
    } else {
      // Fallback: trigger individual downloads via the existing links.
      builtFiles.forEach((f) => {
        const a = document.createElement('a')
        a.href = f.url
        a.download = f.filename
        a.click()
      })
    }
  }

  // -- render ---------------------------------------------------------------
  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 dot-field text-stone-300/60 [mask-image:radial-gradient(110%_100%_at_50%_0%,black,transparent_70%)]"
        />
        <div className="relative mx-auto max-w-3xl px-6 pt-16 pb-8 sm:pt-20 sm:pb-10">
          <Eyebrow>CrossPoint Fonts</Eyebrow>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-5xl">
            Font Downloader &amp; Builder
          </h1>
          <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">
            Download a ready-made font family or convert your own TrueType or OpenType fonts to
            CrossPoint&rsquo;s <Code className="text-sm">.cpfont</Code> format.
          </p>
        </div>
      </section>

      {/* Builder */}
      <section className="pb-20 sm:pb-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-6">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
              Build your own
            </h2>
            <p className="mt-2 text-sm/6 text-stone-600">
              Includes kerning and ligature support. No tools to install.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-950/5 sm:p-8">
            {/* Family name */}
            <div className="mb-6">
              <label htmlFor="familyName" className="block text-sm/6 font-medium text-stone-700">
                Font Family Name
              </label>
              <input
                type="text"
                id="familyName"
                placeholder="e.g. Literata"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className={textInputCls}
              />
              <p className="mt-1.5 text-xs text-stone-400">
                Letters, numbers, spaces, and dashes. Shown on the reader as one font family.
              </p>
            </div>

            {/* Font file inputs */}
            <div className="mb-4">
              <label className="block text-sm/6 font-medium text-stone-700">
                Quick add from folder
              </label>
              <p className="mt-1 text-xs text-stone-400">
                Select all font files at once. Styles are detected from filenames (e.g.
                FontName-Bold.ttf, FontName-BoldItalic.otf).
              </p>
              <input
                type="file"
                id="fontFolder"
                accept=".ttf,.otf,.TTF,.OTF"
                webkitdirectory=""
                onChange={(e) =>
                  handleFolder(e, {
                    regularRef,
                    boldRef,
                    italicRef,
                    boldItalicRef,
                    setFamily: setFamilyName,
                    setResult: setAutoDetectResult,
                  })
                }
                className={fileInputBrandCls}
              />
              {autoDetectResult !== null && (
                <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-stone-600">
                  {autoDetectResult}
                </div>
              )}
            </div>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 font-mono text-xs tracking-wide text-stone-400 uppercase">
                  or pick individually
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm/6 font-medium text-stone-700">
                  Regular <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  id="fontRegular"
                  ref={regularRef}
                  accept=".ttf,.otf,.TTF,.OTF"
                  className={fileInputStoneCls}
                />
              </div>
              <div>
                <label className="block text-sm/6 font-medium text-stone-700">
                  Bold <span className="text-xs text-stone-400">(optional)</span>
                </label>
                <input
                  type="file"
                  id="fontBold"
                  ref={boldRef}
                  accept=".ttf,.otf,.TTF,.OTF"
                  className={fileInputStoneCls}
                />
              </div>
              <div>
                <label className="block text-sm/6 font-medium text-stone-700">
                  Italic <span className="text-xs text-stone-400">(optional)</span>
                </label>
                <input
                  type="file"
                  id="fontItalic"
                  ref={italicRef}
                  accept=".ttf,.otf,.TTF,.OTF"
                  className={fileInputStoneCls}
                />
              </div>
              <div>
                <label className="block text-sm/6 font-medium text-stone-700">
                  Bold Italic <span className="text-xs text-stone-400">(optional)</span>
                </label>
                <input
                  type="file"
                  id="fontBoldItalic"
                  ref={boldItalicRef}
                  accept=".ttf,.otf,.TTF,.OTF"
                  className={fileInputStoneCls}
                />
              </div>
            </div>

            {/* Fallback families */}
            <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm font-semibold tracking-tight text-stone-900">
                  Fallback Font Families
                </h2>
                <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-stone-500 ring-1 ring-stone-200 ring-inset">
                  Optional uploads
                </span>
              </div>
              <p className="mt-1.5 text-sm/6 text-stone-500">
                Add up to two regular-style fallback families to fill glyph gaps left by the main
                family. If those still miss a selected character, the builder uses a built-in
                safety-net font.
              </p>

              <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
                <label
                  htmlFor="fallbackFamilyName"
                  className="block text-sm/6 font-medium text-stone-700"
                >
                  Fallback Family 1 Name
                </label>
                <input
                  type="text"
                  id="fallbackFamilyName"
                  placeholder="e.g. Noto Sans Symbols"
                  value={fallbackFamilyName}
                  onChange={(e) => setFallbackFamilyName(e.target.value)}
                  className={textInputCls}
                />
                <p className="mt-1.5 text-xs text-stone-400">
                  Same character rules as the main family. If you upload the fallback file, add the
                  family name here too.
                </p>

                <div className="mt-4">
                  <label className="block text-sm/6 font-medium text-stone-700">
                    Quick add fallback family 1 from folder
                  </label>
                  <p className="mt-1 text-xs text-stone-400">
                    Picks the regular file from the detected fallback family and ignores bold or
                    italic variants.
                  </p>
                  <input
                    type="file"
                    id="fallbackFontFolder"
                    accept=".ttf,.otf,.TTF,.OTF"
                    webkitdirectory=""
                    onChange={(e) =>
                      handleFolder(e, {
                        regularRef: fallbackRegularRef,
                        setFamily: setFallbackFamilyName,
                        setResult: setFallbackAutoDetectResult,
                      })
                    }
                    className={fileInputBrandCls}
                  />
                  {fallbackAutoDetectResult !== null && (
                    <div className="mt-2 rounded-lg bg-white px-3 py-2 font-mono text-xs whitespace-pre-wrap text-stone-600 ring-1 ring-stone-200 ring-inset">
                      {fallbackAutoDetectResult}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <div>
                    <label className="block text-sm/6 font-medium text-stone-700">
                      Fallback 1 Regular{' '}
                      <span className="text-xs text-stone-400">(required if used)</span>
                    </label>
                    <input
                      type="file"
                      id="fallbackFontRegular"
                      ref={fallbackRegularRef}
                      accept=".ttf,.otf,.TTF,.OTF"
                      className={fileInputWhiteCls}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
                <label
                  htmlFor="fallback2FamilyName"
                  className="block text-sm/6 font-medium text-stone-700"
                >
                  Fallback Family 2 Name
                </label>
                <input
                  type="text"
                  id="fallback2FamilyName"
                  placeholder="e.g. Noto Emoji"
                  value={fallback2FamilyName}
                  onChange={(e) => setFallback2FamilyName(e.target.value)}
                  className={textInputCls}
                />
                <p className="mt-1.5 text-xs text-stone-400">
                  Optional second fallback family, checked only after fallback family 1.
                </p>

                <div className="mt-4">
                  <label className="block text-sm/6 font-medium text-stone-700">
                    Quick add fallback family 2 from folder
                  </label>
                  <p className="mt-1 text-xs text-stone-400">
                    Again, only the detected regular file is used.
                  </p>
                  <input
                    type="file"
                    id="fallback2FontFolder"
                    accept=".ttf,.otf,.TTF,.OTF"
                    webkitdirectory=""
                    onChange={(e) =>
                      handleFolder(e, {
                        regularRef: fallback2RegularRef,
                        setFamily: setFallback2FamilyName,
                        setResult: setFallback2AutoDetectResult,
                      })
                    }
                    className={fileInputBrandCls}
                  />
                  {fallback2AutoDetectResult !== null && (
                    <div className="mt-2 rounded-lg bg-white px-3 py-2 font-mono text-xs whitespace-pre-wrap text-stone-600 ring-1 ring-stone-200 ring-inset">
                      {fallback2AutoDetectResult}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <div>
                    <label className="block text-sm/6 font-medium text-stone-700">
                      Fallback 2 Regular{' '}
                      <span className="text-xs text-stone-400">(required if used)</span>
                    </label>
                    <input
                      type="file"
                      id="fallback2FontRegular"
                      ref={fallback2RegularRef}
                      accept=".ttf,.otf,.TTF,.OTF"
                      className={fileInputWhiteCls}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="mt-6 flex flex-wrap items-end gap-6">
              <div className="w-full">
                <label className="flex items-center gap-1.5 text-sm/6 font-medium text-stone-700">
                  Additional Unicode Coverage
                  <span className="group relative">
                    <span className="flex size-4 cursor-help items-center justify-center rounded-full bg-stone-200 text-[10px] font-bold text-stone-500">
                      ?
                    </span>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-stone-800 px-3 py-2.5 text-xs leading-relaxed font-normal text-stone-100 shadow-lg group-hover:block">
                      Choose extra Unicode ranges for books that need them. More coverage = larger
                      files.
                      <br />
                      <br />
                      Every build includes Base coverage first: ASCII/basic Latin plus Unicode
                      punctuation. This keeps normal letters, numbers, spaces, smart quotes, dashes,
                      and ellipses available without adding broad language ranges.
                      <br />
                      <br />
                      Your selections below are added on top of Base coverage. If you skip fallback
                      fonts, or if they do not contain a selected character, the builder uses a
                      built-in safety-net font. Some uncommon Unicode characters may still be
                      omitted from the generated{' '}
                      <code className="rounded bg-stone-700/60 px-1 py-0.5 font-mono text-[11px] text-stone-100">
                        .cpfont
                      </code>
                      .
                      <br />
                      <br />
                      <strong className="text-white">Default</strong>: Enables the same general
                      Unicode ranges as the default CrossPoint fonts: English, most European
                      languages, Cyrillic (Russian, Ukrainian, etc.), combining diacritics, math
                      operators, arrows, and common ligatures.
                      <br />
                      <br />
                      <strong className="text-white">
                        Reading (recommended for fiction)
                      </strong>: Includes Default coverage plus extra ranges often seen in
                      English-language fiction and scifi/popsci: broader Latin, Greek terms like λ
                      and φ, box/geometric symbols, supplemental arrows, uncommon dialogue
                      punctuation, CJK quote marks, music notes (♪ ♫ ♬), stars (★), and dingbats
                      (✓).
                      <br />
                      <br />
                      <strong className="text-white">Arabic</strong>: Covers Arabic, Farsi, and
                      Urdu letterforms (including Persian/Urdu-specific letters and presentation
                      forms). Note: correct joined rendering depends on the reader&rsquo;s
                      text-shaping pipeline, not just glyph coverage; isolated codepoints alone
                      may render disconnected.
                      <br />
                      <br />
                      <strong className="text-white">Note on Fallback Fonts</strong>: Fallback fonts
                      only fill missing characters. The main family is always checked first, then
                      your fallback family 1, your fallback family 2, and finally the builder's
                      safety-net font. Fallback fonts do not replace characters the main family
                      already has.
                    </span>
                  </span>
                </label>
                <p className="mt-1.5 text-xs text-stone-400">
                  Base coverage is always included. Check extra scripts and symbols your readers
                  need.
                </p>
                {/* Preset values MUST match the INTERVAL_PRESETS keys in
                    src/lib/cpfont/intervals.js and its reference implementation,
                    scripts/font-builder/fontconvert_sdcard.py. */}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  {INTERVAL_PRESETS.map((p) => (
                    <label
                      key={p.value}
                      className="flex items-center gap-2 text-sm text-stone-700"
                    >
                      <input
                        type="checkbox"
                        name="intervalPreset"
                        value={p.value}
                        checked={presets[p.value]}
                        onChange={(e) =>
                          setPresets((prev) => ({ ...prev, [p.value]: e.target.checked }))
                        }
                        className="rounded border-stone-300 accent-brand-600"
                      />{' '}
                      {p.label}{' '}
                      {p.note && <span className="text-xs text-stone-400">{p.note}</span>}
                    </label>
                  ))}
                </div>
                <div className="mt-3">
                  <label
                    htmlFor="customIntervals"
                    className="block text-xs font-medium text-stone-600"
                  >
                    Additional custom ranges{' '}
                    <span className="font-normal text-stone-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="customIntervals"
                    value={customIntervals}
                    onChange={(e) => setCustomIntervals(e.target.value)}
                    placeholder="(0x2900-0x29FF),(0x2E00-0x2EFF)"
                    className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                  />
                  {(() => {
                    const check = normalizeCustomIntervals(customIntervals)
                    return check.ok ? (
                      <p className="mt-1.5 max-w-[42rem] text-xs text-stone-400">
                        Comma-separated hex ranges added on top of the checked presets. Example:{' '}
                        <Code className="text-[11px]">(0x2900-0x29FF),(0x2E00-0x2EFF)</Code>. Single
                        codepoints like <Code className="text-[11px]">0x2122</Code> also work.
                      </p>
                    ) : (
                      <p className="mt-1.5 max-w-[42rem] text-xs text-red-600">{check.error}</p>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Font sizes */}
            <div className="mt-6">
              <label className="block text-sm/6 font-medium text-stone-700">Font Sizes (pt)</label>
              <p className="mt-1 text-xs text-stone-400">
                Each size maps to a reader step: Small, Medium, Large, Extra Large.
              </p>
              <div className="mt-2 grid grid-cols-4 gap-3">
                {['Small', 'Medium', 'Large', 'Extra Large'].map((name, i) => (
                  <div key={name}>
                    <label
                      htmlFor={`size${i}`}
                      className="block font-mono text-xs font-medium text-stone-500"
                    >
                      {name}
                    </label>
                    <input
                      type="number"
                      id={`size${i}`}
                      value={sizes[i]}
                      min="8"
                      max="48"
                      onChange={(e) =>
                        setSizes((prev) => {
                          const next = prev.slice()
                          next[i] = e.target.value
                          return next
                        })
                      }
                      className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              {cjkSelected && (
                <div className="mt-4">
                  <label className="block text-sm/6 font-medium text-stone-700">
                    UI Font Sizes (pt)
                  </label>
                  <p className="mt-1 max-w-[42rem] text-xs text-stone-400">
                    CrossPoint&rsquo;s built-in UI fonts (menus, book titles) are Latin-only and
                    come in 8, 10, and 12 pt. Because your coverage includes CJK, these two extra
                    sizes are generated so the reader can draw CJK UI text with matching
                    same-size fonts from this family. The 12 pt UI size is served by the Small
                    reader size &mdash; keep Small at 12 pt for full coverage.
                  </p>
                  <div className="mt-2 grid grid-cols-4 gap-3">
                    {['UI Small', 'UI Medium'].map((name, i) => (
                      <div key={name}>
                        <label
                          htmlFor={`uiSize${i}`}
                          className="block font-mono text-xs font-medium text-stone-500"
                        >
                          {name}
                        </label>
                        <input
                          type="number"
                          id={`uiSize${i}`}
                          value={uiSizes[i]}
                          min="6"
                          max="16"
                          onChange={(e) =>
                            setUiSizes((prev) => {
                              const next = prev.slice()
                              next[i] = e.target.value
                              return next
                            })
                          }
                          className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Build button */}
            <div className="mt-8">
              <button
                id="buildBtn"
                onClick={startBuild}
                disabled={building}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  className="size-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z"
                  />
                </svg>
                Build .cpfont files
              </button>
            </div>

            {/* Progress */}
            {progress && (
              <div className="mt-6">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-300"
                    style={{ width: progress.pct + '%' }}
                  />
                </div>
                <p className="mt-2 text-center font-mono text-sm text-stone-500">
                  {progress.text}
                </p>
              </div>
            )}

            {/* Log */}
            {logLines !== null && (
              <div
                ref={logPanelRef}
                className="mt-6 max-h-64 overflow-y-auto rounded-xl bg-stone-50 p-4 font-mono text-xs leading-5 text-stone-600"
              >
                {logLines.map((line, i) => (
                  <div key={i} className={LOG_COLORS[line.level] || LOG_COLORS.info}>
                    {line.msg}
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            {results && (
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold tracking-tight text-stone-900">
                    Generated Files
                  </h3>
                  <button
                    id="downloadAllBtn"
                    onClick={downloadAll}
                    className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200"
                  >
                    <svg
                      className="size-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    Download All (.zip)
                  </button>
                </div>
                <ul className="mt-3 divide-y divide-stone-100">
                  {results.files.map((f) => (
                    <li key={f.filename} className="flex items-center justify-between py-3">
                      <div>
                        <span className="font-mono text-sm font-medium text-stone-900">
                          {f.filename}
                        </span>
                        {f.byteLength != null && (
                          <span className="ml-2 font-mono text-xs text-stone-400">
                            {formatSize(f.byteLength)}
                          </span>
                        )}
                      </div>
                      <a
                        href={f.url}
                        download={f.filename}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
                      >
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-950/5 sm:p-8">
            <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">
              How to install
            </h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm/6 text-stone-600">
              <li>
                Download the generated <Code>.cpfont</Code> files (or the zip).
              </li>
              <li>
                Connect to your reader's WiFi and open the web interface, then go to the{' '}
                <strong>Fonts</strong> page and upload each file. Or copy them to the SD card
                directly.
              </li>
              <li>
                If copying to the SD card, place each file at{' '}
                <Code className="max-w-full break-words whitespace-normal">
                  /fonts/&lt;FamilyName&gt;/&lt;FamilyName&gt;_&lt;size&gt;.cpfont
                </Code>
                ; the folder name must match the family name in the filename. For example, files
                named <Code>Literata_12.cpfont</Code> through <Code>Literata_18.cpfont</Code> all go
                in <Code>/fonts/Literata/</Code>. Use <Code>/.fonts/&lt;FamilyName&gt;/</Code>{' '}
                instead if you'd prefer the folder hidden (toggle show hidden files on your OS to
                see it).
              </li>
              <li>The font will appear in your reader's font settings.</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Pre-built library (Worker-backed; hidden in the static build) */}
      {!NO_BACKEND && (
      <section className="pb-20 sm:pb-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
                Pre-built fonts
              </h2>
              <p className="mt-2 text-sm/6 text-stone-600">
                Choose a family to download every available size in one ZIP. Unzip it, then copy
                the family folder to <Code>/fonts/</Code> on the SD card.
              </p>
            </div>
            <a
              href="https://github.com/crosspoint-reader/crosspoint-fonts/releases/latest"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              View latest release &rarr;
            </a>
          </div>

          {prebuiltFonts === null && !prebuiltError && (
            <p className="mt-6 text-sm text-stone-500">Loading font library&hellip;</p>
          )}
          {prebuiltError && (
            <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {prebuiltError}
            </p>
          )}
          {prebuiltFonts && (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {prebuiltFonts.map((family) => {
                const sizes = family.files
                  .map((file) => file.name.match(/_(\d+)\.cpfont$/)?.[1])
                  .filter(Boolean)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .join(', ')
                const totalSize = family.files.reduce((total, file) => total + file.size, 0)
                const downloading = prebuiltDownloading === family.name
                return (
                  <li
                    key={family.name}
                    className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-950/5"
                  >
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-stone-900">{family.name}</h3>
                      <p className="mt-1 text-sm/5 text-stone-500">{family.description}</p>
                      <p className="mt-2 font-mono text-xs text-stone-400">
                        {sizes} pt &middot; {formatSize(totalSize)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadPrebuiltFont(family)}
                      disabled={prebuiltDownloading !== null}
                      className="shrink-0 rounded-md bg-brand-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {downloading ? 'Zipping…' : 'Download ZIP'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
      )}
    </Layout>
  )
}
