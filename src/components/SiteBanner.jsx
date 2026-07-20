import { useEffect, useState } from 'react'

const LINK_CLASS = 'underline underline-offset-2 text-white hover:text-brand-100'

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Minimal markdown: [label](url) links plus bare https:// URLs.
function renderBannerHtml(text) {
  let html = escapeHtml(text)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
    (_, label, url) => `<a href="${url}" class="${LINK_CLASS}">${label}</a>`)
  html = html.replace(/(^|\s)(https?:\/\/[^\s<]+)/g,
    (_, pre, url) => `${pre}<a href="${url}" class="${LINK_CLASS}">${url}</a>`)
  return html
}

// Site-wide announcement banner, managed from the admin page via /api/banner.
export default function SiteBanner() {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/banner')
      .then((res) => (res.ok ? res.json() : null))
      .then((banner) => {
        if (!cancelled && banner?.enabled && banner?.text) setHtml(renderBannerHtml(banner.text))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!html) return null
  return (
    <div
      className="bg-brand-600 px-6 py-2.5 text-center text-sm font-medium text-white"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
