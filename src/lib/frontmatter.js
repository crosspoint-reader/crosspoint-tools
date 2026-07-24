// Minimal front-matter parser for a leading `---` fenced block of simple
// `key: value` pairs. Deliberately dependency-free so it runs both in the
// browser bundle and in the Node build script (scripts/gen-blog-meta.mjs).
// Values are strings, with `true`/`false` coerced to booleans and surrounding
// quotes stripped — enough for the blog's title/summary/date/author/draft keys.
// Returns { data, content }.
export function parseFrontmatter(raw) {
  const text = String(raw).replace(/^﻿/, '') // strip a leading BOM
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { data: {}, content: text }

  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    } else if (value === 'true') {
      value = true
    } else if (value === 'false') {
      value = false
    }
    data[key] = value
  }

  return { data, content: text.slice(match[0].length) }
}
