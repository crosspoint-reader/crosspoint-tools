import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { fetchReleaseVisibility, fetchBetaBuilds, fetchDeviceBuildInfo, fetchStockFirmwareInfo } from '../lib/flasher.js'

// Maps catalog channels to the release-visibility keys the admin panel uses.
// Only the "real" stable release maps to `crosspoint`; recovery entries
// (channel 'stable', id 'recovery-*') are left alone.
const CHANNEL_VISIBILITY_KEY = { insider: 'nightly', 'stock-en': 'stock-en', 'stock-ch': 'stock-ch' }

// Download .bin modal: device picker + firmware picker (from /api/catalog) → download.

const MODELS = [
  { id: 'x4', name: 'Xteink X4', res: '480 × 800' },
  { id: 'x3', name: 'Xteink X3', res: '528 × 792' },
  { id: 'x4pro', name: 'Xteink X4 Pro', res: '480 × 800' },
]

const CHANNEL_ORDER = { stable: 0, insider: 1, beta: 2, 'stock-en': 3, 'stock-ch': 4 }

function channelLabel(channel) {
  if (channel === 'stable') return 'Stable'
  if (channel === 'insider') return 'Insider (nightly)'
  if (channel === 'beta') return 'Beta'
  if (channel === 'stock-en') return 'Stock · English'
  if (channel === 'stock-ch') return 'Stock · Chinese'
  return channel
}

function stockReleases(model) {
  return ['en', 'ch'].map((lang) => ({
    id: `stock-${lang}-${model}`,
    name: lang === 'en' ? 'Stock English Firmware' : 'Stock Chinese Firmware',
    channel: `stock-${lang}`,
    version: '',
    released_at: '',
    size: 0,
    firmware_url: `/api/firmware/stock?model=${model}&lang=${lang}`,
    supported_devices: [model],
  }))
}

