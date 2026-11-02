// Privacy policy and terms: bundled markdown rendered like a blog post.
import Layout from '../components/Layout.jsx'
import { createMarkdownRenderer } from '../lib/markdown-full.js'
import privacy from './legal/privacy.md?raw'
import terms from './legal/terms.md?raw'
import './docs/docs-prose.css'

const UPDATED = '2026-10-12'
const renderMarkdown = createMarkdownRenderer()
const DOCS = {
  privacy: { title: 'Privacy Policy', html: renderMarkdown(privacy) },
  terms: { title: 'Terms of Service', html: renderMarkdown(terms) },
}

export default function LegalPage({ doc }) {
  const { title, html } = DOCS[doc]
  return (
    <Layout>
      <section className="border-b border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16 lg:px-8">
          <header>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-sm text-stone-500">
              Last updated{' '}
              <time dateTime={UPDATED}>
                {new Date(UPDATED + 'T00:00:00').toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </p>
          </header>
          <article className="docs-prose mt-10" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </section>
    </Layout>
  )
}
