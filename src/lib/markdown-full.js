// Full markdown rendering pipeline (marked + DOMPurify), shared by the docs
// page and the blog. Extracted from DocsPage so there's a single, sanitized
// rendering path. Each caller gets its own Marked instance via a factory, so
// image-URL rewriting can differ (docs pull images from GitHub raw; blog images
// live under the site's own /public) without stepping on a global config.
import { Marked } from 'marked'
import DOMPurify from 'dompurify'

// Slugify heading text into an id so headings can be deep-linked.
function headingId(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, '') // strip inline HTML tags
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Rewrite a relative image path against the configured base.
//  - "/foo.png"  → base + "/foo.png"
//  - "foo.png"   → base + relativePrefix + "foo.png"
//  - "http(s)://…" / "data:…" are left untouched.
function rewriteImage(src, base, relativePrefix) {
  if (!src) return src
  if (src.startsWith('/')) return base + src
  if (!src.startsWith('http') && !src.startsWith('data:')) return base + relativePrefix + src
  return src
}

// Create a render function: (markdown string) → sanitized HTML string.
export function createMarkdownRenderer({ imageBase = '', imageRelativePrefix = '' } = {}) {
  const marked = new Marked()
  marked.use({
    renderer: {
      heading(token) {
        // Support marked v13+ (token object) and older positional signatures.
        const isObj = typeof token === 'object' && token !== null
        const text = isObj ? token.text : arguments[0]
        const depth = isObj ? token.depth : arguments[1]
        return `<h${depth} id="${headingId(text)}">${text}</h${depth}>`
      },
    },
    walkTokens(token) {
      if (token.type === 'image') {
        token.href = rewriteImage(token.href, imageBase, imageRelativePrefix)
      }
    },
  })

  return function renderMarkdownFull(md) {
    // marked's walkTokens misses raw <img> tags, so rewrite those too.
    const source = String(md).replace(
      /<img([^>]+)src=["']([^"']+)["']/gi,
      (_, before, src) => `<img${before}src="${rewriteImage(src, imageBase, imageRelativePrefix)}"`
    )
    return DOMPurify.sanitize(marked.parse(source), { ADD_ATTR: ['id', 'target'] })
  }
}
