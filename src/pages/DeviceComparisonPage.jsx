import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import { createMarkdownRenderer } from '../lib/markdown-full.js'
import comparison from './device-comparison.md?raw'
import './docs/docs-prose.css'
import './device-comparison.css'

const renderMarkdown = createMarkdownRenderer()
const SECTIONS = [
  ['Xteink', 'xteink-devices'],
  ['Seeed', 'seeed-devices'],
  ['M5Stack', 'm5stack-devices'],
  ['LilyGo', 'lilygo-devices'],
  ['EEGORead', 'eegoread-devices'],
  ['Metalio', 'metalio-devices'],
]

export default function DeviceComparisonPage() {
  useEffect(() => {
    // The shared scroll manager may run before this lazy route has loaded.
    if (window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
    }
  }, [])

  return (
    <Layout>
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16 lg:px-8">
          <header className="mx-auto max-w-3xl">
            <Eyebrow>Find your next reader</Eyebrow>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              CrossPoint Device Comparison
            </h1>
            <p className="mt-4 text-lg/8 text-stone-600">
              Find the CrossPoint reader that’s right for you
            </p>
          </header>

          <img
            src="/device-comparison/hero.webp"
            alt="Seven CrossPoint e-readers arranged on a table between stacks of books"
            width="1600"
            height="739"
            fetchPriority="high"
            className="mt-8 w-full rounded-2xl border border-stone-200"
          />

          <div className="mx-auto mt-10 max-w-3xl">
            <nav aria-label="Device comparison sections" className="flex flex-wrap gap-2 border-b border-stone-200 pb-6">
              {SECTIONS.map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  {label}
                </a>
              ))}
            </nav>

            <article className="docs-prose mt-8" dangerouslySetInnerHTML={{ __html: renderMarkdown(comparison) }} />

            <Link to="/devices" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
              Shop CrossPoint devices <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  )
}
