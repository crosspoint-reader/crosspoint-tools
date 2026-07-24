// Documentation page: sidebar of docs pulled from the CrossPoint Reader repo,
// rendered client-side from raw GitHub markdown with marked + DOMPurify.
// Port of public/docs.html — same data sources, rendering pipeline, deep-link
// hash handling and scroll behavior, restyled in the Free-Ink docs shell.
import { useCallback, useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import { createMarkdownRenderer } from '../lib/markdown-full.js'
import './docs/docs-prose.css'

const RAW_BASE = 'https://raw.githubusercontent.com/crosspoint-reader/crosspoint-reader/master'

// Docs images live in the firmware repo; rewrite relative paths to GitHub raw.
const renderMarkdown = createMarkdownRenderer({
  imageBase: RAW_BASE,
  imageRelativePrefix: '/docs/',
})

const FILES = [
  { name: 'user_guide.md', label: 'User Guide', download_url: `${RAW_BASE}/USER_GUIDE.md` },
  { name: 'scope.md', label: 'Project Scope', download_url: `${RAW_BASE}/SCOPE.md` },
  { name: 'webserver.md', label: 'Webserver Interface', download_url: `${RAW_BASE}/docs/webserver.md` },
  { name: 'webserver-endpoints.md', label: 'Webserver API Endpoints', download_url: `${RAW_BASE}/docs/webserver-endpoints.md` },
  { name: 'troubleshooting.md', label: 'Troubleshooting Guide', download_url: `${RAW_BASE}/docs/troubleshooting.md` },
  { name: 'sd-card-fonts.md', label: 'SD Card Fonts', download_url: `${RAW_BASE}/docs/sd-card-fonts.md` },
  { name: 'focus-reading.md', label: 'Focus Reading Metrics', download_url: `${RAW_BASE}/docs/focus-reading.md` },
]

function toLabel(filename) {
  return filename
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Deep link forms supported: "#contributing" and "#…?doc=contributing".
function getDeepLinkDoc() {
  const hash = window.location.hash // e.g. "#contributing"
  try {
    const match = hash.match(/[?&]doc=([^&]+)/)
    if (match) return decodeURIComponent(match[1])

    if (hash && hash.length > 1 && !hash.includes('?')) {
      return decodeURIComponent(hash.substring(1))
    }
  } catch {
    // Fallback to unencoded strings if decoding fails
    const match = hash.match(/[?&]doc=([^&]+)/)
    if (match) return match[1]
    if (hash && hash.length > 1 && !hash.includes('?')) {
      return hash.substring(1)
    }
  }
  return null
}

function setDeepLink(docName) {
  history.replaceState(null, '', '#' + encodeURIComponent(docName))
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-5 animate-spin rounded-full border-2 border-stone-200 border-t-brand-500"
    />
  )
}

export default function DocsPage() {
  const [activeName, setActiveName] = useState(null)
  const [doc, setDoc] = useState({ status: 'idle', html: '' })
  const articleRef = useRef(null)
  const activeNameRef = useRef(null)
  const requestSeq = useRef(0)

  const loadDoc = useCallback(async (file) => {
    const seq = ++requestSeq.current
    setActiveName(file.name)
    activeNameRef.current = file.name
    setDoc({ status: 'loading', html: '' })
    setDeepLink(file.name.replace(/\.md$/, ''))

    try {
      const res = await fetch(file.download_url)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const md = await res.text()

      const html = renderMarkdown(md)
      if (seq !== requestSeq.current) return
      setDoc({ status: 'ready', html })
    } catch {
      if (seq !== requestSeq.current) return
      setDoc({ status: 'error', html: '' })
    }
  }, [])

  // Initial load (deep-linked doc or the first file) + hash navigation
  // (internal .md links and the back button).
  useEffect(() => {
    const deepDoc = getDeepLinkDoc()
    const target =
      (deepDoc && FILES.find((f) => f.name.replace(/\.md$/, '') === deepDoc)) || FILES[0]
    if (target) loadDoc(target)

    const onHashChange = () => {
      const docName = getDeepLinkDoc()
      if (!docName) return
      const current = activeNameRef.current
      if (current && current.replace(/\.md$/, '') === docName) return // Already viewing
      const file = FILES.find((f) => f.name === docName + '.md')
      if (file) loadDoc(file)
      // Otherwise it's a sub-header hash within the doc; nothing to reload.
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [loadDoc])

  // After a doc renders: honor a pending anchor from a cross-doc link, or
  // scroll the content into view on mobile.
  useEffect(() => {
    if (doc.status !== 'ready') return
    const content = articleRef.current
    const pendingAnchor = window.sessionStorage.getItem('pendingDocAnchor')
    if (pendingAnchor) {
      window.sessionStorage.removeItem('pendingDocAnchor')
      // Wait a tick for the DOM to update
      const t = setTimeout(() => {
        const targetElement = document.getElementById(pendingAnchor)
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else if (content) {
          content.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 50)
      return () => clearTimeout(t)
    }
    if (window.innerWidth < 768 && content) {
      // Scroll to top of content on mobile when a doc is loaded
      content.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [doc])

  // Intercept clicks on links inside the rendered markdown: smooth-scroll
  // in-page anchors, and route links to other .md documents through the hash.
  const onContentClick = useCallback((e) => {
    const a = e.target.closest('a')
    if (!a) return

    const href = a.getAttribute('href')
    if (!href) return

    // Handle in-page anchors
    if (href.startsWith('#')) {
      e.preventDefault()
      const targetElement = document.getElementById(href.substring(1))
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }

    // Handle links to other markdown documents
    if (href.endsWith('.md') || href.includes('.md#')) {
      e.preventDefault()
      let docPath = href
      let anchor = ''
      if (docPath.includes('#')) {
        const parts = docPath.split('#')
        docPath = parts[0]
        anchor = parts[1]
      }

      // Extract just the filename without path
      const parts = docPath.split('/')
      let filename = parts[parts.length - 1]
      filename = filename.replace(/\.md$/, '')

      // Store anchor so we can scroll after the new doc loads
      if (anchor) {
        window.sessionStorage.setItem('pendingDocAnchor', anchor)
      }

      window.location.hash = '#' + filename
    }
  }, [])

  return (
    <Layout>
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12 sm:py-16 lg:px-8">
          <div className="flex flex-col gap-10 md:flex-row md:gap-0">
            {/* Sidebar */}
            <aside className="w-full shrink-0 md:sticky md:top-24 md:w-64 md:self-start md:pr-8">
              <Eyebrow>Documentation</Eyebrow>
              <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900">
                Guides &amp; reference
              </h1>
              <nav aria-label="Documentation" className="mt-6">
                <p className="font-mono text-xs font-medium tracking-wide text-stone-400 uppercase">
                  CrossPoint Reader
                </p>
                <ul className="mt-3 space-y-0.5">
                  {FILES.map((file) => {
                    const isActive = file.name === activeName
                    return (
                      <li key={file.name}>
                        <button
                          type="button"
                          onClick={() => loadDoc(file)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`block w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
                            isActive
                              ? 'bg-brand-500/10 font-medium text-brand-700'
                              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                          }`}
                        >
                          {file.label || toLabel(file.name)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            </aside>

            {/* Content */}
            <article
              ref={articleRef}
              onClick={onContentClick}
              className="docs-prose min-w-0 flex-1 scroll-mt-24 md:border-l md:border-stone-200 md:pl-10"
            >
              {doc.status === 'ready' ? (
                <div dangerouslySetInnerHTML={{ __html: doc.html }} />
              ) : doc.status === 'error' ? (
                <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                  <h3 className="mt-0 font-display text-lg font-semibold text-red-800">
                    Failed to load document
                  </h3>
                  <p className="mt-2 mb-0 text-sm text-red-700">
                    There was an error fetching the content.{' '}
                    <a
                      href="https://github.com/crosspoint-reader/crosspoint-reader/tree/master/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-2 hover:text-red-900"
                    >
                      View it directly on GitHub
                    </a>
                    .
                  </p>
                </div>
              ) : doc.status === 'loading' ? (
                <p className="flex items-center gap-3 text-stone-400">
                  <Spinner /> Loading document…
                </p>
              ) : (
                <p className="text-stone-500">Select a document from the sidebar.</p>
              )}
            </article>
          </div>
        </div>
      </section>
    </Layout>
  )
}
