// Minimal, safe markdown subset (ported from the old inline homepage script):
// escape first, then apply patterns over the escaped string. Supports
// [text](url), **bold**, *italic*, `code`, bare URLs, and newline -> <br>.

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(url) {
  const trimmed = url.trim()
  if (/^(https?:\/\/|\/|#|mailto:)/i.test(trimmed)) return trimmed
  return '#'
}

export function renderMarkdown(str, linkClass) {
  const cls = linkClass || 'font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700'
  let html = escapeHtml(str)
  // [text](url): text and url are already escaped; sanitize url scheme.
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) =>
    '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener" class="' + cls + '">' + text + '</a>'
  )
  // `code`
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em]">$1</code>')
  // **bold**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // *italic* (avoid matching inside already-substituted tags by requiring word-ish boundaries)
  html = html.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  // Bare URLs that aren't already inside an href="..." attribute.
  html = html.replace(
    /(^|[\s(>])(https?:\/\/[^\s<]+[^\s<.,;:!?)'"\]])/g,
    '$1<a href="$2" target="_blank" rel="noopener" class="' + cls + '">$2</a>'
  )
  // Newlines → <br>
  html = html.replace(/\n/g, '<br>')
  return html
}
