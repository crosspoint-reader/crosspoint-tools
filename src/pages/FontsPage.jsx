import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import {
  analyzeFontFolder,
  setFileInput,
  sanitizeFamilyName,
  INTERVAL_PRESETS,
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

function Code({ children, className = '' }) {
  return (
    <code className={`rounded bg-stone-100 px-1 py-0.5 font-mono text-xs text-stone-700 ${className}`}>
      {children}
    </code>
  )
}

export default function FontsPage() {
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

  const pollTimerRef = useRef(null)
  const builtFilesRef = useRef([])
  const familyNameRef = useRef('')
  familyNameRef.current = familyName
  const logPanelRef = useRef(null)
  const resumedRef = useRef(false)

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
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

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
    const custom = customIntervals.trim()
    if (custom) parts.push(custom)
    return parts.length ? parts.join(',') : 'base'
  }

  // -- polling --------------------------------------------------------------
  function renderResults(build) {
    const files = (build.outputs || []).map((name) => ({
      filename: name,
      url: '/api/font-build/result/' + encodeURIComponent(name),
      byteLength: null,
    }))
    builtFilesRef.current = files
    setResults({ files })
    log('Generated ' + files.length + ' file(s)', 'success')
  }

  function pollUntilDone() {
    const startedAt = Date.now()
    let lastLogLen = 0

    return new Promise((resolve, reject) => {
      function tick() {
        fetch('/api/font-build/status', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((data) => {
            const b = data.build
            if (!b) {
              throw new Error('Build disappeared. Try again?')
            }
            // Stream new log lines into the panel as they appear.
            if (b.log && b.log.length > lastLogLen) {
              const fresh = b.log.slice(lastLogLen)
              lastLogLen = b.log.length
              fresh.split('\n').forEach((line) => {
                if (line.trim()) log(line, 'info')
              })
            }
            if (b.status === 'success') {
              setProgress({
                pct: 100,
                text: 'Done in ' + Math.round((Date.now() - startedAt) / 1000) + 's',
              })
              renderResults(b)
              setBuilding(false)
              resolve()
              return
            }
            if (b.status === 'failed') {
              throw new Error(b.error || 'Build failed. Check Actions logs.')
            }
            // Soft progress: 15% -> 90% over ~45s, then idle at 90%.
            const elapsed = (Date.now() - startedAt) / 1000
            const pct = Math.min(90, 15 + Math.round((elapsed / 45) * 75))
            setProgress({
              pct,
              text:
                (b.status === 'pending' ? 'Queued' : 'Building') +
                '... ' +
                Math.round(elapsed) +
                's elapsed',
            })
            pollTimerRef.current = setTimeout(tick, 2000)
          })
          .catch((err) => {
            setBuilding(false)
            reject(err)
          })
      }
      tick()
    })
  }

  // On load: if there's a prior in-progress build for this user, resume polling.
  useEffect(() => {
    if (resumedRef.current) return
    resumedRef.current = true
    ;(async function resumeIfBuilding() {
      try {
        const res = await fetch('/api/font-build/status', { credentials: 'same-origin' })
        if (!res.ok) return
        const data = await res.json()
        const b = data.build
        if (!b) return
        if (b.status === 'success') {
          renderResults(b)
        } else if (b.status === 'pending' || b.status === 'building') {
          setBuilding(true)
          setProgress({ pct: 15, text: 'Resuming previous build...' })
          setLogLines((prev) => prev || [])
          log('Resuming build ' + b.buildId + '...', 'info')
          pollUntilDone().catch((err) => {
            log('Error: ' + err.message, 'error')
          })
        }
      } catch (e) {
        /* no-op */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setProgress({ pct: 5, text: 'Uploading fonts...' })
    builtFilesRef.current = []
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }

    try {
      const sizeValues = [
        parseInt(sizes[0], 10) || 12,
        parseInt(sizes[1], 10) || 14,
        parseInt(sizes[2], 10) || 16,
        parseInt(sizes[3], 10) || 18,
      ]

      // Always start fresh; clears any prior build for this user so we
      // never collide with the worker's per-user lock from an old session.
      await fetch('/api/font-build/clear', { method: 'POST', credentials: 'same-origin' })

      const fd = new FormData()
      fd.append('regular', regularFile)
      const bold = boldRef.current.files[0]
      const italic = italicRef.current.files[0]
      const boldItalic = boldItalicRef.current.files[0]
      if (bold) fd.append('bold', bold)
      if (italic) fd.append('italic', italic)
      if (boldItalic) fd.append('bolditalic', boldItalic)
      fd.append('family', familyRaw)
      fd.append('sizes', sizeValues.join(','))
      fd.append('intervals', intervals)
      if (fallbackFamilyRaw) {
        fd.append('fallbackFamily', fallbackFamilyRaw)
      }
      if (fallbackRegular) fd.append('fallback_regular', fallbackRegular)
      if (fallback2FamilyRaw) {
        fd.append('fallback2Family', fallback2FamilyRaw)
      }
      if (fallback2Regular) fd.append('fallback2_regular', fallback2Regular)

      const uploadCount =
        1 +
        (bold ? 1 : 0) +
        (italic ? 1 : 0) +
        (boldItalic ? 1 : 0) +
        (fallbackRegular ? 1 : 0) +
        (fallback2Regular ? 1 : 0)
      log('Uploading ' + uploadCount + ' file(s)...', 'info')

      const res = await fetch('/api/font-build/upload', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || 'Upload failed: HTTP ' + res.status)
      }
      log('Build queued (id ' + body.buildId + '). Running fontconvert_sdcard.py on a fresh runner...', 'info')
      setProgress({ pct: 15, text: 'Building... (this usually takes ~30s)' })

      await pollUntilDone()
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
      for (let i = 0; i < builtFiles.length; i++) {
        const f = builtFiles[i]
        const res = await fetch(f.url, { credentials: 'same-origin' })
        if (!res.ok) {
          log('Failed to fetch ' + f.filename + ' (HTTP ' + res.status + ')', 'error')
          continue
        }
        folder.file(f.filename, await res.blob())
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
          <Eyebrow>Custom Fonts</Eyebrow>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-5xl">
            Font Builder
          </h1>
          <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">
            Convert TrueType or OpenType fonts to CrossPoint's{' '}
            <Code className="text-sm">.cpfont</Code> format directly in your browser. Includes
            kerning and ligature support. No tools to install.
          </p>
        </div>
      </section>

      {/* Builder */}
      <section className="pb-20 sm:pb-24">
        <div className="mx-auto max-w-3xl px-6">
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
                    scripts/font-builder/fontconvert_sdcard.py (the script CI runs). */}
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
                  <p className="mt-1.5 max-w-[42rem] text-xs text-stone-400">
                    Comma-separated hex ranges added on top of the checked presets. Example:{' '}
                    <Code className="text-[11px]">(0x2900-0x29FF),(0x2E00-0x2EFF)</Code>
                  </p>
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
    </Layout>
  )
}
