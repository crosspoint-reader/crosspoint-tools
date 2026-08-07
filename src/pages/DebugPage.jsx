import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import DownloadModal from '../components/DownloadModal.jsx'
import { Eyebrow } from '../components/ui.jsx'
import {
  CrossPointFlasher,
  X3_PARTITION_TABLE,
  X4_PARTITION_TABLE,
  X4_PRO_PARTITION_TABLE,
  CROSSPOINT_KO_PARTITION_TABLE,
  downloadBlob,
  otaStateName,
  fetchBundledBootloader,
  fetchFlashAsset,
  fetchReleaseFirmware,
  fetchDeviceBuildFirmware,
} from '../lib/flasher.js'
import { fmtHex, fmtSize, hexPreview, identifyFirmwareData } from './debug/helpers.js'

// Devices the debug tools can target. The chip is checked against the
// connected device before anything is written, mirroring MODEL_CHIPS in
// FlashTools; the X4 Pro is the odd one out (ESP32-S3, its own bundled
// bootloader asset, admin-uploaded firmware build instead of the release
// catalog).
const DEBUG_DEVICES = {
  x4: {
    name: 'Xteink X4',
    chip: 'ESP32-C3',
    layouts: [
      { value: 'X4', label: 'CrossPoint (X4) layout', table: X4_PARTITION_TABLE },
      { value: 'X3', label: 'Stock X3 layout', table: X3_PARTITION_TABLE },
      { value: 'KO', label: 'CrossPoint KO fork layout', table: CROSSPOINT_KO_PARTITION_TABLE },
    ],
  },
  x4pro: {
    name: 'Xteink X4 Pro',
    chip: 'ESP32-S3',
    layouts: [{ value: 'X4PRO', label: 'Factory-compatible (X4 Pro) layout', table: X4_PRO_PARTITION_TABLE }],
  },
  x3: {
    name: 'Xteink X3',
    chip: 'ESP32-C3',
    layouts: [
      { value: 'X4', label: 'CrossPoint (X4) layout', table: X4_PARTITION_TABLE },
      { value: 'X3', label: 'Stock X3 layout', table: X3_PARTITION_TABLE },
      { value: 'KO', label: 'CrossPoint KO fork layout', table: CROSSPOINT_KO_PARTITION_TABLE },
    ],
  },
}

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
  } else if (matchedLayout === 'X4PRO') {
    dot = 'bg-brand-500'
    wrap = 'bg-brand-50 text-brand-700'
    text = 'X4 Pro factory-compatible layout: ready to flash'
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
// Serial monitor
// ---------------------------------------------------------------------------

const MONITOR_MAX_CHARS = 400_000
const MONITOR_BAUD_RATES = [115200, 74880, 230400, 460800, 921600]

function SerialMonitorCard() {
  const [connected, setConnected] = useState(false)
  const [log, setLog] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [error, setError] = useState('')

  const baudRef = useRef(null)
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const activeRef = useRef(false)
  const loopDoneRef = useRef(null)
  const paneRef = useRef(null)

  const append = (text) =>
    setLog((prev) => {
      const next = prev + text
      return next.length > MONITOR_MAX_CHARS ? next.slice(next.length - MONITOR_MAX_CHARS) : next
    })

  useEffect(() => {
    if (autoScroll && paneRef.current) paneRef.current.scrollTop = paneRef.current.scrollHeight
  }, [log, autoScroll])

  async function readLoop(port) {
    const decoder = new TextDecoder()
    while (activeRef.current && port.readable) {
      const reader = port.readable.getReader()
      readerRef.current = reader
      try {
        while (activeRef.current) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) append(decoder.decode(value, { stream: true }))
        }
      } catch (err) {
        if (activeRef.current) append(`\n[serial read error: ${err.message}]\n`)
      } finally {
        try {
          reader.releaseLock()
        } catch {}
        if (readerRef.current === reader) readerRef.current = null
      }
    }
    if (activeRef.current) {
      // The stream ended on its own (USB unplug), not via our disconnect.
      activeRef.current = false
      try {
        await port.close()
      } catch {}
      portRef.current = null
      setConnected(false)
      append('\n[device disconnected]\n')
    }
  }

  async function connect() {
    setError('')
    let port
    try {
      port = await CrossPointFlasher.requestPort(null)
    } catch (err) {
      if (err?.name !== 'NotFoundError') setError(err.message || String(err))
      return
    }
    try {
      await port.open({ baudRate: Number(baudRef.current?.value) || 115200 })
    } catch (err) {
      setError(`Could not open port: ${err.message}`)
      return
    }
    portRef.current = port
    activeRef.current = true
    setConnected(true)
    setLog('')
    loopDoneRef.current = readLoop(port)
  }

  async function disconnect() {
    activeRef.current = false
    try {
      await readerRef.current?.cancel()
    } catch {}
    try {
      await loopDoneRef.current
    } catch {}
    try {
      await portRef.current?.close()
    } catch {}
    portRef.current = null
    setConnected(false)
  }

  async function resetDevice() {
    const port = portRef.current
    if (!port) return
    setError('')
    try {
      // Pulse EN low through RTS (DTR held clear so IO0/GPIO9 stays high) to
      // trigger a normal-boot reset while the monitor stays attached.
      await port.setSignals({ dataTerminalReady: false, requestToSend: true })
      await new Promise((resolve) => setTimeout(resolve, 100))
      await port.setSignals({ dataTerminalReady: false, requestToSend: false })
      append('\n[reset pulse sent]\n')
    } catch (err) {
      setError(`Reset failed: ${err.message}`)
    }
  }

  useEffect(() => {
    return () => {
      activeRef.current = false
      try {
        readerRef.current?.cancel()
      } catch {}
      try {
        portRef.current?.close()
      } catch {}
    }
  }, [])

  return (
    <ToolCard title="Serial monitor">
      <p className="mt-1 text-sm text-stone-600">
        Live console output from a connected device over USB serial. Useful for watching boot logs and firmware{' '}
        <Mono>printf</Mono> output. Disconnect the monitor before using the flashing tools — they need exclusive
        access to the port.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          ref={baudRef}
          defaultValue="115200"
          disabled={connected}
          className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-50"
        >
          {MONITOR_BAUD_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate} baud
            </option>
          ))}
        </select>
        {connected ? (
          <button type="button" onClick={disconnect} className={btnDark}>
            Disconnect
          </button>
        ) : (
          <button type="button" onClick={connect} className={btnPrimary}>
            Connect
          </button>
        )}
        <button type="button" onClick={resetDevice} disabled={!connected} className={btnOutline}>
          Reset device
        </button>
        <button type="button" onClick={() => setLog('')} disabled={!log} className={btnOutline}>
          Clear
        </button>
        <button
          type="button"
          onClick={() => downloadBlob(new TextEncoder().encode(log), 'serial-log.txt')}
          disabled={!log}
          className={btnOutline}
        >
          Download log
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="size-4 rounded border-stone-300 accent-brand-500"
          />
          Auto-scroll
        </label>
      </div>
      {error ? <p className="mt-3 font-mono text-xs text-red-600">{error}</p> : null}
      <div className="mt-4">
        <div className="flex items-center justify-between rounded-t-xl bg-stone-900 px-4 py-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-stone-400">
            <span className={`size-1.5 rounded-full ${connected ? 'bg-brand-500' : 'bg-stone-600'}`} />
            {connected ? 'Connected' : 'Not connected'}
          </span>
          {log ? <span className="font-mono text-xs text-stone-500 tabular-nums">{log.length.toLocaleString()} chars</span> : null}
        </div>
        <pre
          ref={paneRef}
          className="h-80 overflow-auto rounded-b-xl bg-stone-950 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-stone-100"
        >
          {log || (connected ? 'Waiting for output...' : 'Connect a device to start streaming serial output.')}
        </pre>
      </div>
    </ToolCard>
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
  const repairForStock =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('after') === 'stock'
  const [repairDeviceId, setRepairDeviceId] = useState(() => {
    if (typeof window === 'undefined') return 'x4'
    const requested = new URLSearchParams(window.location.search).get('device')
    return DEBUG_DEVICES[requested] ? requested : 'x4'
  })
  const [restoreDeviceId, setRestoreDeviceId] = useState('x4')
  const repairDevice = DEBUG_DEVICES[repairDeviceId]
  const restoreDevice = DEBUG_DEVICES[restoreDeviceId]
  const defaultRepairLayout =
    (repairForStock && repairDevice.layouts.find((layout) => layout.value === 'X3')) || repairDevice.layouts[0]

  const repairLayoutRef = useRef(null)
  const repairBootloaderRef = useRef(null)
  const repairFlashOsRef = useRef(null)
  const repairPreserveNvsRef = useRef(null)
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

  async function withConnectedFlasher(operation, options) {
    const port = await CrossPointFlasher.requestPort()
    const flasher = new CrossPointFlasher(port, options)
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
        X4PRO: { name: 'X4 Pro factory-compatible', table: X4_PRO_PARTITION_TABLE },
        X3: { name: 'Stock X3', table: X3_PARTITION_TABLE },
        KO: { name: 'CrossPoint KO fork', table: CROSSPOINT_KO_PARTITION_TABLE },
      }
      const meta = matchedLayout ? layoutMeta[matchedLayout] : null
      setStatusText('')
      setResult(
        <>
          <div className="mb-3">
            <LayoutBadge matchedLayout={matchedLayout} />
          </div>
          <div className="space-y-3">
            <PartitionTable partitions={partitions} title="On-device partition table" highlight />
            {meta ? <PartitionTable partitions={meta.table} title={`${meta.name} layout`} /> : null}
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
    const flasher = new CrossPointFlasher(port, {
      expectedChip: restoreDevice.chip,
      deviceName: restoreDevice.name,
    })
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
    const layoutKey = repairDevice.layouts.length === 1 ? defaultRepairLayout.value : repairLayoutRef.current?.value
    const table = repairDevice.layouts.find((l) => l.value === layoutKey)?.table
    if (!table) {
      setStatusText(`Unknown layout ${layoutKey} for the ${repairDevice.name}.`, true)
      return
    }
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
    const flasher = new CrossPointFlasher(port, {
      expectedChip: repairDevice.chip,
      deviceName: repairDevice.name,
    })
    try {
      let bootloaderData
      if (bootloaderFile) {
        setStatusText('Reading bootloader file...')
        bootloaderData = new Uint8Array(await bootloaderFile.arrayBuffer())
      } else {
        setStatusText('Downloading bundled bootloader...')
        bootloaderData =
          repairDeviceId === 'x4pro'
            ? await fetchFlashAsset('/firmware/x4pro-bootloader.bin', 'X4 Pro bootloader')
            : await fetchBundledBootloader()
      }
      let firmwareData = null
      if (repairFlashOsRef.current?.checked) {
        setStatusText(repairDeviceId === 'x4pro' ? 'Downloading X4 Pro build...' : 'Downloading CrossPoint firmware...')
        firmwareData =
          repairDeviceId === 'x4pro' ? await fetchDeviceBuildFirmware('x4pro') : await fetchReleaseFirmware()
      }
      const { partitions } = await flasher.repairBootRegion(table, {
        bootloaderData,
        firmwareData,
        preserveNvs: repairPreserveNvsRef.current?.checked ?? true,
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
      setResult(
        <div className="space-y-3">
          <PartitionTable partitions={partitions} title="On-device partition table after repair" highlight />
          {repairForStock ? (
            <div className="flex justify-end">
              <a href="/#flash-tools" className={btnOutline}>
                Return to firmware flasher
              </a>
            </div>
          ) : null}
        </div>
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

        <div className="mt-10 space-y-12">
          <section aria-labelledby="inspect-tools-heading">
            <div className="mb-4">
              <h2 id="inspect-tools-heading" className="font-display text-xl font-semibold tracking-tight text-stone-900">
                Inspect and back up
              </h2>
              <p className="mt-1 max-w-[68ch] text-base text-stone-600 sm:text-sm">
                These tools read the connected device or download files. They do not require a device selection.
              </p>
            </div>
            <div className="space-y-4">
              <ToolCard title="Download firmware">
                <p className="mt-1 text-base text-stone-600 sm:text-sm">
                  Download a firmware <Mono>.bin</Mono> for your device (stable, insider, beta, or stock) to flash
                  manually or copy to an SD card.
                </p>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setDownloadOpen(true)} className={btnOutline}>
                    Download firmware
                  </button>
                </div>
              </ToolCard>

              <ToolCard title="Read partition table">
                <p className="mt-1 text-base text-stone-600 sm:text-sm">
                  Reads the table at <Mono>0x8000</Mono> and automatically identifies known X3, X4, X4 Pro, and KO
                  layouts.
                </p>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={readPartitionTable} disabled={busy} className={btnPrimary}>
                    Connect &amp; read
                  </button>
                </div>
              </ToolCard>

              <ToolCard title="Back up full flash">
                <p className="mt-1 text-base text-stone-600 sm:text-sm">
                  Saves the complete 16 MB flash image as <Mono>flash.bin</Mono>. This can take around 25 minutes.
                </p>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={saveFullFlash} disabled={busy} className={btnOutline}>
                    Save full flash
                  </button>
                </div>
              </ToolCard>

              <ToolCard title="Inspect app partitions">
                <p className="mt-1 text-base text-stone-600 sm:text-sm">
                  Uses the on-device partition table to locate otadata and both application slots.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={readOtadata} disabled={busy} className={btnOutline}>
                    Read otadata partition
                  </button>
                  <button type="button" onClick={() => readAppPartition('app0')} disabled={busy} className={btnOutline}>
                    Read app0 partition
                  </button>
                  <button type="button" onClick={() => readAppPartition('app1')} disabled={busy} className={btnOutline}>
                    Read app1 partition
                  </button>
                  <button type="button" onClick={identifyFirmware} disabled={busy} className={btnOutline}>
                    Identify installed firmware
                  </button>
                </div>
              </ToolCard>

              <SerialMonitorCard />
            </div>
          </section>

          <section id="repair" aria-labelledby="repair-tools-heading" className="scroll-mt-20">
            <div className="mb-4">
              <h2 id="repair-tools-heading" className="font-display text-xl font-semibold tracking-tight text-stone-900">
                Repair a device
              </h2>
              <p className="mt-1 max-w-[68ch] text-base text-stone-600 sm:text-sm">
                Choose the hardware here because repair writes a device-specific bootloader and partition layout.
              </p>
            </div>
            <ToolCard title="Repair partition layout and boot region">
              <p className="mt-1 text-base text-stone-600 sm:text-sm">
                Use this when flashing reports a missing OTA partition or says stock firmware will not fit in an app
                slot. The repair preserves NVS by default, rewrites the boot region, and resets the OTA selector.
              </p>
              {repairForStock ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-base text-amber-800 sm:text-sm">
                  Stock firmware did not fit the current app slot. Repair the layout, then return to the firmware
                  flasher and retry the stock installation.
                </p>
              ) : null}

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="repair-device" className="block text-sm font-semibold text-stone-900">
                    Device to repair
                  </label>
                  <select
                    id="repair-device"
                    name="repair-device"
                    value={repairDeviceId}
                    onChange={(e) => setRepairDeviceId(e.target.value)}
                    disabled={busy}
                    className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-50"
                  >
                    {Object.entries(DEBUG_DEVICES).map(([id, item]) => (
                      <option key={id} value={id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="block text-sm font-semibold text-stone-900">Partition layout</span>
                  {repairDevice.layouts.length === 1 ? (
                    <div className="mt-2 rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200">
                      {defaultRepairLayout.label}
                    </div>
                  ) : (
                    <select
                      key={repairDeviceId}
                      ref={repairLayoutRef}
                      name="repair-layout"
                      aria-label="Partition layout"
                      defaultValue={defaultRepairLayout.value}
                      disabled={busy}
                      className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-50"
                    >
                      {repairDevice.layouts.map((layout) => (
                        <option key={layout.value} value={layout.value}>
                          {layout.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="repair-bootloader" className="block text-sm font-semibold text-stone-900">
                  Custom bootloader <span className="font-normal text-stone-400">(optional)</span>
                </label>
                <input
                  id="repair-bootloader"
                  name="repair-bootloader"
                  ref={repairBootloaderRef}
                  type="file"
                  accept=".bin,application/octet-stream"
                  className={`${inputClass} mt-2 w-full`}
                />
              </div>

              <div className="mt-5 space-y-3">
                <label className="flex items-start gap-2 text-base text-stone-600 sm:text-sm">
                  <input
                    ref={repairFlashOsRef}
                    name="repair-flash-crosspoint"
                    type="checkbox"
                    defaultChecked={!repairForStock}
                    className="mt-0.5 size-4 rounded border-stone-300 accent-brand-500"
                  />
                  <span>
                    {repairDeviceId === 'x4pro'
                      ? 'Flash the current X4 Pro build after repair'
                      : 'Flash the latest stable CrossPoint firmware after repair'}
                  </span>
                </label>
                <label className="flex items-start gap-2 text-base text-stone-600 sm:text-sm">
                  <input
                    ref={repairPreserveNvsRef}
                    name="repair-preserve-nvs"
                    type="checkbox"
                    defaultChecked
                    className="mt-0.5 size-4 rounded border-stone-300 accent-brand-500"
                  />
                  <span>
                    Preserve device settings (NVS)
                    <span className="mt-0.5 block text-xs text-stone-400">
                      Uncheck only if NVS is corrupt and you intentionally want to erase device settings.
                    </span>
                  </span>
                </label>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-stone-400">
                  The connected chip must match {repairDevice.name} ({repairDevice.chip}) before anything is written.
                </p>
                <button type="button" onClick={repairBootRegion} disabled={busy} className={`${btnDark} shrink-0`}>
                  Repair {repairDevice.name}
                </button>
              </div>
            </ToolCard>
          </section>

          <section aria-labelledby="advanced-tools-heading">
            <div className="mb-4">
              <h2 id="advanced-tools-heading" className="font-display text-xl font-semibold tracking-tight text-stone-900">
                Advanced writes
              </h2>
              <p className="mt-1 max-w-[68ch] text-base text-stone-600 sm:text-sm">
                These operations modify existing flash data. Use a backup first when possible.
              </p>
            </div>
            <div className="space-y-4">
              <ToolCard title="Restore full flash">
                <p className="mt-1 text-base text-stone-600 sm:text-sm">
                  Writes a complete 16 MB flash image. Select the target so the connected chip can be checked first.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)_auto]">
                  <select
                    name="restore-device"
                    aria-label="Target device for full flash restore"
                    value={restoreDeviceId}
                    onChange={(e) => setRestoreDeviceId(e.target.value)}
                    disabled={busy}
                    className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 disabled:opacity-50"
                  >
                    {Object.entries(DEBUG_DEVICES).map(([id, item]) => (
                      <option key={id} value={id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={fullFlashFileRef}
                    name="full-flash-image"
                    aria-label="Full flash image"
                    type="file"
                    accept=".bin,application/octet-stream"
                    className={inputClass}
                  />
                  <button type="button" onClick={writeFullFlash} disabled={busy} className={btnDark}>
                    Write full flash
                  </button>
                </div>
              </ToolCard>

              <ToolCard title="Swap boot partition">
                <p className="mt-1 text-base text-stone-600 sm:text-sm">
                  Changes the OTA selector to boot the other app slot. The slot locations are read from the device.
                </p>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={swapBootPartition} disabled={busy} className={btnDark}>
                    Swap boot partitions
                  </button>
                </div>
              </ToolCard>
            </div>
          </section>

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
