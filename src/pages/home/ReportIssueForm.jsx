import { useEffect, useState } from 'react'
import { Button } from '../../components/ui.jsx'

const inputCls =
  'w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

// sessionStorage key the /debug serial monitor uses to hand a captured log to
// this form ("Report an issue with this log").
export const SERIAL_HANDOFF_KEY = 'crosspoint-issue-serial-log'

// Template chooser (blank issues are disabled on the repo).
const GITHUB_NEW_ISSUE_URL = 'https://github.com/crosspoint-reader/crosspoint-reader/issues/new/choose'

// Search existing issues first, then send people to GitHub to file. Anonymous
// on-site submission is disabled.
export default function ReportIssueForm() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [serialLog, setSerialLog] = useState('')
  const [copied, setCopied] = useState(false)
  const [matches, setMatches] = useState([]) // [{ number, title, url, state, stateReason }]
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // Pick up a serial log handed over from /debug so the user can copy it into GitHub.
  useEffect(() => {
    try {
      const handoff = sessionStorage.getItem(SERIAL_HANDOFF_KEY)
      if (handoff) {
        setSerialLog(handoff)
        sessionStorage.removeItem(SERIAL_HANDOFF_KEY)
      }
    } catch {
      /* sessionStorage unavailable; ignore */
    }
  }, [])

  // Debounced semantic duplicate search as the user describes the problem.
  useEffect(() => {
    const t = title.trim()
    const b = body.trim()
    if (t.length < 5 || b.length < 10) {
      setMatches([])
      setSearched(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/issues/similar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: t, body: b }),
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled) setMatches(Array.isArray(data.matches) ? data.matches : [])
      } catch {
        if (!cancelled) setMatches([])
      } finally {
        if (!cancelled) {
          setLoading(false)
          setSearched(true)
        }
      }
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [title, body])

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(serialLog)
      setCopied(true)
    } catch {
      /* clipboard blocked; the textarea is still selectable */
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 text-left">
      <p className="text-sm text-stone-600">
        First, describe the problem so we can check whether it&rsquo;s already been reported.
      </p>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Short summary (e.g. “X4 stuck on boot after flashing”)"
        maxLength={200}
        className={inputCls}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What happened? Steps to reproduce, what you expected…"
        maxLength={8000}
        rows={5}
        className={`${inputCls} resize-none`}
      />

      {(loading || matches.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="text-sm font-semibold text-amber-900">
            {loading && matches.length === 0 ? 'Checking for similar issues…' : 'Similar existing issues'}
          </div>
          {matches.length > 0 && (
            <p className="mt-1 text-xs text-amber-800">
              {matches.some((m) => m.state === 'closed')
                ? 'This might have already been fixed. Read this first.'
                : 'These look related. Adding a comment to an existing issue helps us more than a duplicate.'}
            </p>
          )}
          <div className="mt-2 space-y-2">
            {matches.map((m) => {
              const badge =
                m.state === 'closed'
                  ? m.stateReason === 'completed'
                    ? { text: 'Resolved', cls: 'bg-green-100 text-green-800' }
                    : { text: 'Closed', cls: 'bg-stone-200 text-stone-700' }
                  : null
              return (
                <a
                  key={m.number}
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-amber-200 bg-stone-50 p-2.5 text-sm font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  {badge && (
                    <span className={`mr-1.5 rounded px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}>
                      {badge.text}
                    </span>
                  )}
                  #{m.number} {m.title}
                </a>
              )
            })}
          </div>
        </div>
      )}

      {serialLog && (
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-700">Serial log from the Debug page</span>
            <button type="button" onClick={copyLog} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              {copied ? 'Copied!' : 'Copy log'}
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-500">Paste this into your GitHub issue.</p>
          <textarea readOnly value={serialLog} rows={4} className={`mt-2 ${inputCls} resize-none font-mono text-xs`} />
        </div>
      )}

      {searched && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
          <p className="text-sm text-stone-600">
            {matches.length > 0 ? 'Not the same problem?' : 'No similar issues found.'} File it on GitHub (free account required).
          </p>
          <Button as="a" href={GITHUB_NEW_ISSUE_URL} target="_blank" rel="noreferrer" variant="primary" className="px-5 py-2.5">
            Open a new issue on GitHub →
          </Button>
        </div>
      )}
    </div>
  )
}
