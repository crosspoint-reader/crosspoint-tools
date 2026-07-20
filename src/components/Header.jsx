import { useState } from 'react'
import { Link } from 'react-router-dom'

// Each item carries a short label (md–xl viewports) and a full one (xl+).
const NAV = [
  { name: 'Font Builder', short: 'Fonts', href: '/fonts', route: true },
  { name: 'Docs', short: 'Docs', href: '/docs', route: true },
  { name: 'Roadmap', short: 'Roadmap', href: '/roadmap', route: true },
  { name: 'Get In Touch', short: 'Contact', href: '/contact', route: true },
  { name: 'Have a locked device?', short: 'Locked?', href: '/unlock', route: true },
]

const FUND_URL = 'https://app.royalty.dev/crosspoint-reader/crosspoint-reader'

function NavLabel({ item }) {
  return (
    <>
      <span className="xl:hidden">{item.short}</span>
      <span className="hidden xl:inline">{item.name}</span>
    </>
  )
}

function FundButton({ className = '', compact = false, onClick }) {
  return (
    <a
      href={FUND_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-x-1.5 rounded-md bg-royalty px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition hover:bg-royalty-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royalty ${className}`}
    >
      <img src="/crown.svg" alt="" className="size-4 brightness-0 invert" />
      {compact ? (
        <>
          <span className="lg:hidden">Fund</span>
          <span className="hidden lg:inline">Fund CrossPoint</span>
        </>
      ) : (
        'Fund CrossPoint'
      )}
    </a>
  )
}

export default function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-stone-50/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-x-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link to="/" aria-label="Homepage" className="flex min-w-0 shrink-0 items-center gap-x-2.5">
          <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md" />
          <span className="font-display text-base font-semibold tracking-tight whitespace-nowrap text-stone-900">
            CrossPoint <span className="text-brand-600">Reader</span>
          </span>
        </Link>

        {/* Nav links: short labels from md, full labels from xl */}
        <div className="hidden min-w-0 items-center gap-x-4 md:flex lg:gap-x-6 xl:gap-x-7">
          {NAV.map((item) => {
            const cls =
              'text-sm font-medium whitespace-nowrap text-stone-600 transition hover:text-stone-900'
            return item.route ? (
              <Link key={item.name} to={item.href} className={cls}>
                <NavLabel item={item} />
              </Link>
            ) : (
              <a key={item.name} href={item.href} className={cls}>
                <NavLabel item={item} />
              </a>
            )
          })}
        </div>

        <div className="hidden shrink-0 items-center md:flex">
          <FundButton compact />
        </div>

        <div className="flex items-center gap-x-2 md:hidden">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            className="inline-flex size-9 items-center justify-center rounded-md text-stone-700 ring-1 ring-stone-300"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-5" aria-hidden="true">
              {open ? <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-stone-200 md:hidden">
          <div className="space-y-1 px-4 py-4">
            <FundButton className="mb-3 flex w-full" onClick={() => setOpen(false)} />
            {NAV.map((item) => {
              const cls =
                'block rounded-md px-3 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-100'
              return item.route ? (
                <Link key={item.name} to={item.href} onClick={() => setOpen(false)} className={cls}>
                  {item.name}
                </Link>
              ) : (
                <a key={item.name} href={item.href} onClick={() => setOpen(false)} className={cls}>
                  {item.name}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </header>
  )
}
