import { Link } from 'react-router-dom'

function CheckIcon() {
  return (
    <svg className="mt-0.5 size-4 shrink-0 text-brand-500" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CheckList({ items }) {
  return (
    <ul role="list" className="mt-6 space-y-3 text-sm/6 text-stone-600">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <CheckIcon />
          {item}
        </li>
      ))}
    </ul>
  )
}

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

// "Made for…" story blocks, reMarkable-style: one benefit per screen,
// told in reader language. Feature details live in the checklist.
function Story({ title, children, items, reversed = false, shot }) {
  return (
    <div
      className={`mt-24 grid items-center gap-12 first:mt-0 lg:gap-16 ${
        reversed ? 'lg:grid-cols-[1fr_1.1fr]' : 'lg:grid-cols-[1.1fr_1fr]'
      }`}
    >
      {reversed && <div className="relative order-last mx-auto lg:order-first">{shot}</div>}
      <div>
        <h3 className="max-w-[22ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          {title}
        </h3>
        <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">{children}</p>
        {items && <CheckList items={items} />}
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
          title="Typography done properly."
          shot={<EinkShot src="/screenshots/feature-reader.png" />}
          items={[
            'Justified text with proper hyphenation, footnotes, and clean section breaks',
            'Superscripts, subscripts, and images that never block your page turn',
            'Your place is remembered across sleep, restarts, and battery swaps',
          ]}
        >
          Real justification, hyphenation, footnotes, indents, and section breaks. The text
          layout you expect from a printed book, and a rendering engine the community keeps
          making faster.
        </Story>

        <Story
          reversed
          title="Bring your own fonts."
          shot={<EinkShot src="/screenshots/feature-settings-font-selection.png" />}
          items={[
            'A growing built-in library: Noto Serif, Domitian, Libre Baskerville, OpenDyslexic, and more',
            'Live preview pane shows each font before you commit',
            <>
              Add any font you own with the{' '}
              <Link to="/fonts" className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
                font builder
              </Link>
            </>,
          ]}
        >
          Choose the typeface, size, spacing, and margins that feel right to you, with a live
          preview before you commit. The built-in library keeps growing because contributors
          keep adding to it.
        </Story>

        <Story
          title="Books move over WiFi."
          shot={<EinkShot src="/screenshots/feature-transfer.png" />}
          items={[
            'Drag and drop books straight from your web browser, no cables or apps',
            'Send from Calibre with the CrossPoint plugin, or browse OPDS libraries on-device',
            'Reading progress syncs across devices with KOReader sync',
          ]}
        >
          Upload from any browser, send from Calibre, or browse OPDS catalogues right on the
          device. However you keep your library, someone in the community has built a path
          for it.
        </Story>

        <Story
          reversed
          title="Pick up where you left off."
          shot={<EinkShot src="/screenshots/feature-bookmarks.png" />}
          items={[
            'Quick Resume shows your page while asleep and wakes straight back into the book',
            'Bookmark any passage and flip back to it in a tap',
            'Finish a book, and CrossPoint suggests what to read next from your library',
          ]}
        >
          CrossPoint remembers your page, your bookmarks, and your progress across sleep and
          restarts. If you read on more than one device, KOReader sync keeps them all on the
          same page.
        </Story>

      </div>
    </section>
  )
}
