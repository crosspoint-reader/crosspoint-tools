import { useState } from 'react'
import { Eyebrow } from '../../components/ui.jsx'
import CollaborateForm from './CollaborateForm.jsx'
import ReportIssueForm from './ReportIssueForm.jsx'

const TABS = [
  {
    id: 'collaborate',
    label: 'Collaborate With Us',
    eyebrow: 'say hello',
    heading: 'Interested in collaborating with us?',
    intro: (
      <>
        Whether you&rsquo;re interested in{' '}
        <strong className="font-medium text-stone-900">partnering, sponsorship, or custom development</strong>, we&rsquo;d
        love to hear from you. Reach out and let&rsquo;s build something together.
      </>
    ),
  },
  {
    id: 'report',
    label: 'Report An Issue',
    eyebrow: 'report a problem',
    heading: 'Found a bug or have a feature request?',
    intro: (
      <>
        File it directly on our issue tracker &mdash;{' '}
        <strong className="font-medium text-stone-900">no GitHub account needed</strong>. Attach a live serial log right
        from this page and we&rsquo;ll take it from there.
      </>
    ),
  },
]

export default function GetInTouch() {
  const [tab, setTab] = useState('collaborate')
  const active = TABS.find((t) => t.id === tab) || TABS[0]

  return (
    <section id="get-in-touch" className="relative scroll-mt-20 overflow-hidden border-t border-stone-200 bg-stone-50 py-16 sm:py-20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 paper-grain opacity-[0.04]" />
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <Eyebrow>{active.eyebrow}</Eyebrow>
        <h2 className="mx-auto mt-2 max-w-[24ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          {active.heading}
        </h2>
        <p className="mx-auto mt-6 max-w-[52ch] font-serif text-xl/9 text-pretty text-stone-600">{active.intro}</p>

        {/* Toggle */}
        <div className="mx-auto mt-8 inline-flex rounded-full border border-stone-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={
                tab === t.id
                  ? 'rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition'
                  : 'rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition hover:text-stone-900'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-10">
          {tab === 'collaborate' ? <CollaborateForm /> : <ReportIssueForm />}
        </div>
      </div>
    </section>
  )
}
