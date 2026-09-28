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
          <Em>faster page turns</Em> in every release. You always <Em>pick up where you left off</Em> when you start
          reading again.
        </Story>

        <Story
          reversed
          eyebrow="your whole shelf"
          title="Find any book in seconds."
          shot={<EinkShot src="/screenshots/feature-library.png" />}
        >
          The <Em>Library</Em> shows every book on the SD card, not just the ones you&rsquo;ve
          opened. Sort by <Em>Recent</Em>, <Em>Title</Em>, or <Em>Author</Em>, with whatever
          you&rsquo;re reading kept at the top. <Em>Search</Em> matches titles and authors
          together, so it doesn&rsquo;t matter which folder a book is hiding in.
        </Story>

        <Story
          eyebrow="make it yours"
          title="Bring your own fonts."
          shot={<EinkShot src="/screenshots/feature-settings-font-selection.png" />}
        >
          Choose the <Em>typeface, size, margins, and line, word, and letter spacing</Em> that feel right, from
          fonts like Noto Serif, Domitian, Libre Baskerville, and OpenDyslexic. If the one font you can&rsquo;t read without
          isn&rsquo;t there, the{' '}
          <Link to="/fonts" className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
            font builder
          </Link>{' '}
          converts any font you own. On readers with external RAM, just drop a{' '}
          <Em>TrueType font</Em> onto the SD card and pick it from the menu.
        </Story>

        <Story
          reversed
          eyebrow="hola · ciao · hallo"
          title="Reads your language."
          shot={
            // Stacked frames: Focus Reading behind, RTL (Hebrew) in front
            <div className="relative" style={{ width: '360px', maxWidth: '100%', height: '520px' }}>
              <div className="eink eink-s-50 absolute top-1 left-0" style={{ transform: 'rotate(-5deg)' }}>
                <div className="eink-device">
                  <div className="eink-screen">
                    <img src="/screenshots/feature-focus-reading.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
                  </div>
                </div>
              </div>
              <div className="eink eink-s-55 absolute right-0 bottom-0" style={{ transform: 'rotate(4deg)', zIndex: 2 }}>
                <div className="eink-device">
                  <div className="eink-screen">
                    <img src="/screenshots/feature-rtl.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
                  </div>
                </div>
              </div>
            </div>
          }
        >
          The community has translated CrossPoint into <Em>nearly thirty languages</Em>, from
          Spanish and German to Hebrew, Ukrainian, and Vietnamese. The reader lays out{' '}
          <Em>right-to-left text</Em> properly and{' '}
          <Em>hyphenates each language by its own rules</Em>. There&rsquo;s even{' '}
          <Em>Focus Reading</Em> for readers who like a guided pace. If your language is
          missing, a translation is one of the easiest ways to contribute.
          <span className="mt-3 block font-sans text-sm/6 text-stone-400">
            Indic scripts aren&rsquo;t supported yet.
          </span>
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
          with the CrossPoint plugin, or browse OPDS libraries right on the device. However you keep your library, someone in the community has
          built a path for it.
        </Story>

        <Story
          reversed
          eyebrow="always in sync"
          title="Never lose your page."
          shot={<EinkShot src="/screenshots/feature-bookmarks.png" />}
        >
          <Em>Quick Resume</Em> shows your page while the device sleeps, and waking drops you
          straight back into the book. <Em>Bookmark</Em> any passage, give it a name, and flip back in a tap.
          Finish a book, and CrossPoint{' '}
          <Em>suggests what to read next</Em>.
          If you read on more than one device, <Em>KOReader sync</Em> keeps them all on the
          same page.
        </Story>

        <Story
          eyebrow="look it up anywhere"
          title="Look up words offline"
          shot={
            <div className="relative z-10">
              <EinkShot src="/screenshots/feature-dictionary.png" />
            </div>
          }
        >
          Look up words without leaving your book or connecting to the internet.{' '}
          <Em>Bring your own dictionary</Em> in the StarDict format, then follow the{' '}
          <a
            href="https://crosspointreader.com/docs#dictionary"
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            dictionary guide
          </a>{' '}
          to add it to CrossPoint.
        </Story>

      </div>
    </section>
  )
}
