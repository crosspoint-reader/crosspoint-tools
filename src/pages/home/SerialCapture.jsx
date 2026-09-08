import { useEffect, useRef, useState } from 'react'
import { CrossPointFlasher } from '../../lib/flasher.js'

// Compact, embeddable serial monitor. Streams USB serial output and pushes each
// decoded chunk to the parent via onData(chunk); the parent owns the log text
// (so paste/upload and live capture share one field). Mirrors the connect/read/
// reset logic in DebugPage's SerialMonitorCard, minus the standalone log pane.

const btnBase =
  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2'
const btnPrimary = `${btnBase} bg-brand-500 text-white hover:bg-brand-600 focus-visible:outline-brand-500`
const btnDark = `${btnBase} bg-stone-900 text-white hover:bg-stone-700 focus-visible:outline-stone-900`
const btnOutline = `${btnBase} bg-white text-stone-700 ring-1 ring-stone-950/10 hover:bg-stone-50 disabled:opacity-50`

export default function SerialCapture({ onData, onConnectedChange }) {
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  const portRef = useRef(null)
  const readerRef = useRef(null)
  const activeRef = useRef(false)
  const loopDoneRef = useRef(null)

  const setConn = (v) => {
    setConnected(v)
    onConnectedChange?.(v)
  }

  // Tear down on unmount so a stream doesn't outlive the form.
  useEffect(() => {
    return () => {
      activeRef.current = false
      try {
        readerRef.current?.cancel()
      } catch {
        /* noop */
      }
      try {
        portRef.current?.close()
      } catch {
        /* noop */
      }
    }
  }, [])

  async function readLoop(port) {
    const decoder = new TextDecoder()
    while (activeRef.current && port.readable) {
      const reader = port.readable.getReader()
      readerRef.current = reader
      try {
        while (activeRef.current) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) onData?.(decoder.decode(value, { stream: true }))
        }
      } catch (err) {
        if (activeRef.current) onData?.(`\n[serial read error: ${err.message}]\n`)
      } finally {
        try {
          reader.releaseLock()
        } catch {
          /* noop */
        }
        if (readerRef.current === reader) readerRef.current = null
      }
    }
    if (activeRef.current) {
      // Stream ended on its own (USB unplug), not via our disconnect.
      activeRef.current = false
      try {
        await port.close()
      } catch {
        /* noop */
      }
      portRef.current = null
      setConn(false)
      onData?.('\n[device disconnected]\n')
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
      await port.open({ baudRate: 115200 })
    } catch (err) {
      setError(`Could not open port: ${err.message}`)
      return
    }
    portRef.current = port
    activeRef.current = true
    setConn(true)
    loopDoneRef.current = readLoop(port)
  }

  async function disconnect() {
    activeRef.current = false
    try {
      await readerRef.current?.cancel()
    } catch {
      /* noop */
    }
    try {
      await loopDoneRef.current
    } catch {
      /* noop */
    }
    try {
      await portRef.current?.close()
    } catch {
      /* noop */
    }
    portRef.current = null
    setConn(false)
  }

  async function resetDevice() {
    const port = portRef.current
    if (!port) return
    setError('')
    try {
      // Pulse EN low via RTS (DTR clear so IO0 stays high) for a normal-boot
      // reset while the monitor stays attached — captures the boot log.
      await port.setSignals({ dataTerminalReady: false, requestToSend: true })
      await new Promise((resolve) => setTimeout(resolve, 100))
      await port.setSignals({ dataTerminalReady: false, requestToSend: false })
      onData?.('\n[reset pulse sent]\n')
    } catch (err) {
      setError(`Reset failed: ${err.message}`)
    }
  }

  if (!supported) {
    return (
      <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-500">
        Live capture needs a Chromium browser (Chrome/Edge) with Web Serial. You can still paste or upload a log above.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <button type="button" onClick={disconnect} className={btnDark}>
            Disconnect
          </button>
        ) : (
          <button type="button" onClick={connect} className={btnPrimary}>
            Connect device
          </button>
        )}
        <button type="button" onClick={resetDevice} disabled={!connected} className={btnOutline}>
          Reset device
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-stone-500">
          <span className={`size-1.5 rounded-full ${connected ? 'bg-brand-500' : 'bg-stone-300'}`} />
          {connected ? 'Streaming — output appears above' : 'Not connected'}
        </span>
      </div>
      {error ? <p className="mt-2 font-mono text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
