import { useState } from 'react'
import { Link } from 'react-router-dom'

const NAV = [
  { name: 'Font Builder', href: '/fonts', route: true },
  { name: 'Docs', href: '/docs', route: true },
  { name: 'Roadmap', href: '/roadmap', route: true },
  { name: 'Get In Touch', href: '/#get-in-touch' },
  { name: 'Have a locked device?', href: '/#unlock-tool' },
]

const FUND_URL = 'https://app.royalty.dev/crosspoint-reader/crosspoint-reader'

function FundButton({ className = '', onClick }) {
  return (
    <a
      href={FUND_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-x-1.5 rounded-md bg-royalty px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-royalty-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royalty ${className}`}
    >
      <img src="/crown.svg" alt="" className="size-4 brightness-0 invert" />
      Fund CrossPoint
    </a>
  )
}

export default function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-stone-50/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5 lg:px-8">
        <Link to="/" aria-label="Homepage" className="flex min-w-0 shrink-0 items-center gap-x-2.5">
          <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md" />
          <span className="font-display text-base font-semibold tracking-tight text-stone-900">
            CrossPoint <span className="text-brand-600">Reader</span>
          </span>
        </Link>

        <div className="hidden items-center gap-x-7 lg:flex">
          {NAV.map((item) => {
            const cls = 'text-sm font-medium text-stone-600 transition hover:text-stone-900'
            return item.route ? (
              <Link key={item.name} to={item.href} className={cls}>
                {item.name}
              </Link>
            ) : (
              <a key={item.name} href={item.href} className={cls}>
                {item.name}
              </a>
            )
          })}
        </div>

        <div className="hidden items-center gap-x-3 lg:flex">
          <FundButton />
        </div>

        <div className="flex items-center gap-x-2 lg:hidden">
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
        <div className="border-t border-stone-200 lg:hidden">
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
