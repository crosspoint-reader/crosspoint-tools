import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import DownloadModal from '../components/DownloadModal.jsx'
import { Eyebrow } from '../components/ui.jsx'
import {
  CrossPointFlasher,
  fetchEarlyAccessFirmware,
  fetchBuildMeta,
  fetchFontList,
  fetchCustomBuildStatus,
  uploadCustomFonts,
  fetchCustomFirmware,
  downloadBlob,
} from '../lib/flasher.js'
import {
  formatDate,
  formatSize,
  getFlashSteps,
  ChangelogList,
  FlashSteps,
  Spinner,
} from './insider/buildShared.jsx'

const MODELS = [
  { id: 'x4', name: 'Xteink X4', res: '480 × 800' },
  { id: 'x3', name: 'Xteink X3', res: '528 × 792' },
]

const STATUS_META = {
  success: {
    dot: 'bg-brand-500',
    badge: 'bg-brand-50 text-brand-600',
    badgeText: 'Ready',
    title: 'Latest Build',
  },
  building: {
    dot: 'bg-amber-500 animate-pulse',
    badge: 'bg-amber-50 text-amber-700',
    badgeText: 'Building',
    title: 'Build In Progress',
  },
  failed: {
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700',
    badgeText: 'Failed',
    title: 'Build Failed',
  },
}

const SIZE_LABELS = ['S', 'M', 'L', 'XL']

