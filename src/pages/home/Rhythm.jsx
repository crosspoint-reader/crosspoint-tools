import { Link } from 'react-router-dom'
import { Eyebrow } from '../../components/ui.jsx'

const RELEASES = [
  {
    version: '1.3',
    date: 'May 2026',
    blurb: 'Custom fonts, tilt-to-turn page turns, Focus Reading, and an OPDS overhaul with in-catalog search.',
  },
  {
    version: '1.4',
    date: 'June 2026',
    blurb: 'Bookmarks, right-to-left reading, Quick Resume, and live font previews.',
  },
  {
    version: '1.5',
    date: 'In the works',
    upcoming: true,
    blurb: 'A built-in dictionary, faster book opening, what-to-read-next suggestions, and Arabic reading.',
  },
]

const STATS = [
  ['200+', 'contributors around the world'],
  ['1,200+', 'community forks built on CrossPoint'],
  ['152', 'changes in the last major release'],
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
          A new release every month.
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

        {/* Release timeline */}
        <ol className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3 lg:gap-8">
          {RELEASES.map((r) => (
            <li key={r.version} className={`border-t-2 pt-5 ${r.upcoming ? 'border-dashed border-brand-300' : 'border-brand-500/70'}`}>
              <div className="flex items-baseline gap-x-3">
                <span className="font-display text-2xl font-semibold text-stone-900">{r.version}</span>
                <span className={`text-xs tracking-[0.15em] uppercase ${r.upcoming ? 'text-brand-600' : 'text-stone-400'}`}>
                  {r.date}
                </span>
              </div>
              <p className="mt-2.5 text-sm/6 text-pretty text-stone-600">{r.blurb}</p>
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

        {/* Community stats */}
        <dl className="mt-16 grid grid-cols-1 gap-8 border-t border-stone-200 pt-10 sm:grid-cols-3">
          {STATS.map(([num, label]) => (
            <div key={label}>
              <dt className="sr-only">{label}</dt>
              <dd className="font-display text-5xl font-semibold tracking-tight text-stone-900">{num}</dd>
              <dd className="mt-1 text-sm text-stone-500">{label}</dd>
            </div>
          ))}
        </dl>

        {/* The little things, as prose rather than a grid */}
        <div className="mt-16 max-w-3xl border-t border-stone-200 pt-10">
          <h3 className="font-display text-lg font-semibold text-stone-900">And there&rsquo;s more where that came from.</h3>
          <p className="mt-4 font-serif text-xl/9 text-pretty text-stone-600">
            <LittleThing>Tilt the device</LittleThing> to turn the page.{' '}
            <LittleThing>Themes</LittleThing> that restyle the whole
            interface. A <LittleThing>web file manager</LittleThing> for your library, right in the
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
