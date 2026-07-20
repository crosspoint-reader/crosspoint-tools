import { Button, Eyebrow } from '../../components/ui.jsx'

export default function GetInTouch() {
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
        <div className="mt-8">
          <Button as="a" href="mailto:hello@crosspointreader.com" variant="primary" className="px-4 py-2.5">
            <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Contact Us
          </Button>
        </div>
      </div>
    </section>
  )
}
