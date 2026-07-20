import { useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import DownloadModal from '../components/DownloadModal.jsx'
import { Eyebrow } from '../components/ui.jsx'
import {
  CrossPointFlasher,
  X3_PARTITION_TABLE,
  X4_PARTITION_TABLE,
  CROSSPOINT_KO_PARTITION_TABLE,
  downloadBlob,
  otaStateName,
  fetchBundledBootloader,
  fetchReleaseFirmware,
} from '../lib/flasher.js'
import { fmtHex, fmtSize, hexPreview, identifyFirmwareData } from './debug/helpers.js'

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function ToolCard({ title, children }) {
  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
      <h2 className="font-display text-base font-semibold tracking-tight text-stone-900">{title}</h2>
      {children}
    </div>
  )
}

function Mono({ children }) {
  return <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px] text-stone-700">{children}</code>
}

const btnBase =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btnBase} bg-brand-500 text-white shadow-sm hover:bg-brand-600 focus-visible:outline-brand-500`
const btnDark = `${btnBase} bg-stone-900 text-white shadow-sm hover:bg-stone-700 focus-visible:outline-stone-900`
const btnOutline = `${btnBase} bg-white text-stone-700 shadow-sm ring-1 ring-stone-950/10 hover:bg-stone-50`

const inputClass =
  'min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:rounded file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:font-mono file:text-xs file:text-stone-600'

function PartitionTable({ partitions, title, highlight = false }) {
  return (
    <div className={`overflow-hidden rounded-xl bg-white ${highlight ? 'ring-2 ring-brand-500' : 'ring-1 ring-stone-200'}`}>
      <div className="bg-stone-50 px-3 py-2 font-mono text-xs font-semibold text-stone-700">{title}</div>
      <table className="w-full">
        <thead>
          <tr className="bg-stone-50/50 text-left font-mono text-xs font-medium tracking-wide text-stone-400 uppercase">
            <th className="px-2 py-1">Type</th>
            <th className="px-2 py-1">Offset</th>
            <th className="px-2 py-1">Size</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {partitions.map((p, i) => (
            <tr key={i} className="border-t border-stone-100">
              <td className="px-2 py-1 font-mono text-xs text-stone-700">{p.type}</td>
              <td className="px-2 py-1 font-mono text-xs text-stone-500 tabular-nums">{fmtHex(p.offset)}</td>
              <td className="px-2 py-1 font-mono text-xs text-stone-500 tabular-nums">{fmtHex(p.size)}</td>
              <td className="px-2 py-1 text-xs text-stone-400">{fmtSize(p.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pill({ tone = 'stone', children }) {
  const tones = {
    brand: 'bg-brand-50 font-medium text-brand-700',
    stone: 'bg-stone-100 text-stone-600',
  }
  return <span className={`rounded-full px-3 py-1 font-mono text-xs ${tones[tone]}`}>{children}</span>
}

function LayoutBadge({ matchedLayout }) {
  let dot, wrap, text
  if (matchedLayout === 'X4') {
    dot = 'bg-brand-500'
    wrap = 'bg-brand-50 text-brand-700'
    text = 'CrossPoint layout: ready to flash'
  } else if (matchedLayout === 'KO') {
    dot = 'bg-brand-500'
    wrap = 'bg-brand-50 text-brand-700'
    text = 'CrossPoint KO fork layout: ready to flash'
  } else if (matchedLayout === 'X3') {
    dot = 'bg-amber-500'
    wrap = 'bg-amber-50 text-amber-700'
    text = 'Stock X3 layout: needs repartition before flashing CrossPoint'
  } else {
    dot = 'bg-red-500'
    wrap = 'bg-red-50 text-red-700'
    text = 'Unknown layout (no match for Stock X3, CrossPoint, or KO fork)'
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-medium ${wrap}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  )
}

function HexPane({ data }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-xl bg-stone-950 p-4 font-mono text-xs leading-relaxed text-stone-100">
      {hexPreview(data)}
    </pre>
  )
}

function OtaResult({ data, onDownloadRaw }) {
  const slots = [
    { label: 'app0', index: 0, details: data.ota.slot0 },
    { label: 'app1', index: 1, details: data.ota.slot1 },
  ]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="brand">Current boot: app{data.ota.activeApp}</Pill>
        <Pill>Next swap target: app{data.ota.inactiveApp}</Pill>
        <Pill>otadata offset: {fmtHex(data.offset)}</Pill>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map(({ label, index, details }) => (
          <div key={label} className="rounded-xl bg-white ring-1 ring-stone-200">
            <div className="bg-stone-50 px-3 py-2 font-mono text-xs font-semibold text-stone-700">{label}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 text-xs">
              <dt className="text-stone-400">Boot partition</dt>
              <dd className={`font-medium ${data.ota.activeApp === index ? 'text-brand-700' : 'text-stone-600'}`}>
                {data.ota.activeApp === index ? 'Yes' : 'No'}
              </dd>
              <dt className="text-stone-400">OTA sequence</dt>
              <dd className="font-mono text-stone-700">{details.sequence}</dd>
              <dt className="text-stone-400">OTA state</dt>
              <dd className="font-mono text-stone-700">{otaStateName(details.state)}</dd>
              <dt className="text-stone-400">CRC32 valid</dt>
              <dd className={`font-medium ${details.crcValid ? 'text-brand-700' : 'text-red-600'}`}>
                {details.crcValid ? 'Yes' : 'No'}
              </dd>
            </dl>
          </div>
        ))}
      </div>
      <button type="button" onClick={onDownloadRaw} className={btnOutline}>
        Download raw otadata
      </button>
      <HexPane data={data.data} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DebugPage() {
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState({ text: '', error: false })
  const [result, setResult] = useState(null)

  const repairLayoutRef = useRef(null)
  const repairBootloaderRef = useRef(null)
  const repairFlashOsRef = useRef(null)
  const fullFlashFileRef = useRef(null)
  const lastDownloadRef = useRef(null)

  const setStatusText = (text, error = false) => setStatus({ text: String(text), error })
  const setProgress = (label, current, total) => {
    const pct = total ? Math.round((current / total) * 100) : 0
    setStatusText(`${label}: ${fmtSize(current)} / ${fmtSize(total)} (${pct}%)`)
  }
  const downloadLastData = (filename) => {
    if (lastDownloadRef.current) downloadBlob(lastDownloadRef.current, filename)
  }

  async function withConnectedFlasher(operation) {
    const port = await CrossPointFlasher.requestPort()
    const flasher = new CrossPointFlasher(port)
    try {
      await flasher.connect()
      return await operation(flasher)
    } finally {
      try {
        await flasher.disconnect(true)
      } catch {}
    }
  }

  // -- Read partition table --------------------------------------------------

  async function readPartitionTable() {
    setResult(null)
    setStatusText('Requesting device...')

    let port
    try {
      port = await CrossPointFlasher.requestPort()
    } catch {
      setStatusText('No device selected.')
      return
    }

    setBusy(true)
    const flasher = new CrossPointFlasher(port)
    try {
      setStatusText('Connecting...')
      await flasher.connect()
      setStatusText('Reading partition table at 0x8000...')
      const { partitions, matchedLayout } = await flasher.readPartitionTable()

      const layoutMeta = {
        X4: { name: 'CrossPoint', table: X4_PARTITION_TABLE },
        X3: { name: 'Stock X3', table: X3_PARTITION_TABLE },
        KO: { name: 'CrossPoint KO fork', table: CROSSPOINT_KO_PARTITION_TABLE },
      }
      const meta = matchedLayout ? layoutMeta[matchedLayout] : null
      const expectedTable = meta ? meta.table : X4_PARTITION_TABLE
      const expectedTableLabel = meta ? `${meta.name} layout` : 'No matching layout'

      setStatusText('')
      setResult(
        <>
          <div className="mb-3">
            <LayoutBadge matchedLayout={matchedLayout} />
          </div>
          <div className="space-y-3">
            <PartitionTable partitions={partitions} title="On-device partition table" highlight />
            <PartitionTable partitions={expectedTable} title={expectedTableLabel} />
          </div>
        </>
      )
    } catch (err) {
      setStatusText(err.message || err, true)
    } finally {
      try {
        await flasher.disconnect(true)
      } catch {}
      setBusy(false)
    }
  }

  // -- Full flash save / restore ---------------------------------------------

  async function saveFullFlash() {
    setResult(null)
    setStatusText('Requesting device...')
    let port
    try {
      port = await CrossPointFlasher.requestPort()
    } catch {
      setStatusText('No device selected.')
      return
    }
    setBusy(true)
    const flasher = new CrossPointFlasher(port)
    try {
      const data = await flasher.saveFullFlash({ onProgress: setProgress })
      downloadBlob(data, 'flash.bin')
      setStatusText('Full flash saved as flash.bin.')
    } catch (err) {
      setStatusText(err.message || err, true)
    } finally {
      try {
        await flasher.disconnect(true)
      } catch {}
      setBusy(false)
    }
  }

  async function writeFullFlash() {
    const file = fullFlashFileRef.current?.files[0]
    if (!file) {
      setStatusText('Choose a 16 MB flash .bin first.', true)
      return
    }
    setResult(null)
    setStatusText('Requesting device...')
    let port
    try {
      port = await CrossPointFlasher.requestPort()
    } catch {
      setStatusText('No device selected.')
      return
    }
    setBusy(true)
    const flasher = new CrossPointFlasher(port)
    try {
      setStatusText('Reading file...')
      const data = new Uint8Array(await file.arrayBuffer())
      await flasher.writeFullFlash(data, { onProgress: setProgress })
      setStatusText('Full flash write complete.')
    } catch (err) {
      setStatusText(err.message || err, true)
    } finally {
      try {
        await flasher.disconnect(true)
      } catch {}
      setBusy(false)
    }
  }

  // -- Repair boot region ------------------------------------------------------

  async function repairBootRegion() {
    const layoutKey = repairLayoutRef.current.value
    const tables = { X4: X4_PARTITION_TABLE, X3: X3_PARTITION_TABLE, KO: CROSSPOINT_KO_PARTITION_TABLE }
    const table = tables[layoutKey]
    const bootloaderFile = repairBootloaderRef.current?.files[0]

    setResult(null)
    setStatusText('Requesting device...')
    let port
    try {
      port = await CrossPointFlasher.requestPort()
    } catch {
      setStatusText('No device selected.')
      return
    }
    setBusy(true)
    const flasher = new CrossPointFlasher(port)
    try {
      setStatusText(bootloaderFile ? 'Reading bootloader file...' : 'Downloading bundled bootloader...')
      const bootloaderData = bootloaderFile
        ? new Uint8Array(await bootloaderFile.arrayBuffer())
        : await fetchBundledBootloader()
      let firmwareData = null
      if (repairFlashOsRef.current?.checked) {
        setStatusText('Downloading CrossPoint firmware...')
        firmwareData = await fetchReleaseFirmware()
      }
      const { partitions } = await flasher.repairBootRegion(table, {
        bootloaderData,
        firmwareData,
        onProgress: setProgress,
        onStepChange: (idx, label, state) => {
          if (state === 'running') setStatusText(`${label}...`)
        },
      })
      setStatusText(
        firmwareData
          ? 'Boot region repaired and CrossPoint flashed. The device should now boot into CrossPoint.'
          : 'Boot region repaired. Flash firmware from the flash page to finish recovery.'
      )
      setResult(<PartitionTable partitions={partitions} title="On-device partition table after repair" highlight />)
    } catch (err) {
      setStatusText(err.message || err, true)
    } finally {
      try {
        await flasher.disconnect(true)
      } catch {}
      setBusy(false)
    }
  }

  // -- Partition debug controls ------------------------------------------------

  async function readOtadata() {
    setResult(null)
    setStatusText('Requesting device...')
    setBusy(true)
    try {
      const data = await withConnectedFlasher((flasher) => flasher.readOtadataPartition({ onProgress: setProgress }))
      lastDownloadRef.current = data.data
      setStatusText('')
      setResult(<OtaResult data={data} onDownloadRaw={() => downloadLastData('otadata.bin')} />)
    } catch (err) {
      setStatusText(err.message || err, true)
    } finally {
      setBusy(false)
    }
  }

  async function readAppPartition(partition) {
    setResult(null)
    setStatusText('Requesting device...')
    setBusy(true)
    try {
      const data = await withConnectedFlasher((flasher) =>
        flasher.readAppPartition(partition, { onProgress: setProgress })
      )
      lastDownloadRef.current = data.data
      setStatusText('')
      setResult(
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">{partition}</Pill>
            <Pill>Offset: {fmtHex(data.offset)}</Pill>
            <Pill>Size: {fmtSize(data.size)}</Pill>
          </div>
          <button type="button" onClick={() => downloadLastData(`${partition}.bin`)} className={btnOutline}>
            Download raw {partition}
          </button>
          <HexPane data={data.data} />
        </div>
      )
    } catch (err) {
      setStatusText(err.message || err, true)
    } finally {
      setBusy(false)
    }
  }

  async function swapBootPartition() {
    setResult(null)
    setStatusText('Requesting device...')
    let port
    try {
      port = await CrossPointFlasher.requestPort()
    } catch {
      setStatusText('No device selected.')
      return
    }
    setBusy(true)
    const flasher = new CrossPointFlasher(port)
    try {
      const data = await flasher.swapBootPartition({ onProgress: setProgress, skipReset: false })
      lastDownloadRef.current = data.data
      setStatusText('Boot partition swapped.')
      setResult(<OtaResult data={data} onDownloadRaw={() => downloadLastData('otadata.bin')} />)
    } catch (err) {
      setStatusText(err.message || err, true)
    } finally {
      try {
        await flasher.disconnect(true)
      } catch {}
      setBusy(false)
    }
  }

  async function identifyFirmware() {
    setResult(null)
    setStatusText('Requesting device...')
    setBusy(true)
    try {
      const identified = await withConnectedFlasher(async (flasher) => {
        const otaData = await flasher.readOtadataPartition({ onProgress: setProgress })
        const readAndIdentify = async (partition) => {
          const chunkSize = 0x6400
          const maxReadSize = 0x20000
          let readData = new Uint8Array()
          let info = null
          for (let offset = 0; offset < maxReadSize; offset += chunkSize) {
            const chunk = await flasher.readAppPartitionForIdentification(partition, {
              readSize: chunkSize,
              offset,
              onProgress: setProgress,
            })
            const next = new Uint8Array(readData.length + chunk.length)
            next.set(readData)
            next.set(chunk, readData.length)
            readData = next
            info = identifyFirmwareData(readData)
            if (info.type !== 'unknown') break
          }
          return info || { type: 'unknown', version: 'unknown', displayName: 'Custom/Unknown Firmware' }
        }
        return {
          currentBoot: `app${otaData.ota.activeApp}`,
          app0: await readAndIdentify('app0'),
          app1: await readAndIdentify('app1'),
        }
      })
      setStatusText('')
      setResult(
        <div className="grid gap-3 sm:grid-cols-2">
          {['app0', 'app1'].map((label) => {
            const info = identified[label]
            const palette =
              info.type === 'crosspoint'
                ? 'bg-blue-50 text-blue-700'
                : info.type === 'unknown'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-brand-50 text-brand-700'
            return (
              <div key={label} className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-mono text-sm font-semibold text-stone-900">{label}</h3>
                  {identified.currentBoot === label && (
                    <span className="rounded-full bg-brand-50 px-2 py-1 font-mono text-xs font-medium text-brand-700">
                      Active
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <dt className="text-stone-400">Firmware</dt>
                  <dd className="text-stone-700">{info.displayName}</dd>
                  <dt className="text-stone-400">Version</dt>
                  <dd className="font-mono text-stone-700">{info.version}</dd>
                  <dt className="text-stone-400">Type</dt>
                  <dd>
                    <span className={`rounded-full px-2 py-1 font-mono font-medium ${palette}`}>{info.type}</span>
                  </dd>
                </dl>
              </div>
            )
          })}
        </div>
      )
    } catch (err) {
      setStatusText(err.message || err, true)
    } finally {
      setBusy(false)
    }
  }

  // -- Render --------------------------------------------------------------

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20 lg:px-8">
        <Eyebrow>Console · Low-level tools</Eyebrow>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-5xl">
          Debug
        </h1>
        <p className="mt-4 max-w-[60ch] text-lg text-pretty text-stone-600">
          Low-level tools for inspecting Xteink devices.
        </p>

        <div className="mt-12 space-y-4">
          <ToolCard title="Download firmware">
            <p className="mt-1 text-sm text-stone-600">
              Download a firmware <Mono>.bin</Mono> for your device (stable, insider, beta, or stock) to flash
              manually or copy to an SD card.
            </p>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setDownloadOpen(true)} className={btnPrimary}>
                Download firmware
              </button>
            </div>
          </ToolCard>

          <ToolCard title="Read partition table">
            <p className="mt-1 text-sm text-stone-600">
              Connects to a device, reads the partition table at <Mono>0x8000</Mono>, and compares it against the
              known X3 and X4 layouts.
            </p>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={readPartitionTable} disabled={busy} className={btnPrimary}>
                Connect &amp; read
              </button>
            </div>
          </ToolCard>

          <ToolCard title="Repair boot region">
            <p className="mt-1 text-sm text-stone-600">
              Restores the bootloader at <Mono>0x0</Mono>, rewrites a known-good partition table at{' '}
              <Mono>0x8000</Mono>, and blanks the NVS and OTA data partitions. Use this when the partition table has
              been overwritten (e.g. firmware flashed to <Mono>0x0</Mono> by mistake) and flashing fails with{' '}
              <span className="font-mono text-[13px]">"Partition table has no otadata partition"</span>.
            </p>
            <p className="mt-2 text-sm text-amber-600">
              This erases saved settings and Wi-Fi credentials. Firmware must be re-flashed afterwards from the flash
              page.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select
                ref={repairLayoutRef}
                defaultValue="X4"
                className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
              >
                <option value="X4">CrossPoint (X4) layout</option>
                <option value="X3">Stock X3 layout</option>
                <option value="KO">CrossPoint KO fork layout</option>
              </select>
              <div className="flex gap-2">
                <input
                  ref={repairBootloaderRef}
                  type="file"
                  accept=".bin,application/octet-stream"
                  className={inputClass}
                />
                <button type="button" onClick={repairBootRegion} disabled={busy} className={btnDark}>
                  Repair
                </button>
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-stone-600">
              <input
                ref={repairFlashOsRef}
                type="checkbox"
                defaultChecked
                className="size-4 rounded border-stone-300 accent-brand-500"
              />
              Also flash the latest stable CrossPoint firmware, so the device boots straight into CrossPoint
            </label>
            <p className="mt-3 text-xs text-stone-400">
              The bundled ESP32-C3 bootloader is used by default; supply a <Mono>bootloader.bin</Mono> above to
              override it. Uncheck the firmware option if you plan to flash stock or a beta build instead.
            </p>
          </ToolCard>

          <ToolCard title="Full flash controls">
            <p className="mt-1 text-sm text-stone-600">
              Save or restore the complete 16 MB flash image. Save full flash can take around 25 minutes.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={saveFullFlash} disabled={busy} className={btnPrimary}>
                Save full flash
              </button>
              <div className="flex gap-2">
                <input ref={fullFlashFileRef} type="file" accept=".bin,application/octet-stream" className={inputClass} />
                <button type="button" onClick={writeFullFlash} disabled={busy} className={btnDark}>
                  Write full flash
                </button>
              </div>
            </div>
          </ToolCard>

          <ToolCard title="Partition debug controls">
            <p className="mt-1 text-sm text-stone-600">
              These reads use the on-device partition table for otadata and app slot offsets.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={readOtadata} disabled={busy} className={btnPrimary}>
                Read otadata partition
              </button>
              <button type="button" onClick={swapBootPartition} disabled={busy} className={btnDark}>
                Swap boot partitions
              </button>
              <button type="button" onClick={() => readAppPartition('app0')} disabled={busy} className={btnPrimary}>
                Read app0 partition
              </button>
              <button type="button" onClick={() => readAppPartition('app1')} disabled={busy} className={btnPrimary}>
                Read app1 partition
              </button>
              <button
                type="button"
                onClick={identifyFirmware}
                disabled={busy}
                className={`${btnPrimary} sm:col-span-2`}
              >
                Identify firmware in both partitions
              </button>
            </div>
          </ToolCard>

          <ToolCard title="Output">
            {status.text ? (
              <p className={`mt-3 font-mono text-xs ${status.error ? 'text-red-600' : 'text-stone-500'}`}>
                {status.text}
              </p>
            ) : null}
            {result ? <div className="mt-3">{result}</div> : null}
            {!status.text && !result ? (
              <p className="mt-3 font-mono text-xs text-stone-400">Idle. Run a tool above to see output here.</p>
            ) : null}
          </ToolCard>
        </div>
      </div>

      <DownloadModal open={downloadOpen} onClose={() => setDownloadOpen(false)} />
    </Layout>
  )
}
