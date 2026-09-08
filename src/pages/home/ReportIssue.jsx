import { Eyebrow } from '../../components/ui.jsx'
import ReportIssueForm from './ReportIssueForm.jsx'

// Standalone section for the /report-issue page. The homepage "Get in touch"
// toggle uses <ReportIssueForm /> directly instead of this wrapper.
export default function ReportIssue() {
  return (
    <section className="relative scroll-mt-20 overflow-hidden border-t border-stone-200 bg-stone-50 py-16 sm:py-20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 paper-grain opacity-[0.04]" />
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <Eyebrow>report a problem</Eyebrow>
        <h2 className="mx-auto mt-2 max-w-[24ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          Found a bug or have a feature request?
        </h2>
        <p className="mx-auto mt-6 max-w-[52ch] font-serif text-xl/9 text-pretty text-stone-600">
          File it directly on our issue tracker &mdash; <strong className="font-medium text-stone-900">no GitHub account needed</strong>.
          We&rsquo;ll take it from there.
        </p>
        <div className="mt-10">
          <ReportIssueForm />
        </div>
      </div>
    </section>
  )
}
