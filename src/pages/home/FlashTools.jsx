import { useEffect, useMemo, useRef, useState } from 'react'
import { Eyebrow } from '../../components/ui.jsx'
import {
  CrossPointFlasher,
  CROSSPOINT_PARTITION_TABLE,
  fetchReleaseFirmware,
  fetchReleaseMeta,
  fetchEarlyAccessFirmware,
  fetchStockFirmware,
  fetchStockFirmwareInfo,
  fetchBuildMeta,
  fetchBetaBuilds,
  fetchBetaFirmware,
  fetchDeviceBuildInfo,
  fetchDeviceBuildFirmware,
  fetchFlashAsset,
} from '../../lib/flasher.js'
import { renderMarkdown } from './markdown.js'

// ---------- small presentational bits ----------

function BoltIcon({ className = 'mr-1.5 size-4 shrink-0' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  )
}

function StepBadge({ n, active }) {
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold ${
        active ? 'bg-brand-500 text-white' : 'bg-stone-200 text-stone-500'
      }`}
    >
      {n}
    </span>
  )
}

function cardClass(active) {
  return active
    ? 'group relative rounded-xl border-2 border-brand-500 bg-brand-50/40 p-4 text-left'
    : 'group relative rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-stone-300'
}

function relativeTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const FLASH_STEP_ICONS = { pending: '○', running: '◠', done: '✓', error: '✗' }
const FLASH_STEP_COLORS = {
  pending: 'text-stone-400',
  running: 'text-stone-900',
  done: 'text-brand-500',
  error: 'text-red-600',
}

function StepsList({ steps, states, percent }) {
  return (
    <ul role="list" className="mt-4 divide-y divide-stone-100">
      {steps.map((name, i) => {
        const st = states[i] || 'pending'
        const spin = st === 'running' ? 'animate-spin' : ''
        const showBar =
          st === 'running' &&
          (name.includes('Flash') || name.includes('Read flash') || name.includes('Write'))
        return (
          <li key={name} className={`flex items-center gap-3 py-3 text-sm/5 ${FLASH_STEP_COLORS[st]}`}>
            <span className={`flex size-5 shrink-0 items-center justify-center ${spin}`} aria-hidden="true">
              {FLASH_STEP_ICONS[st]}
            </span>
            <span className={showBar ? '' : 'flex-1'}>{name}</span>
            {showBar && (
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-200"
                  style={{ width: `${percent.toFixed(1)}%` }}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---------- main component ----------

const MODELS = [
  { id: 'x4', name: 'Xteink X4', res: '480 × 800' },
  { id: 'x3', name: 'Xteink X3', res: '528 × 792' },
  { id: 'sticky', name: 'Seeed Sticky', res: '480 × 800' },
  { id: 'm5paper', name: 'M5Paper', res: '540 × 960' },
  { id: 'lilygo', name: 'LilyGo T5', res: '540 × 960' },
]

// esptool chip identity each device must report before we write anything.
// Stops firmware for one board from landing on another (e.g. the Sticky's
// ESP32-S3 build onto an ESP32-C3 Xteink). Sticky and LilyGo share a chip,
// so this can't tell those two apart — but it fences off the Xteinks and
// the M5Paper.
const MODEL_CHIPS = {
  x4: 'ESP32-C3',
  x3: 'ESP32-C3',
  sticky: 'ESP32-S3',
  m5paper: 'ESP32',
  lilygo: 'ESP32-S3',
}

// Non-Xteink devices flash a single admin-uploaded build instead of the
// release/nightly/stock catalog, and always through the full boot-region
// install (bootloader + partition table + otadata + firmware): their stock
// bootloader/partition table can't boot a CrossPoint app from an OTA slot,
// so the OTA-slot flow the Xteink devices use would brick-loop them.
//
// bootloaderOffset: where the chip's ROM loads the 2nd-stage bootloader —
// 0x0 on the S3 devices, 0x1000 on the M5Paper's classic ESP32.
// baudrate: real wire speed through a USB-UART bridge; native USB (S3)
// ignores it. The M5Paper's CP2104 bridge drops out at 921600 on macOS, so
// it stays a tier lower.
const DEVICE_INSTALLS = {
  sticky: {
    name: 'Seeed Sticky',
    // These are the exact four-part package settings used by Seeed's
    // CrossPoint Playground. Keeping the packaged PT (instead of generating
    // it client-side) makes both flashers perform the same non-destructive
    // sector writes.
    bootloader: '/firmware/sticky-bootloader.bin',
    partitions: '/firmware/sticky-partitions.bin',
    bootloaderOffset: 0x0,
    baudrate: 921600,
    flashSize: '16MB',
    flashMode: 'dio',
    flashFreq: '80m',
    preserveNvs: true,
    resetAfterReconnect: true,
    after: 'The device restarts automatically. If the screen stays blank, unplug and reconnect USB.',
  },
  m5paper: {
    name: 'M5Paper',
    bootloader: '/firmware/m5paper-bootloader.bin',
    bootloaderOffset: 0x1000,
    baudrate: 460800,
    after: 'Press and hold the rotary dial to boot.',
  },
  lilygo: {
    name: 'LilyGo T5',
    bootloader: '/firmware/lilygo-bootloader.bin',
    bootloaderOffset: 0x0,
    baudrate: 921600,
    after: 'The device restarts on its own. If the screen stays blank, unplug and replug the USB cable.',
  },
}

// Vendor-level port filters for the non-Xteink devices: Espressif (0x303A,
// any PID — USB-Serial-JTAG, ROM download mode, TinyUSB CDC), Seeed (0x2886)
// for stock Sticky firmware, and the Silicon Labs / WCH USB-UART bridges
// (CP2104 on the M5Paper, CH34x on some LilyGo revisions). The default
// Xteink filter also pins the product ID, which would hide all of these; no
// filter at all shows Bluetooth serial ports.
const DEVICE_PORT_FILTERS = [
  { usbVendorId: 0x303a },
  { usbVendorId: 0x2886 },
  { usbVendorId: 0x10c4 },
  { usbVendorId: 0x1a86 },
]

export default function FlashTools() {
  const serialSupported = useMemo(() => typeof navigator !== 'undefined' && 'serial' in navigator, [])

  const [model, setModel] = useState(null)
  const [fw, setFw] = useState(null)
  const [running, setRunning] = useState(false)
  const [customFile, setCustomFile] = useState(null)

  // Firmware version info (per selected device model)
  const [crosspoint, setCrosspoint] = useState({ text: 'Loading...', enabled: false, tag: null, notesUrl: null })
  const [nightly, setNightly] = useState({ text: 'Loading...', enabled: false })
  const [stock, setStock] = useState({
    en: { text: 'Loading...', enabled: false },
    ch: { text: 'Loading...', enabled: false },
  })

  // Beta builds from /api (buttons inserted before "Custom .bin")
  const [betaBuilds, setBetaBuilds] = useState([])

  // Admin-uploaded build for non-Xteink devices (m5paper, lilygo)
  const [deviceBuild, setDeviceBuild] = useState(null)

  // Stable release publish date, shown on the Xteink cards (both flash the
  // same release build).
  const [releaseDate, setReleaseDate] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchReleaseMeta()
      .then((meta) => {
        if (!cancelled && meta?.publishedAt) setReleaseDate(meta.publishedAt)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Uploaded build per non-Xteink device; their cards stay hidden from the
  // device grid until one exists, and show the build's upload date.
  const [deviceAvailability, setDeviceAvailability] = useState({})

  useEffect(() => {
    let cancelled = false
    Object.keys(DEVICE_INSTALLS).forEach((id) => {
      fetchDeviceBuildInfo(id)
        .then((b) => {
          if (!cancelled && b) setDeviceAvailability((a) => ({ ...a, [id]: b }))
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Nightly changelog + AI summary
  const [changelog, setChangelog] = useState({ status: 'idle', commits: [] })
  const [summary, setSummary] = useState(null)

  // Flash progress card state
  const [progress, setProgress] = useState(null) // { title, steps, states, status }
  const [percent, setPercent] = useState(0)
  const [restart, setRestart] = useState(null) // { unplug: bool }
  const progressRef = useRef(null)

  // --- Load beta builds once ---
  useEffect(() => {
    let cancelled = false
    fetchBetaBuilds()
      .then((builds) => {
        if (!cancelled && Array.isArray(builds)) setBetaBuilds(builds)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // --- Load firmware version info whenever the device model changes ---
  useEffect(() => {
    if (!model) return
    let cancelled = false
    if (DEVICE_INSTALLS[model]) {
      setDeviceBuild(null)
      fetchDeviceBuildInfo(model)
        .then((b) => {
          if (!cancelled) setDeviceBuild(b)
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }
    setCrosspoint({ text: 'Loading...', enabled: false, tag: null, notesUrl: null })
    setNightly({ text: 'Loading...', enabled: false })
    setStock({ en: { text: 'Loading...', enabled: false }, ch: { text: 'Loading...', enabled: false } })
    ;(async () => {
      const [meta, buildMeta] = await Promise.all([fetchReleaseMeta(), fetchBuildMeta()])
      if (cancelled) return
      if (meta) {
        setCrosspoint({
          text: `${meta.tag} - ${fmtDate(meta.publishedAt)}`,
          enabled: true,
          tag: meta.tag,
          notesUrl: meta.htmlUrl || null,
        })
      } else {
        setCrosspoint({ text: 'Failed to load', enabled: false, tag: null, notesUrl: null })
      }

      if (buildMeta && buildMeta.status === 'success') {
        setNightly({ text: `${buildMeta.version} - ${fmtDate(buildMeta.buildDate)}`, enabled: true })
      } else {
        setNightly({ text: 'No build available', enabled: false })
      }

      for (const lang of ['en', 'ch']) {
        const info = await fetchStockFirmwareInfo(model, lang)
        if (cancelled) return
        setStock((s) => ({
          ...s,
          [lang]: info ? { text: info.version, enabled: true } : { text: 'Unavailable', enabled: false },
        }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [model])

  // --- Nightly changelog + summary, loaded when Nightly is selected ---
  useEffect(() => {
    if (fw !== 'nightly') return
    let cancelled = false
    if (changelog.status === 'idle' || changelog.status === 'empty') {
      setChangelog({ status: 'loading', commits: [] })
      fetchBuildMeta().then((meta) => {
        if (cancelled) return
        if (!meta?.changelog?.length) setChangelog({ status: 'empty', commits: [] })
        else setChangelog({ status: 'loaded', commits: meta.changelog })
      })
    }
    ;(async () => {
      const tryFetch = async (url) => {
        const res = await fetch(url)
        if (!res.ok) return null
        const data = await res.json()
        return data.summary || null
      }
      try {
        let s = await tryFetch('/api/build/summary')
        if (!s) s = await tryFetch('/api/build/summary?regenerate=1')
        if (s && !cancelled) setSummary(s)
      } catch {
        // summary is optional
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fw])

  // Scroll the progress card into view when a flash starts.
  useEffect(() => {
    if (progress && running) {
      progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.title, running])

  function selectModel(id) {
    if (running) return
    setModel(id)
    setFw(null) // reset firmware selection when device changes
  }

  function selectFw(id) {
    if (running) return
    setFw(id)
  }

  // --- Flash actions ---
  async function runFlash(action) {
    if (running) return

    const install = DEVICE_INSTALLS[model]

    // Request the serial port FIRST, while we still have the user gesture.
    // Any await before this (file reads, fetches) consumes the gesture and
    // requestPort() will throw "Must be handling a user gesture".
    let serialPort
    try {
      serialPort = await CrossPointFlasher.requestPort(install ? DEVICE_PORT_FILTERS : undefined)
    } catch (err) {
      if (err.name !== 'NotFoundError') alert(err.message)
      return
    }

    if (install) {
      await runDeviceInstall(install, action, serialPort)
      return
    }

    // CrossPoint-style OTA updates validate the new app on first boot before committing the OTA
    // pointer. Avoid serial hard reset here; a clean unplug/replug matches the known-good flasher
    // behavior.
    const skipReset =
      action === 'crosspoint' || action === 'nightly' || action === 'custom' ||
      action === 'device' || action.startsWith('beta-')

    const titles = {
      crosspoint: 'Flashing CrossPoint Firmware...',
      nightly: 'Flashing CrossPoint Nightly...',
      'stock-en': 'Flashing English Firmware...',
      'stock-ch': 'Flashing Chinese Firmware...',
      custom: 'Flashing Custom Firmware...',
      device: `Flashing ${DEVICE_INSTALLS[model]?.name || 'Device'} Beta...`,
    }
    const title = action.startsWith('beta-') ? 'Flashing Beta Firmware...' : titles[action]

    const downloadMsgs = {
      crosspoint: 'Downloading firmware...',
      nightly: 'Downloading nightly build...',
      'stock-en': 'Downloading firmware...',
      'stock-ch': 'Downloading firmware...',
      device: 'Downloading beta firmware...',
    }
    const downloadMsg = action.startsWith('beta-') ? 'Downloading beta firmware...' : downloadMsgs[action]

    const steps = [
      'Connect to device',
      'Validate partition table',
      'Read OTA data',
      'Flash firmware',
      'Update boot partition',
      skipReset ? 'Disconnect' : 'Reset device',
    ]
    const states = steps.map(() => 'pending')

    setRunning(true)
    setRestart({ unplug: skipReset && model !== 'x4' })
    setPercent(0)
    setProgress({ title, steps, states: [...states], status: downloadMsg ? { kind: 'info', text: downloadMsg } : null })

    try {
      let firmware
      if (action === 'crosspoint') {
        firmware = await fetchReleaseFirmware(model)
      } else if (action === 'nightly') {
        firmware = await fetchEarlyAccessFirmware()
      } else if (action === 'stock-en') {
        firmware = (await fetchStockFirmware(model, 'en')).data
      } else if (action === 'stock-ch') {
        firmware = (await fetchStockFirmware(model, 'ch')).data
      } else if (action === 'custom') {
        if (!customFile) throw new Error('No file selected')
        firmware = new Uint8Array(await customFile.arrayBuffer())
      } else if (action === 'device') {
        firmware = await fetchDeviceBuildFirmware(model)
      } else if (action.startsWith('beta-')) {
        firmware = await fetchBetaFirmware(action.replace('beta-', ''))
      }

      setProgress((p) => ({ ...p, status: null }))

      const flasher = new CrossPointFlasher(serialPort, {
        expectedChip: MODEL_CHIPS[model],
        deviceName: MODELS.find((m) => m.id === model)?.name,
      })
      await flasher.flashFirmware(firmware, {
        skipReset,
        onStepChange: (idx, name, status) => {
          states[idx] = status
          setProgress((p) => (p ? { ...p, states: [...states] } : p))
        },
        onProgress: (step, current, total) => {
          setPercent((current / total) * 100)
        },
      })

      setProgress((p) => ({
        ...p,
        status: {
          kind: 'ok',
          text: skipReset
            ? 'Flash complete! Unplug and replug the USB cable to restart your device.'
            : 'Flash complete! Your device will restart with the new firmware.',
        },
      }))
    } catch (err) {
      setProgress((p) => ({ ...p, status: { kind: 'err', text: err.message } }))
    }

    setRunning(false)
  }

  // Full boot-region install for the non-Xteink devices (see DEVICE_INSTALLS).
  // Same flow the standalone Sticky page used: bootloader + partition table +
  // boot_app0 otadata + firmware in one write, then a serial hard reset.
  async function runDeviceInstall(install, action, serialPort) {
    const buildName = action === 'custom' ? 'Custom Firmware' : deviceBuild?.name || `${install.name} Beta`
    const steps = [
      'Connect to device',
      'Write bootloader + partition table + firmware',
      'Verify partition table',
      'Reset device',
    ]
    const states = steps.map(() => 'pending')

    setRunning(true)
    setRestart({ text: install.after })
    setPercent(0)
    setProgress({
      title: `Installing ${buildName}...`,
      steps,
      states: [...states],
      status: { kind: 'info', text: 'Downloading firmware...' },
    })

    try {
      let firmware
      if (action === 'custom') {
        if (!customFile) throw new Error('No file selected')
        firmware = new Uint8Array(await customFile.arrayBuffer())
      } else {
        firmware = await fetchDeviceBuildFirmware(model)
      }
      const bootloaderData = await fetchFlashAsset(install.bootloader, `${install.name} bootloader`)
      const partitionTableData = install.partitions
        ? await fetchFlashAsset(install.partitions, `${install.name} partition table`)
        : null
      const otadataData = await fetchFlashAsset('/firmware/sticky-boot-app0.bin', 'boot_app0')

      setProgress((p) => ({ ...p, status: null }))

      const flasher = new CrossPointFlasher(serialPort, {
        baudrate: install.baudrate,
        expectedChip: MODEL_CHIPS[model],
        deviceName: install.name,
        resetAfterReconnect: install.resetAfterReconnect,
      })
      await flasher.repairBootRegion(CROSSPOINT_PARTITION_TABLE, {
        bootloaderData,
        bootloaderOffset: install.bootloaderOffset,
        partitionTableData,
        firmwareData: firmware,
        otadataData,
        preserveNvs: install.preserveNvs,
        flashSize: install.flashSize,
        flashMode: install.flashMode,
        flashFreq: install.flashFreq,
        onStepChange: (idx, name, status) => {
          states[idx] = status
          setProgress((p) => (p ? { ...p, states: [...states] } : p))
        },
        onProgress: (step, current, total) => {
          setPercent((current / total) * 100)
        },
      })

      setProgress((p) => ({ ...p, status: { kind: 'ok', text: `Installed! ${install.after}` } }))
    } catch (err) {
      setProgress((p) => ({ ...p, status: { kind: 'err', text: err.message } }))
    }

    setRunning(false)
  }

  const selectedBeta = fw?.startsWith('beta-') ? betaBuilds.find((b) => `beta-${b.id}` === fw) : null

  return (
    <section id="flash-tools" className="relative scroll-mt-20 border-t border-stone-200 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-6">
        <Eyebrow>get CrossPoint</Eyebrow>
        <h2 className="mt-2 max-w-[30ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          Flash from your browser.
        </h2>
        <p className="mt-6 max-w-[58ch] font-serif text-xl/9 text-pretty text-stone-600">
          Flash <strong className="font-medium text-stone-900">right from your browser</strong>,
          over USB. Works in Chrome, Edge and Firefox on desktop. Originally built by{' '}
          <a
            href="https://github.com/daveallie"
            target="_blank"
            rel="noopener"
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            daveallie
          </a>
          . CrossPoint is also a foundation to build on: the project has been{' '}
          <strong className="font-medium text-stone-900">forked over 1,000 times</strong>, with
          community alternatives worth exploring.
        </p>

        {/* Browser check */}
        {!serialSupported && (
          <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
            <span className="font-semibold">Flashing unavailable.</span> The web flasher uses
            WebSerial, which requires Chrome or Edge on desktop. You can still browse firmware
            info and changelogs below.
          </div>
        )}

        <div className="mt-10 space-y-6">
          {/* Step 1: Device */}
          <div>
            <div className="flex items-center gap-2.5">
              <StepBadge n={1} active={!!model} />
              <h3 className="font-display text-sm font-semibold text-stone-900">Select your device</h3>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MODELS.filter((m) => !DEVICE_INSTALLS[m.id] || deviceAvailability[m.id]).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectModel(m.id)}
                  className={cardClass(model === m.id)}
                  style={running ? { pointerEvents: 'none' } : undefined}
                >
                  <div className="text-sm font-semibold text-stone-900">{m.name}</div>
                  <div className="mt-0.5 font-mono text-xs text-stone-400">
                    {(() => {
                      // Device builds show their upload date; Xteink cards show
                      // the stable release date; resolution is the fallback
                      // while either is still loading.
                      const date = DEVICE_INSTALLS[m.id]
                        ? deviceAvailability[m.id]?.uploadedAt
                        : releaseDate
                      return date ? `Updated ${fmtDate(date)}` : m.res
                    })()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Firmware */}
          {model && (
            <div>
              <div className="flex items-center gap-2.5">
                <StepBadge n={2} active={!!fw} />
                <h3 className="font-display text-sm font-semibold text-stone-900">Choose firmware</h3>
              </div>
              {DEVICE_INSTALLS[model] ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => selectFw('device')}
                    disabled={!deviceBuild}
                    className={`${cardClass(fw === 'device')} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="text-sm font-semibold text-stone-900">
                      {deviceBuild ? deviceBuild.name : 'No build available'}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-amber-600">Beta</div>
                  </button>
                  {model === 'sticky' && (
                    <button type="button" onClick={() => selectFw('custom')} className={cardClass(fw === 'custom')}>
                      <div className="text-sm font-semibold text-stone-900">Custom .bin</div>
                      <div className="mt-0.5 font-mono text-xs text-stone-400">Upload file</div>
                    </button>
                  )}
                </div>
              ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => selectFw('crosspoint')} className={cardClass(fw === 'crosspoint')}>
                  <div className="text-sm font-semibold text-stone-900">
                    {crosspoint.tag ? `CrossPoint ${crosspoint.tag}` : 'CrossPoint'}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-brand-600">Community</div>
                </button>
                <button type="button" onClick={() => selectFw('nightly')} className={cardClass(fw === 'nightly')}>
                  <div className="text-sm font-semibold text-stone-900">CrossPoint Nightly</div>
                  <div className="mt-0.5 font-mono text-xs text-brand-600">Insider</div>
                </button>
                <button type="button" onClick={() => selectFw('stock-en')} className={cardClass(fw === 'stock-en')}>
                  <div className="text-sm font-semibold text-stone-900">Stock English</div>
                  <div className="mt-0.5 font-mono text-xs text-stone-400">Official</div>
                </button>
                <button type="button" onClick={() => selectFw('stock-ch')} className={cardClass(fw === 'stock-ch')}>
                  <div className="text-sm font-semibold text-stone-900">Stock Chinese</div>
                  <div className="mt-0.5 font-mono text-xs text-stone-400">Official</div>
                </button>
                {betaBuilds.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => selectFw(`beta-${b.id}`)}
                    className={cardClass(fw === `beta-${b.id}`)}
                  >
                    <div className="font-mono text-xs text-amber-600">CrossPoint Beta</div>
                    <div className="mt-0.5 text-sm font-semibold text-stone-900">{b.name}</div>
                  </button>
                ))}
                <button type="button" onClick={() => selectFw('custom')} className={cardClass(fw === 'custom')}>
                  <div className="text-sm font-semibold text-stone-900">Custom .bin</div>
                  <div className="mt-0.5 font-mono text-xs text-stone-400">Upload file</div>
                </button>
              </div>
              )}
            </div>
          )}

          {/* Step 3: Flash */}
          {model && fw && (
            <div>
              <div className="flex items-center gap-2.5">
                <StepBadge n={3} active />
                <h3 className="font-display text-sm font-semibold text-stone-900">Flash</h3>
              </div>
              {!DEVICE_INSTALLS[model] && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
                  Make sure your device is not asleep and is sitting at the home screen before
                  flashing. If the flasher fails to detect your device remove your sd card and try
                  again.
                </div>
              )}
              <div className="mt-4">
                <div className="rounded-xl bg-white p-5 ring-1 ring-stone-950/5">
                  {/* CrossPoint panel */}
                  {fw === 'crosspoint' && (
                    <div>
                      <div className="text-sm font-semibold text-stone-900">CrossPoint Firmware</div>
                      <div className="mt-1 font-mono text-xs text-stone-400 tabular-nums">{crosspoint.text}</div>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => runFlash('crosspoint')}
                          disabled={running || !crosspoint.enabled}
                          className="inline-flex items-center justify-center rounded-md bg-brand-500 py-2 pr-4 pl-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <BoltIcon />
                          Flash CrossPoint
                        </button>
                        {crosspoint.notesUrl && (
                          <a
                            href={crosspoint.notesUrl}
                            target="_blank"
                            rel="noopener"
                            className="text-sm font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
                          >
                            Release Notes
                          </a>
                        )}
                        {/* Hand-drawn annotation: reassurance at the moment of hesitation */}
                        <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
                          <svg
                            className="w-8 shrink-0 text-stone-400"
                            viewBox="0 0 32 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M30 16 C 22 18, 12 16, 4 8" />
                            <path d="M4 8 l1 6" />
                            <path d="M4 8 l6 0.5" />
                          </svg>
                          <span className="-rotate-2 font-hand text-lg/6 font-medium text-stone-500">
                            takes about two minutes
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-stone-400">
                        If you are coming from Stock or another firmware you may need to flash
                        twice for CrossPoint to show up.
                      </p>
                    </div>
                  )}

                  {/* Nightly panel */}
                  {fw === 'nightly' && (
                    <div>
                      <div className="text-sm font-semibold text-stone-900">CrossPoint Nightly</div>
                      <div className="mt-1 font-mono text-xs text-stone-400 tabular-nums">{nightly.text}</div>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => runFlash('nightly')}
                          disabled={running || !nightly.enabled}
                          className="inline-flex items-center justify-center rounded-md bg-brand-500 py-2 pr-4 pl-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <BoltIcon />
                          Flash Nightly
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-stone-400">
                        Built from the latest master commit. If you are coming from Stock or
                        another firmware you may need to flash twice.
                      </p>

                      {/* Nightly Changelog */}
                      <div className="mt-5 border-t border-stone-200 pt-5">
                        <div className="flex items-center justify-between">
                          <div className="font-display text-sm font-semibold text-stone-700">What's in this build</div>
                          {changelog.status === 'loaded' && (
                            <span className="font-mono text-xs text-stone-400 tabular-nums">
                              {changelog.commits.length} commit{changelog.commits.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {summary && (
                          <div className="mt-3 rounded-lg bg-brand-50/60 px-4 py-3 text-sm/6 text-stone-700">{summary}</div>
                        )}
                        <ul
                          role="list"
                          className="mt-3 max-h-64 divide-y divide-stone-950/5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        >
                          {changelog.status === 'loaded' ? (
                            changelog.commits.map((c, i) => {
                              const msg = c.message
                                .split('\n')[0]
                                .replace(/^(feat|fix|chore|refactor|docs|style|test|perf|ci|build|revert)(\(.+?\))?:\s*/i, '')
                              const cleanMsg = msg.charAt(0).toUpperCase() + msg.slice(1)
                              return (
                                <li key={i} className="flex gap-3 py-2.5 text-sm">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-stone-800">{cleanMsg}</div>
                                    <div className="mt-0.5 text-xs text-stone-400">{c.author}</div>
                                  </div>
                                  <span className="shrink-0 pt-0.5 text-xs text-stone-400 tabular-nums">
                                    {c.date ? relativeTime(c.date) : ''}
                                  </span>
                                </li>
                              )
                            })
                          ) : changelog.status === 'empty' ? (
                            <li className="py-2.5 text-sm text-stone-400">No changelog available</li>
                          ) : (
                            <li className="py-2.5 text-sm text-stone-400">Loading...</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Stock panels */}
                  {(fw === 'stock-en' || fw === 'stock-ch') && (
                    <div>
                      <div className="text-sm font-semibold text-stone-900">
                        {fw === 'stock-en' ? 'Official English Firmware' : 'Official Chinese Firmware'}
                      </div>
                      <div className="mt-1 font-mono text-xs text-stone-400 tabular-nums">
                        {stock[fw === 'stock-en' ? 'en' : 'ch'].text}
                      </div>
                      <button
                        type="button"
                        onClick={() => runFlash(fw)}
                        disabled={running || !stock[fw === 'stock-en' ? 'en' : 'ch'].enabled}
                        className="mt-4 inline-flex items-center justify-center rounded-md bg-stone-800 py-2 pr-4 pl-3 text-sm font-semibold text-white shadow-sm hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <BoltIcon />
                        {fw === 'stock-en' ? 'Flash English Firmware' : 'Flash Chinese Firmware'}
                      </button>
                    </div>
                  )}

                  {/* Beta panels */}
                  {selectedBeta && (
                    <div>
                      <div className="text-sm font-semibold text-stone-900">{selectedBeta.name}</div>
                      <div className="mt-1 font-mono text-xs text-stone-400 tabular-nums">
                        {(selectedBeta.firmwareSize / 1024 / 1024).toFixed(1)} MB &middot;{' '}
                        {fmtDate(selectedBeta.createdAt)}
                      </div>
                      {selectedBeta.notes && (
                        <div
                          className="mt-3 text-sm/6 text-stone-700"
                          // Rendered through the same escape-first markdown subset the old page used.
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedBeta.notes) }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => runFlash(`beta-${selectedBeta.id}`)}
                        disabled={running}
                        className="mt-4 inline-flex items-center justify-center rounded-md bg-amber-600 py-2 pr-4 pl-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <BoltIcon />
                        Flash {selectedBeta.name}
                      </button>
                      <p className="mt-2 text-xs text-stone-400">
                        If you are coming from Stock or another firmware you may need to flash
                        twice for CrossPoint to show up.
                      </p>
                    </div>
                  )}

                  {/* Device build panel (M5Paper / LilyGo) */}
                  {fw === 'device' && deviceBuild && (
                    <div>
                      <div className="text-sm font-semibold text-stone-900">{deviceBuild.name}</div>
                      <div className="mt-1 font-mono text-xs text-stone-400 tabular-nums">
                        {(deviceBuild.firmwareSize / 1024 / 1024).toFixed(1)} MB &middot;{' '}
                        {fmtDate(deviceBuild.uploadedAt)}
                      </div>
                      {deviceBuild.notes && (
                        <div
                          className="mt-3 text-sm/6 text-stone-700"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(deviceBuild.notes) }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => runFlash('device')}
                        disabled={running}
                        className="mt-4 inline-flex items-center justify-center rounded-md bg-amber-600 py-2 pr-4 pl-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <BoltIcon />
                        Flash {deviceBuild.name}
                      </button>
                      <p className="mt-2 text-xs text-stone-400">
                        Beta build for the {DEVICE_INSTALLS[model]?.name}. Writes the bootloader,
                        partition table, and firmware.
                      </p>
                    </div>
                  )}

                  {/* Custom panel */}
                  {fw === 'custom' && (
                    <div>
                      <div className="text-sm font-semibold text-stone-900">Custom Firmware</div>
                      <p className="mt-1 text-xs text-stone-400">
                        {DEVICE_INSTALLS[model]
                          ? 'Upload a firmware .bin. Writes the full boot region (bootloader + partition table + firmware).'
                          : 'Upload a .bin file to flash to the OTA partition.'}
                      </p>
                      <div className="mt-4 flex gap-2">
                        <label className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700">
                          <span>{customFile ? customFile.name : 'Choose file...'}</span>
                          <input
                            type="file"
                            accept=".bin"
                            className="hidden"
                            onChange={(e) => setCustomFile(e.target.files[0] || null)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => runFlash('custom')}
                          disabled={running || !customFile}
                          className="shrink-0 rounded-md bg-stone-800 py-2 pr-4 pl-3 text-sm font-semibold text-white shadow-sm hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <BoltIcon className="mr-1.5 inline size-4 shrink-0 align-text-bottom" />
                          Flash
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Progress Card */}
          {progress && (
            <div ref={progressRef} className="scroll-mt-20 rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
              <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
                {progress.title}
              </h3>
              <StepsList steps={progress.steps} states={progress.states} percent={percent} />
              {progress.status && (
                <div className="mt-4">
                  {progress.status.kind === 'info' && <p className="text-sm text-stone-400">{progress.status.text}</p>}
                  {progress.status.kind === 'ok' && (
                    <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm/6 text-brand-700">{progress.status.text}</div>
                  )}
                  {progress.status.kind === 'err' && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm/6 text-red-800">{progress.status.text}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Restart Instructions */}
          {restart && (
            <div className="rounded-xl bg-stone-100/70 p-5 ring-1 ring-stone-950/5">
              <div className="font-display text-sm font-semibold text-stone-700">After flashing</div>
              {restart.text ? (
                // Non-Xteink full install: device-specific instructions from DEVICE_INSTALLS
                <p className="mt-1 text-sm/6 text-stone-500">{restart.text}</p>
              ) : restart.unplug ? (
                // X3 + CrossPoint/beta/custom: no serial reset, device must be power-cycled by unplugging USB
                <p className="mt-1 text-sm/6 text-stone-500">
                  Unplug and reconnect the USB cable. Don't press the Reset button.
                </p>
              ) : (
                // Default: hard reset happened on the serial side, user just needs to finish the power cycle
                <p className="mt-1 text-sm/6 text-stone-500">
                  Press the <strong className="text-stone-600">Reset</strong> button, then press and hold the power
                  button for 3-5 seconds.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
