import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui.jsx'
import SerialCapture from './SerialCapture.jsx'

const inputCls =
  'w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// sessionStorage key the /debug serial monitor uses to hand a captured log to
// this form ("Report an issue with this log").
export const SERIAL_HANDOFF_KEY = 'crosspoint-issue-serial-log'

// Keep the in-form log bounded; the server caps the embedded portion further.
const SERIAL_MAX_CHARS = 400_000

// Load the Turnstile script once and resolve when window.turnstile is ready.
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', reject)
      return
    }
    const s = document.createElement('script')
    s.src = TURNSTILE_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export default function ReportIssueForm() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [email, setEmail] = useState('')
  const [type, setType] = useState('')
  const [device, setDevice] = useState('')
  const [topics, setTopics] = useState([])
  const [serialLog, setSerialLog] = useState('')
  const [serialFromDebug, setSerialFromDebug] = useState(false)
  const [showCapture, setShowCapture] = useState(false)
  const [website, setWebsite] = useState('') // honeypot; humans never see it
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { ok, msg, url }
  const [config, setConfig] = useState(null) // { siteKey, action, enabled, types, devices, topics }

  const widgetRef = useRef(null)
  const widgetIdRef = useRef(null)
  const tokenRef = useRef('')

  // Fetch the public config (Turnstile keys + the type/device/topic options the
  // worker accepts). Also pick up any serial log handed over from /debug.
  useEffect(() => {
    fetch('/api/issues/config')
      .then((r) => r.json())
      .then((c) => setConfig(c))
      .catch(() => setConfig({ siteKey: null, enabled: false, types: [], devices: [], topics: [] }))

    try {
      const handoff = sessionStorage.getItem(SERIAL_HANDOFF_KEY)
      if (handoff) {
        setSerialLog(handoff)
        setSerialFromDebug(true)
        setType((t) => t || 'bug') // a captured log almost always accompanies a bug
        sessionStorage.removeItem(SERIAL_HANDOFF_KEY)
      }
    } catch {
      /* sessionStorage unavailable; ignore */
    }
  }, [])

  // Render the Turnstile widget once we have a site key.
  useEffect(() => {
    if (!config?.siteKey || !widgetRef.current) return
    let cancelled = false
    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile || widgetIdRef.current !== null) return
        widgetIdRef.current = window.turnstile.render(widgetRef.current, {
          sitekey: config.siteKey,
          action: config.action || 'report-issue',
          callback: (t) => {
            tokenRef.current = t
          },
          'expired-callback': () => {
            tokenRef.current = ''
          },
          'error-callback': () => {
            tokenRef.current = ''
          },
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [config])

  function toggleTopic(value) {
    setTopics((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  function appendSerial(chunk) {
    setSerialFromDebug(false)
    setSerialLog((prev) => {
      const next = prev + chunk
      return next.length > SERIAL_MAX_CHARS ? next.slice(next.length - SERIAL_MAX_CHARS) : next
    })
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setSerialLog(text)
      setSerialFromDebug(false)
    } catch {
      setStatus({ ok: false, msg: "Couldn't read that file." })
    }
    e.target.value = '' // allow re-selecting the same file
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!type) {
      setStatus({ ok: false, msg: 'Please choose a bug report or feature request.' })
      return
    }
    if (!device) {
      setStatus({ ok: false, msg: 'Please choose your device.' })
      return
    }
    if (config?.siteKey && !tokenRef.current) {
      setStatus({ ok: false, msg: 'Please complete the bot check before submitting.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          email,
          type,
          device,
          topics,
          serialLog,
          website,
          turnstileToken: tokenRef.current,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus({ ok: true, msg: 'Thanks! Your issue was filed.', url: data.url })
        setTitle('')
        setBody('')
        setEmail('')
        setType('')
        setDevice('')
        setTopics([])
        setSerialLog('')
        setSerialFromDebug(false)
        setShowCapture(false)
      } else {
        setStatus({ ok: false, msg: data.error || 'Something went wrong. Please try again.' })
      }
    } catch {
      setStatus({ ok: false, msg: 'Something went wrong. Please try again.' })
    } finally {
      tokenRef.current = ''
      if (window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.reset(widgetIdRef.current)
        } catch {
          /* noop */
        }
      }
      setBusy(false)
    }
  }

  const types = config?.types || []
  const devices = config?.devices || []
  const topicOptions = config?.topics || []

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-4 text-left">
      {/* Type */}
      <fieldset>
        <legend className="text-sm font-medium text-stone-700">What kind of issue is this?</legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {types.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={
                type === t.value
                  ? 'rounded-xl border-2 border-brand-500 bg-brand-50/40 px-4 py-2.5 text-sm font-semibold text-stone-900'
                  : 'rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:border-stone-300'
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Device */}
      <div>
        <label htmlFor="issue-device" className="text-sm font-medium text-stone-700">
          Which device?
        </label>
        <select
          id="issue-device"
          value={device}
          onChange={(e) => setDevice(e.target.value)}
          required
          className={`mt-2 ${inputCls}`}
        >
          <option value="" disabled>
            Select a device…
          </option>
          {devices.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Short summary (e.g. “X4 stuck on boot after flashing”)"
        required
        minLength={5}
        maxLength={200}
        className={inputCls}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What happened? Steps to reproduce, what you expected, your firmware version…"
        required
        minLength={10}
        maxLength={8000}
        rows={7}
        className={`${inputCls} resize-none`}
      />

      {/* Topics */}
      {topicOptions.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-stone-700">
            Related areas <span className="font-normal text-stone-400">(optional)</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {topicOptions.map((t) => {
              const on = topics.includes(t.value)
              return (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => toggleTopic(t.value)}
                  className={
                    on
                      ? 'rounded-full border-2 border-brand-500 bg-brand-50/60 px-3 py-1 text-xs font-semibold text-brand-700'
                      : 'rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:border-stone-300'
                  }
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {/* Serial log */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="issue-serial" className="text-sm font-medium text-stone-700">
            Serial log <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <div className="flex items-center gap-3 text-xs font-medium">
            <button
              type="button"
              onClick={() => setShowCapture((v) => !v)}
              className="text-brand-600 hover:text-brand-700"
            >
              {showCapture ? 'Hide capture' : 'Capture from device'}
            </button>
            <label className="cursor-pointer text-brand-600 hover:text-brand-700">
              Upload .txt/.log
              <input type="file" accept=".txt,.log,text/plain" onChange={onFile} className="hidden" />
            </label>
          </div>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Attach a boot/serial log to help us debug — capture it live from your device over USB, paste it, or upload a file. No need to leave this page.
        </p>
        {showCapture && (
          <div className="mt-2">
            <SerialCapture onData={appendSerial} />
          </div>
        )}
        {serialFromDebug && (
          <p className="mt-2 text-xs text-brand-700">
            Attached the serial log captured on the Debug page ({serialLog.length.toLocaleString()} chars).
          </p>
        )}
        <textarea
          id="issue-serial"
          value={serialLog}
          onChange={(e) => {
            setSerialLog(e.target.value)
            setSerialFromDebug(false)
          }}
          placeholder="Serial/boot output appears here when you capture, or paste it in."
          rows={5}
          className={`mt-2 ${inputCls} resize-none font-mono text-xs`}
        />
        {serialLog && (
          <div className="mt-1 flex items-center justify-between text-xs text-stone-400">
            <span className="font-mono tabular-nums">{serialLog.length.toLocaleString()} chars</span>
            <button
              type="button"
              onClick={() => {
                setSerialLog('')
                setSerialFromDebug(false)
              }}
              className="font-medium hover:text-stone-600"
            >
              Clear log
            </button>
          </div>
        )}
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email (optional — only so we can follow up; never shown publicly)"
        autoComplete="email"
        maxLength={200}
        className={inputCls}
      />
      {/* Honeypot: hidden from humans, filled by bots */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      {config?.siteKey && <div ref={widgetRef} className="mt-1" />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button as="button" type="submit" variant="primary" className="px-5 py-2.5" disabled={busy || config?.enabled === false}>
          {busy ? 'Submitting...' : 'Submit issue'}
        </Button>
        <a
          href="https://github.com/crosspoint-reader/crosspoint-reader/issues"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
        >
          or browse existing issues
        </a>
      </div>
      {config?.enabled === false && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm/6 text-amber-800">
          Issue submission isn&rsquo;t available right now. Please{' '}
          <a href="https://github.com/crosspoint-reader/crosspoint-reader/issues" target="_blank" rel="noreferrer" className="font-medium underline">
            open one on GitHub
          </a>{' '}
          instead.
        </p>
      )}
      {status && (
        <p role="status" className={`rounded-lg px-4 py-3 text-sm/6 ${status.ok ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-800'}`}>
          {status.msg}
          {status.ok && status.url && (
            <>
              {' '}
              <a href={status.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                View it on GitHub
              </a>
              .
            </>
          )}
        </p>
      )}
    </form>
  )
}