function formatSize(bytes) {
  if (!bytes) return ''
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DownloadModal({ open, onClose }) {
  const [model, setModel] = useState(null)
  const [catalog, setCatalog] = useState(null)
  // Per-device visibility, matching the homepage flasher. `visibility.hidden`
  // covers the fixed release/stock channels; `betaHidden` maps a beta id to the
  // devices it's hidden on. Both default to "nothing hidden" so a fetch failure
  // never blanks the list.
  const [visibility, setVisibility] = useState({ hidden: {} })
  const [betaHidden, setBetaHidden] = useState({})
  // X4 Pro list: admin-uploaded beta build + pinned stock English build,
  // mirroring the homepage flasher (the X4 Pro is not in /api/catalog).
  const [x4proReleases, setX4proReleases] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [status, setStatus] = useState({ text: '', error: false })
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open || catalog) return
    let cancelled = false
    fetch('/api/catalog')
      .then((res) => {
        if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setCatalog(data)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          setCatalog({ releases: [] })
          setLoadError(err.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, catalog])

  // Load per-device visibility (release toggles + beta hiddenDevices) once the
  // modal opens, so the list matches what the homepage flasher shows.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchReleaseVisibility()
      .then((v) => {
        if (!cancelled && v) setVisibility(v)
      })
      .catch(() => {})
    fetchBetaBuilds()
      .then((builds) => {
        if (cancelled || !Array.isArray(builds)) return
        const map = {}
        builds.forEach((b) => {
          if (b.hiddenDevices && b.hiddenDevices.length) map[b.id] = b.hiddenDevices
        })
        setBetaHidden(map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || model !== 'x4pro' || x4proReleases) return
    let cancelled = false
    Promise.all([
      fetchDeviceBuildInfo('x4pro').catch(() => null),
      fetchStockFirmwareInfo('x4pro', 'en').catch(() => null),
    ]).then(([build, stockInfo]) => {
      if (cancelled) return
      const list = []
      if (build) {
        list.push({
          id: 'x4pro-beta',
          name: build.name || 'X4 Pro Beta',
          channel: 'beta',
          version: '',
          released_at: build.uploadedAt || '',
          size: build.firmwareSize || 0,
          firmware_url: '/api/device-build/x4pro/firmware',
          filename: 'x4pro-firmware.bin',
          supported_devices: ['x4pro'],
        })
      }
      // Pinned stock build; English only — the X4 Pro has no Chinese variant.
      list.push({
        id: 'x4pro-stock-en',
        name: 'Stock English Firmware',
        channel: 'stock-en',
        version: stockInfo?.version || '',
        released_at: '',
        size: 0,
        firmware_url: '/api/firmware/stock?model=x4pro&lang=en',
        filename: 'x4pro-stock-en.bin',
        supported_devices: ['x4pro'],
      })
      setX4proReleases(list)
    })
    return () => {
      cancelled = true
    }
  }, [open, model, x4proReleases])

  // Order: stable, insider, betas, stock (newest first). Options hidden for the
  // selected device (via the admin panel) are filtered out first.
  const releases = useMemo(() => {
    if (model === 'x4pro') return x4proReleases || []
    if (!model || !catalog) return []
    const hidden = visibility.hidden || {}
    const isHidden = (key) => (hidden[key] || []).includes(model)
    const base = (catalog.releases || []).filter((r) => {
      if (r.supported_devices && !r.supported_devices.includes(model)) return false
      if (r.channel === 'beta') return !(betaHidden[r.id] || []).includes(model)
      // Only the real stable release honors the crosspoint toggle; recovery
      // entries (id 'recovery-*') stay visible regardless.
      if (r.channel === 'stable' && r.id.startsWith('stable-')) return !isHidden('crosspoint')
      const key = CHANNEL_VISIBILITY_KEY[r.channel]
      if (key) return !isHidden(key)
      return true
    })
    const stock = stockReleases(model).filter((r) => !isHidden(r.channel))
    return [...base, ...stock].sort((a, b) => {
      const ca = CHANNEL_ORDER[a.channel] ?? 99
      const cb = CHANNEL_ORDER[b.channel] ?? 99
      if (ca !== cb) return ca - cb
      return (b.released_at || '').localeCompare(a.released_at || '')
    })
  }, [model, catalog, visibility, betaHidden, x4proReleases])

  // Default to the latest stable release (falling back to the top of the list,
  // e.g. for X3 which has no stable build) so SD flashing is one click away.
  useEffect(() => {
    if (!releases.length) return
    if (selectedId && releases.some((r) => r.id === selectedId)) return
    setSelectedId((releases.find((r) => r.channel === 'stable') || releases[0]).id)
  }, [releases, selectedId])

  const selected = releases.find((r) => r.id === selectedId) || null
  // Stock firmware SD flashing requires the update.bin name; CrossPoint's SD
  // Firmware Flash feature accepts any filename. X4/X3 downloads use update.bin
  // so they work either way; X4 Pro downloads (CrossPoint- or USB-only) keep
  // descriptive filenames.
  const downloadName = selected?.filename || 'update.bin'

  async function downloadSelected() {
    if (!selected || downloading) return
    setDownloading(true)
    setStatus({ text: 'Downloading...', error: false })
    try {
      const res = await fetch(selected.firmware_url)
      if (!res.ok) throw new Error(`Download failed: ${res.status}`)
      const blob = await res.blob()
      // SD card flashing requires the file to be named update.bin on the card root.
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setStatus({ text: `Saved as ${downloadName}`, error: false })
    } catch (err) {
      console.error(err)
      setStatus({ text: `Error: ${err.message}`, error: true })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Download firmware">
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
          {model === 'x4pro' ? (
            <p>
              On the X4 Pro, devices already running CrossPoint can flash these <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">.bin</code>{' '}
              files from the SD card. Stock firmware cannot install them from SD — use the USB flash
              tool on the home page instead.
            </p>
          ) : (
            <p>
              To install via SD card, save the file as{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">update.bin</code>{' '}
              in the root of your SD card, then insert it into your device and follow the on-screen
              prompts to flash.
            </p>
          )}
        </div>

        <div>
          <div className="text-sm font-semibold text-stone-900">Select your device</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={
                  model === m.id
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

        {model && (
          <div>
            <div className="text-sm font-semibold text-stone-900">Choose firmware</div>
            <div className="mt-3 space-y-2">
              {(model === 'x4pro' ? !x4proReleases : !catalog) ? (
                <p className="text-sm text-stone-400">Loading...</p>
              ) : model !== 'x4pro' && loadError ? (
                <p className="text-sm text-red-600">Failed to load firmware list: {loadError}</p>
              ) : releases.length === 0 ? (
                <p className="text-sm text-stone-400">No firmware available right now.</p>
              ) : (
                releases.map((r) => {
                  const isSel = r.id === selectedId
                  const date = r.released_at ? new Date(r.released_at).toLocaleDateString() : ''
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={
                        isSel
                          ? 'w-full rounded-xl border-2 border-brand-500 bg-brand-50/40 p-3 text-left'
                          : 'w-full rounded-xl border border-stone-200 p-3 text-left hover:border-stone-300'
                      }
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-sm font-semibold text-stone-900">{r.name || r.id}</div>
                        <div className="shrink-0 font-mono text-[11px] font-medium tracking-wide text-brand-600 uppercase">
                          {channelLabel(r.channel)}
                        </div>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-stone-400 tabular-nums">
                        {r.version || ''} {date ? '· ' + date : ''} {r.size ? '· ' + formatSize(r.size) : ''}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {selected && (
          <div>
            <button
              type="button"
              onClick={downloadSelected}
              disabled={downloading}
              className="inline-flex items-center justify-center rounded-md bg-brand-500 py-2 pr-4 pl-3 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="mr-1.5 size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5m0 0l4.5-4.5M12 16.5V3" />
              </svg>
              Download .bin
            </button>
            <p className="mt-2 text-xs text-stone-400">
              Saves as{' '}
              <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px] text-stone-600">
                {downloadName}
              </code>
              {model === 'x4pro'
                ? ', ready to flash from CrossPoint via SD or over USB.'
                : ', ready to drop on your SD card root.'}
            </p>
            {status.text && (
              <p className={`mt-1 text-xs ${status.error ? 'text-red-600' : 'text-stone-400'}`}>{status.text}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
