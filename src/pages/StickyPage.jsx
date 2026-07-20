// Sticky Flasher (hidden page): flashes CrossPoint to the Seeed reTerminal
// Sticky (ESP32-S3) over WebSerial. Port of public/sticky.html — same
// /api/sticky/info + /api/sticky/firmware endpoints, same full-install flow
// through repairBootRegion (bootloader + partition table + otadata + firmware
// at 921600 baud) — restyled in the Free-Ink shell.
import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import {
  CrossPointFlasher,
  STICKY_PARTITION_TABLE,
  fetchStickyBootloader,
  fetchStickyBootApp0,
} from '../lib/flasher.js'

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function safeUrl(url) {
  const trimmed = url.trim()
  if (/^(https?:\/\/|\/|#|mailto:)/i.test(trimmed)) return trimmed
  return '#'
}

// Minimal, safe markdown subset: escape first, then apply patterns over the
// escaped string. Supports: [text](url), **bold**, *italic*, `code`, bare
// URLs, and newline -> <br>. Same renderer as the main flash page.
function renderMarkdown(str) {
  const cls = 'font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700'
  let html = escapeHtml(str)
  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, text, url) =>
      '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener" class="' + cls + '">' + text + '</a>'
  )
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em]">$1</code>'
  )
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  html = html.replace(
    /(^|[\s(>])(https?:\/\/[^\s<]+[^\s<.,;:!?)'"\]])/g,
    '$1<a href="$2" target="_blank" rel="noopener" class="' + cls + '">$2</a>'
  )
  html = html.replace(/\n/g, '<br>')
  return html
}

function StepBadge({ n }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 font-mono text-xs font-semibold text-white">
      {n}
    </span>
  )
}

