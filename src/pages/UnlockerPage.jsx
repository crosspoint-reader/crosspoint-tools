// OTA Xteink Unlocker: downloads for the desktop tool that installs CrossPoint
// over the air on locked X3/X4 devices. Port of public/unlocker.html — same
// copy and download links, restyled in the Free-Ink shell.
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'

const DOWNLOADS = [
  {
    label: 'macOS (.dmg)',
    href: 'https://unlocker-releases.crosspointreader.com/unlocker-latest.dmg',
  },
  {
    label: 'Windows (.msi)',
    href: 'https://unlocker-releases.crosspointreader.com/unlocker-latest.msi',
  },
  {
    label: 'Linux x64 (.deb)',
    href: 'https://unlocker-releases.crosspointreader.com/unlocker-latest.deb',
  },
  {
    label: 'Raspberry Pi (.deb)',
    href: 'https://unlocker-releases.crosspointreader.com/unlocker-latest-arm64.deb',
  },
]

function DownloadIcon() {
  return (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5m0 0l4.5-4.5M12 16.5V3"
      />
    </svg>
  )
}

export default function UnlockerPage() {
  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-6 pb-20">
        <div className="pt-12 pb-2 sm:pt-16">
          <Eyebrow>Last resort</Eyebrow>
          <h1 className="mt-3 max-w-[24ch] font-display text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-3xl">
            OTA Xteink Unlocker
          </h1>
          <p className="mt-3 max-w-[52ch] text-lg text-pretty text-stone-600 sm:text-base/7">
            For locked Xteink devices that won't take an SD card flash.
          </p>
        </div>

        {/* Try SD flashing first */}
        <div className="my-6 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
          <span className="font-semibold">Try SD card flashing first.</span> It's simpler and needs
          no extra software.{' '}
          <Link
            to="/unlock"
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            See the SD flashing steps
          </Link>
          . Only reach for the Unlocker if your firmware won't flash from the SD card.
        </div>

        {/* How it works */}
        <div className="rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
            How it works
          </h2>
          <p className="mt-2 text-sm/6 text-pretty text-stone-600">
            International Xteink devices (including those from AliExpress) ship with USB flashing
            disabled. Xteink Unlocker turns your computer into a local hotspot that intercepts the
            device's official update channel and serves CrossPoint or Crossink instead of the stock
            firmware, installing community firmware entirely over the air. It does not unlock your
            USB flashing capabilities, but it does allow flashing of custom firmware.
          </p>
          <p className="mt-3 text-sm/6 text-pretty text-stone-600">
            Available for macOS, Windows, and Linux, including ARM64 builds for Raspberry Pi OS.
            The tool is{' '}
            <a
              href="https://github.com/crosspoint-reader/crosspoint-tools"
              className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              open sourced on GitHub
            </a>
            .
          </p>
        </div>

        {/* Downloads */}
        <div className="mt-4 rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900 sm:text-base/6">
            Download the Unlocker
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {DOWNLOADS.map((d) => (
              <a
                key={d.label}
                href={d.href}
                className="flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-sm hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
              >
                <DownloadIcon />
                {d.label}
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs text-pretty text-stone-400">
            Use at your own risk. USB flashing will still be disabled, but you can use this tool to
            flash updated firmware any time.
          </p>
        </div>
      </div>
    </Layout>
  )
}
