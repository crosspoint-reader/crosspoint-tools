import { Link } from 'react-router-dom'
import { Eyebrow } from '../../components/ui.jsx'

// Headline features of the current major release. Text-only cards: the home
// page's device mockups are real firmware screenshots, and these features
// don't have captures yet.
const HIGHLIGHTS = [
  {
    title: 'Plugins from the SD card',
    body: 'Add book catalogs, downloads, and web-interface tools without reflashing. Plugins use the screens the firmware already provides, so they stay focused on reading.',
    icon: 'M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z',
  },
  {
    title: 'Bluetooth page turners',
    body: 'Pair a remote on any device and map its buttons. Short and long presses can turn pages, jump chapters, open the reader menu, or select clippings.',
    icon: 'm7.5 7.5 9 9-4.5 4.5V3l4.5 4.5-9 9',
  },
  {
    title: 'OPDS 2.0 catalogs',
    body: 'Browse and download from OPDS 2.0 libraries alongside existing 1.x feeds, with custom HTTP headers for servers behind an authentication proxy.',
    icon: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
  },
  {
    title: 'Highlights and clippings',
    body: 'Select text to highlight a passage, save it as a clipping, or look up a multi-word phrase. Clippings can sync through a CrossPoint Sync server.',
    icon: 'm9.53 16.122 9.37-9.37a2.25 2.25 0 1 0-3.182-3.182l-9.37 9.37m3.182 3.182a3 3 0 0 0-1.06 2.122c0 .3-.016.6-.048.893a3.746 3.746 0 0 1-4.121-.536 3.75 3.75 0 0 1-.534-4.12c.293-.033.593-.05.893-.05a3 3 0 0 0 2.122-1.06m3.182 3.182-3.182-3.182',
  },
  {
    title: 'Richer EPUB rendering',
    body: 'Drop caps, small caps, mixed text sizes, borders, shaded blocks, and better tables. GIF images, paragraph indentation, and seven line-spacing steps.',
    icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z',
  },
  {
    title: 'Four new devices',
    body: 'The Metalio E-Ink 4, EEGO A4 and A4 Lite, and BOOX Picco join the lineup. Compare them all on the device comparison page.',
    icon: 'M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3',
    to: '/device-comparison',
  },
]

export default function WhatsNew() {
  return (
    <section className="relative border-t border-stone-200 bg-stone-50 py-20 sm:py-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 paper-grain opacity-[0.04]" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <Eyebrow>new in 2.0</Eyebrow>
        <h2 className="mt-2 max-w-[26ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          The biggest CrossPoint release yet.
        </h2>
        <p className="mt-4 max-w-[56ch] text-base/7 text-pretty text-stone-600">
          A free over-the-air update for every supported reader.{' '}
          <Link
            to="/blog/release-2.0.0"
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            Read the release notes
          </Link>
          .
        </p>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HIGHLIGHTS.map((h) => {
            const card = (
              <>
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-200">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={h.icon} />
                  </svg>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-stone-900">{h.title}</h3>
                <p className="mt-2 text-sm/6 text-pretty text-stone-600">{h.body}</p>
              </>
            )
            return (
              <li key={h.title} className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
                {h.to ? (
                  <Link to={h.to} className="group block">
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
