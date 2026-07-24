// Loads blog posts bundled from `blog/*.md`. Bodies + front matter come from
// the markdown at build time via import.meta.glob; date + author come from
// meta.generated.json (produced by scripts/gen-blog-meta.mjs from git history).
// Drafts are filtered out; posts are sorted newest-first.
import { parseFrontmatter } from '../../lib/frontmatter.js'
import generatedMeta from './meta.generated.json'

const modules = import.meta.glob('/blog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function build() {
  const list = []
  for (const [path, raw] of Object.entries(modules)) {
    const slug = path.split('/').pop().replace(/\.md$/, '')
    const { data, content } = parseFrontmatter(raw)
    if (data.draft === true) continue

    const meta = generatedMeta[slug] || {}
    list.push({
      slug,
      title: data.title || slug,
      summary: data.summary || '',
      body: content,
      date: data.date || meta.date || null,
      author: meta.author || { name: data.author || 'CrossPoint Team', avatarUrl: '' },
    })
  }
  list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  return list
}

export const posts = build()

export function getPost(slug) {
  return posts.find((p) => p.slug === slug) || null
}