function ReplacedFonts({ replacedFonts }) {
  const entries = Object.entries(replacedFonts || {})
  if (!entries.length) return null
  return (
    <div>
      <p className="mb-1.5 font-mono text-xs font-medium tracking-wide text-stone-400 uppercase">
        Replaced fonts
      </p>
      <div className="space-y-1">
        {entries.map(([path, name]) => (
          <div key={path} className="flex items-center gap-2 text-xs text-stone-500">
            <span className="font-mono text-stone-400">{path.split('/').pop()}</span>
            <span className="text-stone-300">←</span>
            <span className={name.endsWith('(auto-filled)') ? 'text-amber-600' : undefined}>
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function InsiderPage() {
  const [serialSupported] = useState(
    () => typeof navigator !== 'undefined' && 'serial' in navigator
  )
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [deviceModel, setDeviceModel] = useState(null)

  // --- Build info ---
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(null)
  const [summary, setSummary] = useState(null)

  const loadBuildInfo = useCallback(async () => {
    setLoading(true)
    setMeta(null)
    const data = await fetchBuildMeta()
    setLoading(false)
    setMeta(data || null)
  }, [])

  useEffect(() => {
    loadBuildInfo()
  }, [loadBuildInfo])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/build/summary')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.summary) setSummary(data.summary)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // --- Nightly flash ---
  const flashSteps = getFlashSteps(true)
  const [flashVisible, setFlashVisible] = useState(false)
  const [flashStates, setFlashStates] = useState([])
  const [flashPct, setFlashPct] = useState(0)
  const [flashing, setFlashing] = useState(false)
  const [flashResult, setFlashResult] = useState(null) // { ok, message }
  const progressCardRef = useRef(null)

  async function handleFlashNightly() {
    if (!deviceModel) {
      alert('Please select your device model first.')
      return
    }

    let serialPort
    try {
      serialPort = await CrossPointFlasher.requestPort()
    } catch (err) {
      if (err.name !== 'NotFoundError') alert(err.message)
      return
    }

    setFlashing(true)
    setFlashVisible(true)
    setFlashResult(null)
    setFlashPct(0)
    const states = flashSteps.map(() => 'pending')
    setFlashStates([...states])
    setTimeout(() => {
      progressCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)

    try {
      states[0] = 'running'
      setFlashStates([...states])
      const firmware = await fetchEarlyAccessFirmware()
      states[0] = 'done'
      setFlashStates([...states])

      const flasher = new CrossPointFlasher(serialPort, { expectedChip: 'ESP32-C3', deviceName: 'Xteink' })
      await flasher.flashFirmware(firmware, {
        skipReset: true,
        onStepChange: (idx, name, status) => {
          states[idx + 1] = status
          setFlashStates([...states])
        },
        onProgress: (step, current, total) => {
          if (step === 'Flash firmware') setFlashPct((current / total) * 100)
        },
      })
      setFlashResult({ ok: true })
    } catch (err) {
      const failIdx = states.findIndex((s) => s === 'running')
      if (failIdx >= 0) states[failIdx] = 'error'
      setFlashStates([...states])
      setFlashResult({ ok: false, message: err.message })
    }
    setFlashing(false)
  }

  // --- Custom Font Build (hidden for now, like the original page) ---
  const [cfState, setCfState] = useState('loading') // loading | form | building | ready | failed | unavailable
  const [fontFamilies, setFontFamilies] = useState({})
  const [fontSizeDefaults, setFontSizeDefaults] = useState({})
  const [replacements, setReplacements] = useState({}) // path -> File
  const [cfLabels, setCfLabels] = useState({}) // family -> label
  const [cfSizes, setCfSizes] = useState({}) // family -> [s, m, l, xl]
  const [cfInputKeys, setCfInputKeys] = useState({}) // path -> counter, remounts file inputs on undo
  const [cfUploading, setCfUploading] = useState(false)
  const [cfBuild, setCfBuild] = useState(null)
  const [cfError, setCfError] = useState('')
  const [cfReplacedList, setCfReplacedList] = useState({})
  const cfPollingRef = useRef(false)

  // Custom build flash progress
  const [cfFlashVisible, setCfFlashVisible] = useState(false)
  const [cfFlashStates, setCfFlashStates] = useState([])
  const [cfFlashPct, setCfFlashPct] = useState(0)
  const [cfFlashing, setCfFlashing] = useState(false)
  const [cfFlashResult, setCfFlashResult] = useState(null)
  const cfProgressCardRef = useRef(null)

  const showCustomBuildReady = useCallback((build) => {
    setCfBuild(build)
    setCfState('ready')
  }, [])

  const pollCustomBuild = useCallback(() => {
    if (cfPollingRef.current) return
    cfPollingRef.current = true
    async function poll() {
      if (!cfPollingRef.current) return
      try {
        const build = await fetchCustomBuildStatus()
        if (build) {
          if (build.status === 'success') {
            cfPollingRef.current = false
            showCustomBuildReady(build)
            return
          }
          if (build.status === 'failed') {
            cfPollingRef.current = false
            setCfError(build.error || 'Unknown error')
            setCfState('failed')
            return
          }
        }
      } catch {
        /* keep polling */
      }
      setTimeout(poll, 10000)
    }
    poll()
  }, [showCustomBuildReady])

  const initCustomFontBuild = useCallback(async () => {
    // Check for an existing build first
    const existing = await fetchCustomBuildStatus()
    if (existing) {
      if (existing.status === 'building' || existing.status === 'pending') {
        setCfReplacedList(existing.replacedFonts || {})
        setCfState('building')
        pollCustomBuild()
        return
      }
      if (existing.status === 'success') {
        showCustomBuildReady(existing)
        return
      }
      if (existing.status === 'failed') {
        setCfError(existing.error || 'Unknown error')
        setCfState('failed')
        return
      }
    }

    // Load the font list and show the form
    const tree = await fetchFontList()
    if (!tree || !Object.keys(tree.families).length) {
      setCfState('unavailable')
      return
    }
    setFontFamilies(tree.families)
    setFontSizeDefaults(tree.defaultSizes || {})
    setCfSizes(
      Object.fromEntries(
        Object.keys(tree.families).map((fam) => [
          fam,
          [...((tree.defaultSizes || {})[fam] || [12, 14, 16, 18])],
        ])
      )
    )
    setCfState('form')
  }, [pollCustomBuild, showCustomBuildReady])

  useEffect(() => {
    initCustomFontBuild()
    return () => {
      cfPollingRef.current = false
    }
  }, [initCustomFontBuild])

  // Re-check build status when the tab is refocused
  useEffect(() => {
    function onVisibility() {
      if (document.hidden || !cfPollingRef.current) return
      fetchCustomBuildStatus()
        .then((build) => {
          if (!build) return
          if (build.status === 'success') {
            cfPollingRef.current = false
            showCustomBuildReady(build)
          } else if (build.status === 'failed') {
            cfPollingRef.current = false
            setCfError(build.error || 'Unknown error')
            setCfState('failed')
          }
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [showCustomBuildReady])

  function handleFontFileChange(path, file) {
    if (!file) return
    setReplacements((prev) => ({ ...prev, [path]: file }))
    // Auto-populate the family label from the filename if empty
    const family = path.split('/')[0]
    setCfLabels((prev) => {
      if ((prev[family] || '').trim()) return prev
      const baseName = file.name.replace(/\.(ttf|otf)$/i, '')
      const parts = baseName.split('-')
      if (parts.length > 1) return { ...prev, [family]: parts[0] }
      return prev
    })
  }

  function handleFontUndo(path) {
    setReplacements((prev) => {
      const next = { ...prev }
      delete next[path]
      return next
    })
    setCfInputKeys((prev) => ({ ...prev, [path]: (prev[path] || 0) + 1 }))
  }

  async function handleCfBuild() {
    setCfUploading(true)
    try {
      // Collect custom font labels
      const labels = {}
      for (const [family, val] of Object.entries(cfLabels)) {
        if (val.trim()) labels[family] = val.trim()
      }
      // Collect custom font sizes (only if changed from defaults)
      const sizes = {}
      for (const [fam, vals] of Object.entries(cfSizes)) {
        const defaults = fontSizeDefaults[fam] || []
        if (vals.some((v, i) => v !== defaults[i])) sizes[fam] = vals
      }
      await uploadCustomFonts(replacements, labels, sizes)
      setCfReplacedList(
        Object.fromEntries(Object.entries(replacements).map(([k, f]) => [k, f.name]))
      )
      setCfState('building')
      pollCustomBuild()
    } catch (err) {
      alert(err.message)
    }
    setCfUploading(false)
  }

  async function clearCustomBuild() {
    cfPollingRef.current = false
    setReplacements({})
    setCfLabels({})
    setCfBuild(null)
    setCfError('')
    setCfFlashVisible(false)
    await fetch('/api/custom-build/clear', { method: 'POST' })
    setCfState('loading')
    initCustomFontBuild()
  }

  async function handleCfFlash() {
    if (!deviceModel) {
      alert('Please select your device model first.')
      return
    }

    let serialPort
    try {
      serialPort = await CrossPointFlasher.requestPort()
    } catch (err) {
      if (err.name !== 'NotFoundError') alert(err.message)
      return
    }

    setCfFlashing(true)
    setCfFlashVisible(true)
    setCfFlashResult(null)
    setCfFlashPct(0)
    const states = flashSteps.map(() => 'pending')
    setCfFlashStates([...states])
    setTimeout(() => {
      cfProgressCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)

    try {
      states[0] = 'running'
      setCfFlashStates([...states])
      const firmware = await fetchCustomFirmware()
      states[0] = 'done'
      setCfFlashStates([...states])

      const flasher = new CrossPointFlasher(serialPort, { expectedChip: 'ESP32-C3', deviceName: 'Xteink' })
      await flasher.flashFirmware(firmware, {
        skipReset: true,
        onStepChange: (idx, name, status) => {
          states[idx + 1] = status
          setCfFlashStates([...states])
        },
        onProgress: (step, current, total) => {
          if (step === 'Flash firmware') setCfFlashPct((current / total) * 100)
        },
      })
      setCfFlashResult({ ok: true })
    } catch (err) {
      const failIdx = states.findIndex((s) => s === 'running')
      if (failIdx >= 0) states[failIdx] = 'error'
      setCfFlashStates([...states])
      setCfFlashResult({ ok: false, message: err.message })
    }
    setCfFlashing(false)
  }

  async function handleCfDownload() {
    try {
      const firmware = await fetchCustomFirmware()
      downloadBlob(firmware, 'crosspoint-custom.bin')
    } catch (err) {
      alert(err.message)
    }
  }

  const replaceCount = Object.keys(replacements).length
  const status = meta ? STATUS_META[meta.status] || STATUS_META.failed : null

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-6">
        <div className="pt-12 pb-2 sm:pt-16">
          <Eyebrow>Insider Builds</Eyebrow>
          <h1 className="mt-3 max-w-[24ch] font-display text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-3xl">
            Nightly Builds
          </h1>
          <p className="mt-3 max-w-[48ch] text-lg text-pretty text-stone-600 sm:text-base/7">
            Latest nightly firmware compiled from master
          </p>
        </div>

        <div className="my-6 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
          <span className="font-semibold">Heads up:</span> Nightly builds are tested internally but
          may introduce regressions. Stock X3 owners should{' '}
          <Link
            to="/#flash-tools"
            className="font-medium text-brand-600 underline underline-offset-2"
          >
            flash a release build
          </Link>{' '}
          first before using a nightly.
        </div>

        {!serialSupported && (
          <div className="my-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
            <span className="font-semibold">Flashing unavailable.</span> The web flasher uses
            WebSerial, which requires Chrome or Edge on desktop. You can still browse build info
            below.
          </div>
        )}

        {/* Device Selector */}
        <div className="mb-4 rounded-2xl bg-white p-5 ring-1 ring-stone-950/5">
          <h3 className="text-sm font-semibold text-stone-900">Select your device</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setDeviceModel(m.id)}
                className={
                  deviceModel === m.id
                    ? 'rounded-xl border-2 border-brand-500 bg-brand-50/40 p-4 text-left'
                    : 'rounded-xl border border-stone-200 p-4 text-left hover:border-stone-300'
                }
              >
                <div className="text-sm font-semibold text-stone-900">{m.name}</div>
                <div className="mt-0.5 text-xs text-stone-400">{m.res}</div>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <Spinner className="mx-auto size-5 text-stone-400" />
            <p className="mt-3 text-base/7 text-stone-400 sm:text-sm/6">Loading build info...</p>
          </div>
        ) : !meta ? (
          <div className="py-16 text-center">
            <h2 className="font-display text-lg font-semibold tracking-tight text-stone-700">
              No Builds Yet
            </h2>
            <p className="mt-2 text-base/7 text-stone-400 sm:text-sm/6">
              Builds run automatically when new commits are pushed to master.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pb-16">
            {/* Build Status Card */}
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
                  <span className={`size-2 shrink-0 rounded-full ${status.dot}`} />
                  {status.title}
                </h2>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.badge}`}
                  >
                    {status.badgeText}
                  </span>
                  <button
                    type="button"
                    onClick={loadBuildInfo}
                    className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                    title="Refresh"
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
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Version', value: meta.version || '—', mono: true },
                  { label: 'Built', value: meta.buildDate ? formatDate(meta.buildDate) : '—' },
                  { label: 'Commit', value: meta.commitShort || '—', mono: true },
                  { label: 'Size', value: formatSize(meta.firmwareSize) },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-stone-50 px-4 py-3">
                    <div className="font-mono text-xs font-medium tracking-wide text-stone-400 uppercase">
                      {item.label}
                    </div>
                    <div
                      className={`mt-1 text-sm font-semibold text-stone-900 tabular-nums ${item.mono ? 'font-mono' : ''}`}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {meta.status === 'success' && (
                <div className="mt-5">
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
                    Make sure your device is not asleep and is sitting at the home screen before
                    flashing. If the flasher fails to detect your device remove your sd card and
                    try again.
                  </div>
                  <button
                    type="button"
                    onClick={handleFlashNightly}
                    disabled={flashing}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Flash Nightly Build
                  </button>
                  <button
                    type="button"
                    onClick={() => setDownloadOpen(true)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
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
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5m0 0l4.5-4.5M12 16.5V3"
                      />
                    </svg>
                    Download Firmware
                  </button>
                  <p className="mt-2 text-xs text-stone-400">
                    Make sure you've selected the correct device model above before flashing.
                  </p>
                  <a
                    href="#changelog"
                    className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    View Changelog
                  </a>
                </div>
              )}
              {meta.status === 'building' && (
                <div className="mt-5">
                  <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm/6 text-amber-800">
                    A build is currently in progress. Check back in a few minutes.
                  </div>
                </div>
              )}
              {meta.status === 'failed' && (
                <div className="mt-5">
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm/6 text-red-800">
                    {meta.error ? `Build failed: ${meta.error}` : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Progress Card */}
            {flashVisible && (
              <div ref={progressCardRef} className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
                <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
                  Flashing Nightly Build...
                </h2>
                <FlashSteps steps={flashSteps} states={flashStates} progress={flashPct} />
                <div className="mt-4">
                  {flashResult &&
                    (flashResult.ok ? (
                      <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm/6 text-brand-600">
                        <p className="font-medium">Flash complete!</p>
                        <p className="mt-1 text-brand-500">
                          Unplug and reconnect the USB cable. Don't press the Reset button.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm/6 text-red-800">
                        {flashResult.message}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Restart Instructions */}
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
              <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
                Device Restart Instructions
              </h2>
              <p className="mt-2 text-sm/6 text-pretty text-stone-600">
                <strong className="text-stone-700">X4:</strong> Press the small Reset button near
                the bottom right, then hold the power button for 3 seconds.
              </p>
              <p className="mt-1 text-sm/6 text-pretty text-stone-600">
                <strong className="text-stone-700">X3:</strong> Unplug and reconnect the USB cable.
                Don't press the Reset button.
              </p>
            </div>

            {/* Custom Font Build (hidden for now, matching the original page) */}
            <div className="hidden rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
                  Custom Font Build
                </h2>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
                  Beta
                </span>
              </div>
              <p className="mt-2 text-sm/6 text-pretty text-stone-600">
                Replace any built-in font with your own. Select the fonts you want to swap, upload
                replacements, and we'll build custom firmware for you.
              </p>

              {cfState === 'loading' && (
                <div className="py-8 text-center">
                  <Spinner className="mx-auto size-5 text-stone-400" />
                  <p className="mt-3 text-sm text-stone-400">Loading font list...</p>
                </div>
              )}

              {cfState === 'unavailable' && (
                <div className="py-8 text-center">
                  <p className="text-sm text-stone-400">Could not load font list.</p>
                </div>
              )}

              {cfState === 'form' && (
                <div className="mt-4">
                  <div className="space-y-3">
                    {Object.entries(fontFamilies).map(([family, files]) => {
                      const replaced = files.filter((f) => replacements[f.path])
                      const hasReplacements = replaced.length > 0
                      const missing = files.filter((f) => !replacements[f.path])
                      const showNotice = replaced.length > 0 && replaced.length < files.length
                      const missingNames = missing
                        .map((f) => f.name.replace(/\.(ttf|otf)$/i, '').split('-').pop())
                        .join(', ')
                      const sizes = cfSizes[family] || fontSizeDefaults[family] || [12, 14, 16, 18]
                      return (
                        <details key={family} className="group rounded-lg border border-stone-200">
                          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-stone-700 select-none hover:bg-stone-50">
                            <span>{family}</span>
                            <span className="text-xs text-stone-400 group-open:hidden">
                              {files.length} file{files.length !== 1 ? 's' : ''}
                            </span>
                          </summary>
                          {family === 'NotoSans' && (
                            <div className="border-t border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-400">
                              Changing this will change your system UI font too
                            </div>
                          )}
                          <div className="divide-y divide-stone-100 border-t border-stone-200">
                            {hasReplacements && (
                              <div className="flex items-center gap-2 bg-stone-50 px-4 py-2.5">
                                <label className="shrink-0 text-xs font-medium text-stone-500">
                                  Display as
                                </label>
                                <input
                                  type="text"
                                  value={cfLabels[family] || ''}
                                  onChange={(e) =>
                                    setCfLabels((prev) => ({ ...prev, [family]: e.target.value }))
                                  }
                                  placeholder={family}
                                  className="flex-1 rounded border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700 placeholder:text-stone-400 focus:border-brand-300 focus:ring-1 focus:ring-brand-500/20 focus:outline-none"
                                />
                              </div>
                            )}
                            {hasReplacements && (
                              <div className="border-t border-stone-100 bg-stone-50 px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <label className="shrink-0 text-xs font-medium text-stone-500">
                                    Sizes (pt)
                                  </label>
                                  <div className="flex flex-1 gap-1.5">
                                    {sizes.map((sz, i) => (
                                      <div key={i} className="flex-1">
                                        <label className="text-[10px] text-stone-400">
                                          {SIZE_LABELS[i]}
                                        </label>
                                        <input
                                          type="number"
                                          min="6"
                                          max="30"
                                          value={sz}
                                          onChange={(e) =>
                                            setCfSizes((prev) => {
                                              const next = [...(prev[family] || sizes)]
                                              next[i] = parseInt(e.target.value)
                                              return { ...prev, [family]: next }
                                            })
                                          }
                                          className="w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-center text-xs text-stone-700 tabular-nums focus:border-brand-300 focus:ring-1 focus:ring-brand-500/20 focus:outline-none"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                            {showNotice && (
                              <div className="bg-amber-50/60 px-4 py-2 text-xs text-amber-700">
                                Missing variants ({missingNames}) will use your uploaded file
                              </div>
                            )}
                            {files.map((f) => {
                              const file = replacements[f.path]
                              return (
                                <div key={f.path} className="flex items-center gap-3 px-4 py-2.5">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-mono text-xs text-stone-600">
                                      {f.name}
                                    </p>
                                    {file && (
                                      <p className="mt-0.5 text-xs text-brand-600">{file.name}</p>
                                    )}
                                  </div>
                                  <label className="relative shrink-0">
                                    <input
                                      key={cfInputKeys[f.path] || 0}
                                      type="file"
                                      accept=".ttf,.otf"
                                      onChange={(e) =>
                                        handleFontFileChange(f.path, e.target.files[0])
                                      }
                                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                                    />
                                    <span
                                      className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium ${
                                        file
                                          ? 'bg-brand-100 text-brand-700'
                                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                                      }`}
                                    >
                                      {file ? 'Change' : 'Replace'}
                                    </span>
                                  </label>
                                  {file && (
                                    <button
                                      type="button"
                                      onClick={() => handleFontUndo(f.path)}
                                      className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                                      title="Undo"
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
                                          d="M6 18 18 6M6 6l12 12"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </details>
                      )
                    })}
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleCfBuild}
                      disabled={replaceCount === 0 || cfUploading}
                      className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {cfUploading ? (
                        <>
                          <Spinner className="inline-block size-4 text-white" /> Uploading...
                        </>
                      ) : (
                        'Build Custom Firmware'
                      )}
                    </button>
                    <span className="text-sm text-stone-400">
                      {replaceCount
                        ? `${replaceCount} font${replaceCount !== 1 ? 's' : ''} selected`
                        : ''}
                    </span>
                  </div>
                </div>
              )}

              {cfState === 'building' && (
                <div className="mt-4">
                  <div className="flex items-center gap-3 rounded-lg bg-amber-50 px-4 py-3">
                    <Spinner className="size-4 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Building your custom firmware...
                      </p>
                      <p className="mt-0.5 text-xs text-amber-600">
                        This usually takes 3-5 minutes.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ReplacedFonts replacedFonts={cfReplacedList} />
                  </div>
                  <button
                    type="button"
                    onClick={clearCustomBuild}
                    className="mt-3 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50 hover:text-stone-700"
                  >
                    Cancel Build
                  </button>
                </div>
              )}

              {cfState === 'ready' && cfBuild && (
                <div className="mt-4">
                  <div className="rounded-lg bg-brand-50 px-4 py-3">
                    <p className="text-sm font-medium text-brand-800">
                      Your custom firmware is ready!
                    </p>
                    <div className="mt-1 flex items-center gap-4 text-xs text-brand-600">
                      <span>{cfBuild.version || ''}</span>
                      <span>{cfBuild.firmwareSize ? formatSize(cfBuild.firmwareSize) : ''}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ReplacedFonts replacedFonts={cfBuild.replacedFonts} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleCfFlash}
                      disabled={cfFlashing}
                      className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Flash Custom Build
                    </button>
                    <button
                      type="button"
                      onClick={handleCfDownload}
                      className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                    >
                      Download .bin
                    </button>
                    <button
                      type="button"
                      onClick={clearCustomBuild}
                      className="rounded-lg px-4 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-700"
                    >
                      New Build
                    </button>
                  </div>
                </div>
              )}

              {cfState === 'failed' && (
                <div className="mt-4">
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
                    <p className="font-medium">Build failed</p>
                    <p className="mt-1">{cfError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={clearCustomBuild}
                    className="mt-3 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Custom build flash progress */}
              {cfFlashVisible && (
                <div
                  ref={cfProgressCardRef}
                  className="mt-4 rounded-2xl bg-white p-6 ring-1 ring-stone-950/5"
                >
                  <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
                    Flashing Custom Build...
                  </h2>
                  <FlashSteps steps={flashSteps} states={cfFlashStates} progress={cfFlashPct} />
                  <div className="mt-4">
                    {cfFlashResult &&
                      (cfFlashResult.ok ? (
                        <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm/6 text-brand-600">
                          <p className="font-medium">Flash complete!</p>
                          <p className="mt-1 text-brand-500">
                            Unplug and reconnect the USB cable. Don't press the Reset button.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm/6 text-red-800">
                          {cfFlashResult.message}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Changelog Card */}
            <div id="changelog" className="scroll-mt-20 rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
                  Changelog
                </h2>
                <span className="font-mono text-xs text-stone-400 tabular-nums">
                  {meta.changelog?.length
                    ? `${meta.changelog.length} commit${meta.changelog.length !== 1 ? 's' : ''}`
                    : ''}
                </span>
              </div>
              {summary && (
                <div className="mt-3 rounded-lg bg-brand-50/60 px-4 py-3 text-sm/6 text-stone-700">
                  {summary}
                </div>
              )}
              <p className="mt-3 text-xs text-stone-400">Commits since the last tagged release</p>
              <ChangelogList changelog={meta.changelog} className="max-h-96" />
            </div>

            <p className="pt-4 text-center font-mono text-xs text-stone-400 tabular-nums">
              {meta.buildDate ? `Last build: ${formatDate(meta.buildDate)}` : ''}
            </p>
          </div>
        )}
      </div>

      <DownloadModal open={downloadOpen} onClose={() => setDownloadOpen(false)} />
    </Layout>
  )
}
