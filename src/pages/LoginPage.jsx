import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import { fetchBuildMeta } from '../lib/flasher.js'
import { ChangelogList } from './insider/buildShared.jsx'

export default function LoginPage() {
  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [formStatus, setFormStatus] = useState(null) // { ok, text }
  const emailRef = useRef(null)

  const [meta, setMeta] = useState(undefined) // undefined = loading
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchBuildMeta()
      .then((data) => {
        if (!cancelled) setMeta(data || null)
      })
      .catch(() => {
        if (!cancelled) setMeta(null)
      })
    ;(async () => {
      try {
        const res = await fetch('/api/build/summary')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.summary) setSummary(data.summary)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function toggleLogin() {
    setShowLogin((prev) => {
      const next = !prev
      if (next) setTimeout(() => emailRef.current?.focus(), 0)
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setSending(true)
    setFormStatus(null)

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })

      if (res.ok) {
        setFormStatus({ ok: true, text: 'Check your email for a login link.' })
      } else {
        const data = await res.json()
        setFormStatus({ ok: false, text: data.error || 'No subscription found for this email.' })
      }
    } catch {
      setFormStatus({ ok: false, text: 'Something went wrong. Please try again.' })
    }

    setSending(false)
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-6">
        <div className="pt-12 pb-16 sm:pt-16">
          <div className="mx-auto max-w-sm">
            <div className="text-center">
              <Eyebrow className="justify-center">Insider Builds</Eyebrow>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-2xl">
                Nightly &amp; Custom Builds
              </h1>
              <p className="mt-3 text-base/7 text-pretty text-stone-600 sm:text-sm/6">
                Subscribe for as low as{' '}
                <span className="font-semibold text-stone-700">$2/month</span> for nightly builds
                and custom font firmware
              </p>
            </div>

            <div className="mt-8 space-y-4">
              <a
                href="https://app.royalty.dev/SoFriendly/crosspoint-tools/release"
                className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-royalty px-5 py-3 text-sm font-semibold text-white no-underline shadow-sm hover:bg-royalty-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royalty"
              >
                <img src="/crown.svg" alt="" className="size-5 brightness-0 invert" />
                Subscribe on Royalty.dev
              </a>

              <div className="text-center">
                <button
                  type="button"
                  onClick={toggleLogin}
                  className="text-sm text-stone-400 underline underline-offset-2 hover:text-stone-600"
                >
                  Already a subscriber?
                </button>
              </div>
            </div>

            {/* Magic link form (hidden by default) */}
            {showLogin && (
              <div className="mt-6">
                <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
                  <p className="text-sm/6 text-stone-600">
                    Enter the email you subscribed with and we'll send you a login link.
                  </p>
                  <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                    <input
                      ref={emailRef}
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sending}
                      className="flex w-full items-center justify-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? 'Sending...' : 'Send Login Link'}
                    </button>
                  </form>
                  {formStatus && (
                    <p
                      className={`mt-3 text-center text-sm/6 ${formStatus.ok ? 'text-brand-600' : 'text-red-600'}`}
                    >
                      {formStatus.text}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Changelog */}
          <div className="mt-10">
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-900">
                  What's in the latest nightly
                </h2>
                <span className="font-mono text-xs text-stone-400 tabular-nums">
                  {meta?.changelog?.length
                    ? `${meta.changelog.length} commit${meta.changelog.length !== 1 ? 's' : ''}`
                    : ''}
                </span>
              </div>
              {summary && (
                <div className="mt-3 rounded-lg bg-brand-50/60 px-4 py-3 text-sm/6 text-stone-700">
                  {summary}
                </div>
              )}
              <p className="mt-3 text-xs text-stone-400">Commits since the last tagged release</p>
              <ChangelogList
                changelog={meta === undefined ? null : meta?.changelog}
                emptyText={meta === undefined ? 'Loading...' : 'No changelog available'}
                className="max-h-72"
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