function StepsList({ steps, states, progress }) {
  const colors = {
    pending: 'text-stone-400',
    running: 'text-stone-900',
    done: 'text-brand-500',
    error: 'text-red-600',
  }
  const icons = { pending: '○', running: '◠', done: '✓', error: '✗' }
  return (
    <ul role="list" className="mt-4 divide-y divide-stone-100">
      {steps.map((name, i) => {
        const st = states[i] || 'pending'
        const showBar = st === 'running' && (name.includes('Flash') || name.includes('Write'))
        return (
          <li key={name} className={`flex items-center gap-3 py-3 text-sm/5 ${colors[st]}`}>
            <span
              aria-hidden="true"
              className={`flex size-5 shrink-0 items-center justify-center ${st === 'running' ? 'animate-spin' : ''}`}
            >
              {icons[st]}
            </span>
            <span className={showBar ? '' : 'flex-1'}>{name}</span>
            {showBar && (
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function StickyPage() {
  const [serialSupported] = useState(() => 'serial' in navigator)
  const [buildName, setBuildName] = useState('Sticky Beta')
  const [buildInfo, setBuildInfo] = useState('Loading...')
  const [buildNotes, setBuildNotes] = useState(null)
  const [installReady, setInstallReady] = useState(false)
  const [running, setRunning] = useState(false)

  const [progressVisible, setProgressVisible] = useState(false)
  const [progressTitle, setProgressTitle] = useState('Working...')
  const [steps, setSteps] = useState([])
  const [states, setStates] = useState([])
  const [progress, setProgress] = useState(0)
  // status: { kind: 'info' | 'success' | 'error', text }
  const [status, setStatus] = useState(null)
  const [restartVisible, setRestartVisible] = useState(false)

  const progressRef = useRef(null)
  const buildNameRef = useRef('Sticky Beta')

  // --- Load current Sticky build info ---
  useEffect(() => {
    let cancelled = false
    async function loadStickyInfo() {
      try {
        const res = await fetch('/api/sticky/info')
        const data = await res.json()
        if (cancelled) return
        if (!data.build) {
          setBuildInfo('No build uploaded yet')
          return
        }
        const size = (data.build.firmwareSize / 1024 / 1024).toFixed(1)
        const date = new Date(data.build.uploadedAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
        buildNameRef.current = data.build.name
        setBuildName(data.build.name)
        setBuildInfo(`${size} MB - ${date}`)
        setInstallReady(true)
        if (data.build.notes) setBuildNotes(renderMarkdown(data.build.notes))
      } catch {
        if (!cancelled) setBuildInfo('Failed to load')
      }
    }
    loadStickyInfo()
    return () => {
      cancelled = true
    }
  }, [])

  // --- Flash action ---
  async function runAction() {
    if (running) return

    // Request the serial port FIRST, while we still have the user gesture.
    // Vendor-level filter: Espressif (0x303A, any PID — covers USB-Serial-JTAG,
    // ROM download mode, and TinyUSB CDC), Seeed (0x2886) for the stock
    // firmware, and the Silicon Labs / WCH USB-UART bridges Seeed boards ship
    // with. The default Xteink filter also pins the product ID, which would
    // hide the Sticky; no filter at all shows Bluetooth serial ports.
    let serialPort
    try {
      serialPort = await CrossPointFlasher.requestPort([
        { usbVendorId: 0x303a },
        { usbVendorId: 0x2886 },
        { usbVendorId: 0x10c4 },
        { usbVendorId: 0x1a86 },
      ])
    } catch (err) {
      if (err.name !== 'NotFoundError') alert(err.message)
      return
    }

    setRunning(true)
    setProgressVisible(true)
    setRestartVisible(true)
    setStatus(null)
    setSteps([])
    setStates([])
    setProgress(0)
    setTimeout(() => {
      progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)

    try {
      setProgressTitle('Installing ' + buildNameRef.current + '...')
      setStatus({ kind: 'info', text: 'Downloading firmware...' })
      const res = await fetch('/api/sticky/firmware')
      if (!res.ok) throw new Error(`Failed to download firmware: ${res.status}`)
      const firmwareData = new Uint8Array(await res.arrayBuffer())
      const bootloaderData = await fetchStickyBootloader()
      const otadataData = await fetchStickyBootApp0()
      setStatus(null)

      // 921600 baud: the Sticky flashes through a USB-UART bridge, where the
      // configured baud is the real wire speed (115200 would take 5+ min).
      const flasher = new CrossPointFlasher(serialPort, { baudrate: 921600 })
      const flashSteps = [
        'Connect to device',
        'Write bootloader + partition table + firmware',
        'Verify partition table',
        'Reset device',
      ]
      const flashStates = flashSteps.map(() => 'pending')
      setSteps(flashSteps)
      setStates([...flashStates])

      await flasher.repairBootRegion(STICKY_PARTITION_TABLE, {
        bootloaderData,
        firmwareData,
        otadataData,
        onStepChange: (idx, name, st) => {
          flashStates[idx] = st
          setStates([...flashStates])
        },
        onProgress: (step, current, total) => {
          setProgress(((current / total) * 100).toFixed(1))
        },
      })
      setStatus({
        kind: 'success',
        text: 'Installed! Press and hold the power button (top right) to boot CrossPoint.',
      })
    } catch (err) {
      setStatus({ kind: 'error', text: String(err.message || err) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex flex-col items-center text-center">
          <img src="/logo.png" alt="" className="mx-auto size-10 rounded-lg" />
          <Eyebrow className="mt-5">early access</Eyebrow>
          <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900">
            Sticky Flasher
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Flash firmware to the Seeed reTerminal Sticky (ESP32-S3) over USB.
          </p>
        </div>

        {/* Browser check */}
        {!serialSupported && (
          <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
            <span className="font-semibold">Flashing unavailable.</span> The web flasher uses
            WebSerial, which requires Chrome or Edge on desktop.
          </div>
        )}

        <div className="mt-10 space-y-6">
          {/* Step 1: Device */}
          <div>
            <div className="flex items-center gap-2.5">
              <StepBadge n={1} />
              <h3 className="font-display text-sm font-semibold tracking-tight text-stone-900">
                Device
              </h3>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="group relative rounded-xl border-2 border-brand-500 bg-brand-50/40 p-4 text-left"
              >
                <div className="text-sm font-semibold text-stone-900">Sticky</div>
                <div className="mt-0.5 font-mono text-xs text-stone-400">
                  Seeed reTerminal &middot; 800 &times; 480
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Flash */}
          <div>
            <div className="flex items-center gap-2.5">
              <StepBadge n={2} />
              <h3 className="font-display text-sm font-semibold tracking-tight text-stone-900">
                Flash
              </h3>
            </div>
            {buildNotes && (
              <div className="mt-4 rounded-lg bg-brand-50/60 px-4 py-3">
                <div className="text-sm font-semibold text-stone-700">What's in this build</div>
                <div
                  className="mt-1 text-sm/6 text-stone-700"
                  dangerouslySetInnerHTML={{ __html: buildNotes }}
                />
              </div>
            )}
            <div className="mt-4">
              <div className="rounded-xl bg-white p-5 ring-1 ring-stone-950/5">
                <div className="text-sm font-semibold text-stone-900">{buildName}</div>
                <div className="mt-1 font-mono text-xs text-stone-400 tabular-nums">{buildInfo}</div>
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={!installReady || running}
                    onClick={() => runAction()}
                    className="inline-flex items-center justify-center rounded-lg bg-brand-500 py-2 pr-4 pl-3 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg
                      className="mr-1.5 size-4 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                      />
                    </svg>
                    <span>Install {buildName}</span>
                  </button>
                </div>
                <p className="mt-2 text-xs text-stone-400">
                  Writes the bootloader, partition table, and firmware.
                </p>
              </div>
            </div>
          </div>

          {/* Progress Card */}
          {progressVisible && (
            <div
              ref={progressRef}
              className="scroll-mt-20 rounded-xl bg-white p-6 ring-1 ring-stone-950/5"
            >
              <h3 className="font-display text-base/6 font-semibold tracking-tight text-stone-900">
                {progressTitle}
              </h3>
              {steps.length > 0 && <StepsList steps={steps} states={states} progress={progress} />}
              <div className="mt-4">
                {status?.kind === 'info' && <p className="text-sm text-stone-400">{status.text}</p>}
                {status?.kind === 'success' && (
                  <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm/6 text-brand-700">
                    {status.text}
                  </div>
                )}
                {status?.kind === 'error' && (
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm/6 text-red-700">
                    {status.text}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Restart Instructions */}
          {restartVisible && (
            <div className="rounded-xl bg-white p-5 ring-1 ring-stone-950/5">
              <div className="text-sm font-semibold text-stone-700">After flashing</div>
              <p className="mt-1 text-sm/6 text-stone-500">
                Press and hold the <strong className="text-stone-600">power button</strong> (top
                right) to boot CrossPoint.
              </p>
            </div>
          )}

        </div>
      </div>
    </Layout>
  )
}
