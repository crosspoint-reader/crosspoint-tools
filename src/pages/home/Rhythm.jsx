import { Link } from 'react-router-dom'
import { Eyebrow } from '../../components/ui.jsx'
import CommunityStats from './CommunityStats.jsx'

// The full release cycle since 1.0, oldest first. Dates and highlights come
// from the GitHub releases on crosspoint-reader.
const RELEASES = [
  {
    version: '1.0',
    tag: '1.0.0',
    date: 'February 2026',
    blurb: 'The 1.0 milestone: the new Lyra theme and in-firmware over-the-air updates.',
  },
  {
    version: '1.1',
    tag: '1.1.0',
    date: 'February 2026',
    blurb: 'Images in EPUBs, a web-based settings editor, the interface in eight languages, and more Lyra screens.',
  },
  {
    version: '1.2',
    tag: '1.2.0',
    date: 'April 2026',
    blurb: 'Kerning and ligatures, footnote navigation, and an on-device EPUB optimizer.',
  },
  {
    version: '1.3',
    tag: '1.3.0',
    date: 'May 2026',
    blurb: 'Custom fonts, tilt-to-turn page turns, Focus Reading, and an OPDS overhaul with in-catalog search.',
  },
  {
    version: '1.4',
    tag: '1.4.0',
    date: 'June 2026',
    blurb: 'Bookmarks, right-to-left reading, Quick Resume, and live font previews.',
  },
  {
    version: '1.5',
    tag: 'v1.5.0',
    date: 'August 2026',
    blurb: 'A built-in dictionary, faster book opening, what-to-read-next suggestions, and Arabic reading.',
  },
  {
    version: '1.6',
    tag: '1.6.0',
    date: 'September 2026',
    blurb: 'X4 Pro and PaperMono support, Reading Night Mode, transparent sleep screens, and styled dictionary definitions.',
  },
  {
    version: '1.6.5',
    tag: '1.6.5',
    date: 'September 2026',
    blurb: 'A Library for every book on the SD card, TrueType fonts, the Cover Grid home theme, word and character spacing, and X4 Classic support.',
  },
  {
    version: '2.0',
    tag: '2.0.0',
    date: 'November 2026',
    blurb: 'SD card plugins, OPDS 2.0, highlights and clippings, Bluetooth page turners, richer EPUB rendering, and support for the Metalio E-Ink 4, EEGO A4, and BOOX Picco.',
  },
]

function LittleThing({ children }) {
  return <strong className="font-medium text-stone-900">{children}</strong>
}

export default function Rhythm() {
  return (
    <section className="relative overflow-hidden border-t border-stone-200 bg-stone-50 py-20 sm:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 paper-grain opacity-[0.04]" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <Eyebrow>always getting better</Eyebrow>
        <h2 className="mt-2 max-w-[26ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          Updates shaped by readers.
        </h2>
        <p className="mt-4 max-w-[56ch] text-base/7 text-pretty text-stone-600">
          Updates are free, delivered over the air, and planned in the open. Follow along on
          the{' '}
          <Link to="/roadmap" className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
            roadmap
          </Link>
          , or live on the edge with{' '}
          <Link to="/insider" className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
            nightly builds
          </Link>
          .
        </p>

        {/* Release timeline: every release since 1.0, oldest first, running
            down a rail so the whole cycle reads as one continuous journey. */}
        <ol className="relative mt-14 max-w-3xl space-y-9 border-l-2 border-stone-200 pl-8">
          {RELEASES.map((r) => (
            <li key={r.version} className="relative">
              <span
                aria-hidden="true"
                className={`absolute top-1 -left-[41px] size-4 rounded-full border-2 ${
                  r.upcoming ? 'border-dashed border-brand-400 bg-brand-50' : 'border-brand-500/70 bg-white'
                }`}
              />
              <a
                href={`https://github.com/crosspoint-reader/crosspoint-reader/releases/tag/${r.tag}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
              >
                <div className="flex items-baseline gap-x-3">
                  <span className="font-display text-2xl font-semibold text-stone-900 underline decoration-stone-300 underline-offset-4 group-hover:text-brand-700 group-hover:decoration-brand-600">{r.version}</span>
                  <span className={`text-xs tracking-[0.15em] uppercase ${r.upcoming ? 'text-brand-600' : 'text-stone-400'}`}>
                    {r.date}
                  </span>
                </div>
                <p className="mt-1.5 text-sm/6 text-pretty text-stone-600">{r.blurb}</p>
              </a>
              {r.upcoming && (
                <Link
                  to="/insider"
                  className="mt-3 inline-block -rotate-1 font-hand text-lg/6 font-medium text-brand-600 hover:text-brand-700"
                >
                  try it tonight on nightly &rarr;
                </Link>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-16"><CommunityStats /></div>

        {/* The little things, as prose rather than a grid */}
        <div className="mt-16 max-w-3xl border-t border-stone-200 pt-10">
          <h3 className="font-display text-lg font-semibold text-stone-900">There&rsquo;s more where that came from.</h3>
          <p className="mt-4 font-serif text-xl/9 text-pretty text-stone-600">
            <LittleThing>Tilt the device</LittleThing> to turn the page, or pair a{' '}
            <LittleThing>Bluetooth page turner</LittleThing>.{' '}
            <LittleThing>Themes</LittleThing> that restyle the whole
            interface, including a <LittleThing>cover grid</LittleThing> of your recent books.
            A <LittleThing>clock</LittleThing> on the home screen that handles daylight saving
            for you. <LittleThing>Tap and swipe gestures</LittleThing> you can set separately
            for each direction on touch readers. A <LittleThing>web file manager</LittleThing> for your library, right in the
            browser. An <LittleThing>EPUB optimizer</LittleThing> that slims books down before
            they reach the device. A <LittleThing>hotspot mode</LittleThing> for loading books
            anywhere, no home network needed. Every one exists because someone in the community
            wanted it, and then built it.
          </p>
        </div>
      </div>
    </section>
  )
}
