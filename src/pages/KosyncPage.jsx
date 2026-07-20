// KOReader sync account registration. Port of public/kosync.html — same
// /api/kosync/register call, payload, and copy, restyled in the Free-Ink shell.
import { useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'

const DEFAULT_SERVER = 'https://sync.crosspointreader.com'

const inputClass =
  'mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

export default function KosyncPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [server, setServer] = useState(DEFAULT_SERVER)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { msg, ok }
  const [success, setSuccess] = useState(null) // { server, username }

  async function onSubmit(e) {
    e.preventDefault()

    setSuccess(null)
    setStatus(null)

    if (password !== confirm) {
      setStatus({ msg: 'Passwords do not match.', ok: false })
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/kosync/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, server: server.trim() }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.ok) {
        setUsername('')
        setPassword('')
        setConfirm('')
        setServer(data.server || DEFAULT_SERVER)
        setSuccess({ server: data.server, username: data.username })
      } else {
        setStatus({ msg: data.error || 'Registration failed. Please try again.', ok: false })
      }
    } catch {
      setStatus({ msg: 'Something went wrong. Please try again.', ok: false })
    }
    setBusy(false)
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-6">
        <div className="pt-12 pb-16 sm:pt-16">
          <div className="mx-auto max-w-sm">
            <div className="flex flex-col items-center text-center">
              <Eyebrow>Progress Sync</Eyebrow>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance text-stone-900">
                Create a Sync Account
              </h1>
              <p className="mt-3 text-base/7 text-pretty text-stone-600 sm:text-sm/6">
                Register a KOReader-compatible sync account, then sign in on your device to sync
                reading progress across devices.
              </p>
            </div>

            <div className="mt-8 rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-stone-700">
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-stone-700">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-stone-700">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    id="confirm"
                    name="confirm"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="server" className="block text-sm font-medium text-stone-700">
                    Sync server
                  </label>
                  <input
                    type="text"
                    id="server"
                    name="server"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck="false"
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    className={`${inputClass} font-mono text-xs`}
                  />
                  <p className="mt-1.5 text-xs text-stone-400">
                    Leave the default unless you run your own KOReader sync server.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Creating…' : 'Create Account'}
                </button>
              </form>

              {status && (
                <p className={`mt-4 text-sm/6 ${status.ok ? 'text-brand-600' : 'text-red-600'}`}>
                  {status.msg}
                </p>
              )}

              {success && (
                <div className="mt-4 rounded-lg bg-brand-50/60 p-4">
                  <p className="text-sm font-semibold text-brand-700">Account created</p>
                  <p className="mt-1 text-sm/6 text-stone-600">
                    Enter these on your device under{' '}
                    <span className="font-medium text-stone-700">Settings &rarr; Sync</span> to
                    sign in:
                  </p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-stone-400">Server</dt>
                      <dd className="truncate font-mono text-xs text-stone-700">{success.server}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-stone-400">Username</dt>
                      <dd className="truncate font-mono text-xs text-stone-700">{success.username}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-stone-400">
                    Use the same password you just chose. Your password is never stored on this
                    site.
                  </p>
                </div>
              )}
            </div>

            <p className="mt-6 text-center text-xs text-stone-400">
              Uses the open{' '}
              <a
                href="https://github.com/koreader/koreader-sync-server"
                target="_blank"
                rel="noopener"
                className="underline underline-offset-2 hover:text-stone-600"
              >
                KOReader sync
              </a>{' '}
              protocol. This site only relays your registration to the server you choose.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
