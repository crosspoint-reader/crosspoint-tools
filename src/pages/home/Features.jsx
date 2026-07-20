import { Link } from 'react-router-dom'
import { Eyebrow } from '../../components/ui.jsx'

function EinkShot({ src, sizeClass = 'eink-s-55 sm:eink-s-60' }) {
  return (
    <div className={`eink ${sizeClass}`}>
      <div className="eink-device">
        <div className="eink-screen">
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </div>
    </div>
  )
}

// Bold highlight inside the serif prose, matching the "little things" passage.
function Em({ children }) {
  return <strong className="font-medium text-stone-900">{children}</strong>
}

// Editorial story blocks: a headline and one flowing serif paragraph with
// bolded phrases, no checklists.
function Story({ eyebrow, title, children, reversed = false, shot }) {
  return (
    <div
      className={`mt-24 grid items-center gap-12 first:mt-0 lg:gap-16 ${
        reversed ? 'lg:grid-cols-[1fr_1.1fr]' : 'lg:grid-cols-[1.1fr_1fr]'
      }`}
    >
      {reversed && <div className="relative order-last mx-auto lg:order-first">{shot}</div>}
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h3 className="mt-2 max-w-[22ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          {title}
        </h3>
        <p className="mt-6 max-w-[58ch] font-serif text-xl/9 text-pretty text-stone-600">{children}</p>
      </div>
      {!reversed && <div className="relative mx-auto">{shot}</div>}
    </div>
  )
}

export default function Features() {
  return (
    <section className="eink relative border-t border-stone-200 bg-white py-20 sm:py-28">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <Story
          eyebrow="the reading experience"
          title="Typography done properly."
          shot={<EinkShot src="/screenshots/feature-reader.png" />}
        >
          Real <Em>justification</Em> and <Em>hyphenation</Em>. Working{' '}
          <Em>footnote links</Em>, superscripts, and clean section breaks. The text layout you
          expect from a printed book, with <Em>smoother anti-aliasing</Em> and{' '}
          <Em>faster page turns</Em> in every release. And you always <Em>pick up where you left off</Em> when you start
          reading again.
        </Story>

        <Story
          reversed
          eyebrow="make it yours"
          title="Bring your own fonts."
          shot={<EinkShot src="/screenshots/feature-settings-font-selection.png" />}
        >
          Choose the <Em>typeface, size, spacing, and margins</Em> that feel right. The
          built-in library keeps growing because
          contributors keep adding to it: Noto Serif, Domitian, Libre Baskerville,
          OpenDyslexic, and more. And if the one font you can&rsquo;t read without
          isn&rsquo;t there, the{' '}
          <Link to="/fonts" className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
            font builder
          </Link>{' '}
          converts any font you own.
        </Story>

        <Story
          eyebrow="no cables needed"
          title="Books move over WiFi."
          shot={<EinkShot src="/screenshots/feature-transfer.png" />}
        >
          <Em>Drag and drop</Em> books straight from your web browser, no cables or apps. Send
          from{' '}
          <a
            href="https://github.com/crosspoint-reader/calibre-plugins/releases/"
            target="_blank"
            rel="noopener"
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            Calibre
          </a>{' '}
          with the CrossPoint plugin, or browse{' '}
          <a
            href="https://joinmayberry.com"
            target="_blank"
            rel="noopener"
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            OPDS libraries
          </a>{' '}
          right on the device. However you keep your library, someone in the community has
          built a path for it.
        </Story>

        <Story
          reversed
          eyebrow="always in sync"
          title="Never lose your page."
          shot={<EinkShot src="/screenshots/feature-bookmarks.png" />}
        >
          <Em>Quick Resume</Em> shows your page while the device sleeps, and waking drops you
          straight back into the book. <Em>Bookmark</Em> any passage and flip back in a tap.
          Finish a book, and CrossPoint <Em>suggests what to read next</Em> from your library.
          If you read on more than one device, <Em>KOReader sync</Em> keeps them all on the
          same page.
        </Story>

      </div>
    </section>
  )
}
