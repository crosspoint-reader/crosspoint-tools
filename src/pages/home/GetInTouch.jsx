import { useState } from 'react'
import { Button, Eyebrow } from '../../components/ui.jsx'

const inputCls =
  'w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

export default function GetInTouch() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot; humans never see it
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { ok, msg }

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, website }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus({ ok: true, msg: "Message sent. We'll get back to you soon." })
        setName('')
        setEmail('')
        setMessage('')
      } else {
        setStatus({ ok: false, msg: data.error || 'Something went wrong. Please try again.' })
      }
    } catch {
      setStatus({ ok: false, msg: 'Something went wrong. Please try again.' })
    }
    setBusy(false)
  }

  return (
    <section id="get-in-touch" className="relative scroll-mt-20 overflow-hidden border-t border-stone-200 bg-stone-50 py-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 paper-grain opacity-[0.04]"
      />
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <Eyebrow>say hello</Eyebrow>
        <h2 className="mx-auto mt-2 max-w-[24ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          Interested in collaborating with us?
        </h2>
        <p className="mx-auto mt-6 max-w-[52ch] font-serif text-xl/9 text-pretty text-stone-600">
          Whether you&rsquo;re interested in{' '}
          <strong className="font-medium text-stone-900">partnering, sponsorship, or custom
          development</strong>, we&rsquo;d love to hear from you. Reach out and let&rsquo;s
          build something together.
        </p>

        <form onSubmit={onSubmit} className="mx-auto mt-10 max-w-xl space-y-3 text-left">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              required
              maxLength={100}
              className={inputCls}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              autoComplete="email"
              required
              maxLength={200}
              className={inputCls}
            />
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's on your mind?"
            required
            minLength={10}
            maxLength={5000}
            rows={5}
            className={`${inputCls} resize-none`}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button as="button" type="submit" variant="primary" className="px-5 py-2.5" disabled={busy}>
              {busy ? 'Sending...' : 'Send Message'}
            </Button>
            <a
              href="mailto:hello@crosspointreader.com"
              className="text-sm font-medium text-stone-500 underline underline-offset-4 hover:text-stone-700"
            >
              or email us directly
            </a>
          </div>
          {status && (
            <p
              role="status"
              className={`rounded-lg px-4 py-3 text-sm/6 ${
                status.ok ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-800'
              }`}
            >
              {status.msg}
            </p>
          )}
        </form>
      </div>
    </section>
  )
}
