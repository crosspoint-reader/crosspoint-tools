import { Link } from 'react-router-dom'

const GITHUB = 'https://github.com/crosspoint-reader/crosspoint-reader'

const COLUMNS = [
  {
    title: 'Firmware',
    links: [
      { name: 'Flash from browser', href: '/#flash-tools' },
      { name: 'Stable releases', href: `${GITHUB}/releases` },
      { name: 'Nightly builds', href: '/insider', route: true },
      { name: 'Roadmap', href: '/roadmap', route: true },
    ],
  },
  {
    title: 'Tools',
    links: [
      { name: 'Font Builder', href: '/fonts', route: true },
      { name: 'Advanced flash controls', href: '/debug', route: true },
      { name: 'Unlock Tool', href: '/unlock', route: true },
      { name: 'Register for KoSync', href: '/kosync', route: true },
    ],
  },
  {
    title: 'Project',
    links: [
      { name: 'GitHub', href: GITHUB },
      { name: 'Docs', href: '/docs', route: true },
      { name: 'Fund CrossPoint', href: 'https://app.royalty.dev/crosspoint-reader/crosspoint-reader' },
      { name: 'Get in touch', href: '/contact', route: true },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-100/50">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2">
            <Link to="/" aria-label="Homepage" className="flex items-center gap-x-2.5">
              <img src="/logo.png" alt="" className="size-7 rounded-md" />
              <span className="font-display text-base font-semibold tracking-tight text-stone-900">
                CrossPoint <span className="text-brand-600">Reader</span>
              </span>
            </Link>
            <p className="mt-4 max-w-[34ch] text-sm/6 text-stone-500">
              E-reader software built in the open. Get it for Xteink X3 and X4, reTerminal
              Sticky, M5Paper, LilyGo T5, and more.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold tracking-[0.15em] text-stone-400 uppercase">
                {col.title}
              </h3>
              <ul role="list" className="mt-4 space-y-3">
                {col.links.map((link) => {
                  const cls = 'text-sm font-normal text-stone-600 transition hover:text-stone-900'
                  return (
                    <li key={link.name}>
                      {link.route ? (
                        <Link to={link.href} className={cls}>
                          {link.name}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className={cls}
                        >
                          {link.name}
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-y-4 border-t border-stone-200 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-stone-400">
            CrossPoint Reader is open-source under the MIT license.
          </p>
          <p className="text-xs text-stone-400">
            Built by the community, for the community.
          </p>
        </div>
      </div>
    </footer>
  )
}
