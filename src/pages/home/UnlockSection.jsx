import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eyebrow } from '../../components/ui.jsx'

// Locked device CTA: anchor #unlock-tool is linked publicly, keep it.
export default function UnlockSection() {
  const [downloading, setDownloading] = useState(false)
  const [status, setStatus] = useState('Latest stable release, the same firmware for X3 and X4.')

  // SD flashing: one-click download of the latest stable release as update.bin.
  // The stable firmware is the same binary for X3 and X4, so no device picker is needed.
  async function downloadUpdateBin() {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await fetch('/api/release/firmware')
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'update.bin'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setStatus('Saved as update.bin. Copy it to your SD card root.')
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setDownloading(false)
    }
  }

  const steps = [
    <>
      Download <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-xs text-stone-700">update.bin</code> below
      and copy it to the SD card root.
    </>,
    <>
      Plug USB into power, then hold the <span className="font-semibold text-stone-900">power + up</span> buttons{' '}
      <span className="text-stone-500">(Top left button for X3)</span>.
    </>,
    <>The OEM bootloader flashes CrossPoint from the SD card.</>,
  ]

  return (
    <section id="unlock-tool" className="relative scroll-mt-20 overflow-hidden border-t border-stone-200 bg-stone-50 py-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 paper-grain opacity-[0.04]"
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-start gap-12 px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8">
        <div>
          <Eyebrow>USB flashing not working?</Eyebrow>
          <h2 className="mt-2 max-w-[24ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
            Have a locked device?
          </h2>
          <p className="mt-6 max-w-[58ch] font-serif text-xl/9 text-pretty text-stone-600">
            Some international Xteink devices, including most from AliExpress, ship with{' '}
            <strong className="font-medium text-stone-900">USB flashing disabled</strong>. The{' '}
            <strong className="font-medium text-stone-900">SD card method</strong> gets
            CrossPoint onto a locked device in a few minutes. It won&rsquo;t unlock USB
            flashing, but it will run custom firmware.
          </p>
          <p className="mt-6 text-sm/6 text-pretty text-stone-500">
            Stuck on a firmware that doesn&rsquo;t support SD flashing? Use the{' '}
            <Link
              to="/unlocker"
              className="font-medium text-brand-600 underline decoration-brand-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500"
            >
              OTA Unlocker Tool
            </Link>
            .
          </p>
        </div>

        {/* Primary path: SD card flashing */}
        <div className="rounded-2xl bg-white p-6 text-left shadow-sm ring-1 ring-stone-950/5 sm:p-7">
          <h3 className="font-display text-sm font-semibold text-stone-900">Flash from SD card</h3>
          <p className="mt-1 text-xs text-stone-400">Recommended for X3 and X4, even on stock firmware.</p>
          <ol className="mt-5 space-y-4">
            {steps.map((content, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 font-mono text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <p className="text-sm/6 text-stone-600">{content}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <button
              type="button"
              onClick={downloadUpdateBin}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-md bg-brand-500 py-2.5 pr-4 pl-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5m0 0l4.5-4.5M12 16.5V3" />
              </svg>
              <span>{downloading ? 'Downloading...' : 'Download firmware (update.bin)'}</span>
            </button>
            <p className="mt-2 text-xs text-stone-400">{status}</p>
          </div>
          <p className="mt-6 border-t border-stone-200 pt-5 text-sm/6 text-red-700">
            <span className="font-semibold">Before you flash:</span> check the{' '}
            <a
              href="https://brickclub.pages.dev/"
              target="_blank"
              rel="noopener"
              className="font-semibold text-red-700 underline decoration-red-300 underline-offset-2 hover:text-red-800 hover:decoration-red-500"
            >
              list of approved and flagged firmware
            </a>
            . Flashing unapproved firmware can <span className="font-semibold">permanently brick your device</span>.
          </p>
        </div>
      </div>
    </section>
  )
}
