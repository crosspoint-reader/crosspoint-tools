// Build-time blog metadata generator.
//
// Blog posts are markdown files under `blog/`. Title, summary, and author all
// come from front matter — the author is explicit (name + GitHub handle) rather
// than derived from git, because git authorship is unreliable here: the site is
// deployed manually from whatever machine/branch runs `npm run deploy`, and a
// rebase, squash-merge, or "restore base" commit reassigns a file's add-commit
// to whoever rewrote history. Only the publish date is taken from git (the
// commit that first added the file), and front matter can override even that.
//
// Git history isn't available in the browser bundle, so we resolve the date
// here at build time and emit two artifacts (both gitignored, regenerated each
// build):
//
//   src/pages/blog/meta.generated.json  — { slug: { date, author } }, read by
//                                          the client and merged with the posts
//   public/blog/rss.xml                 — RSS 2.0 feed, served as a static asset
//
// Run before `vite build` / `vite` (see package.json scripts).
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../src/lib/frontmatter.js'

const SITE = 'https://crosspointreader.com'
const DEFAULT_AUTHOR = 'CrossPoint Team'
const FEED_TITLE = 'CrossPoint Reader Blog'
const FEED_DESCRIPTION = 'Updates and announcements from the CrossPoint Reader project.'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const blogDir = join(rootDir, 'blog')
const metaOut = join(rootDir, 'src/pages/blog/meta.generated.json')
const rssOut = join(rootDir, 'public/blog/rss.xml')

// Publish date from the commit that first added `relPath` (ISO). `--follow`
// tracks renames. Returns null for uncommitted files (local preview) or when git
// is unavailable or shallow cloned.
function gitAddDate(relPath) {
  try {
    const out = execSync(
      `git log --follow --format=%aI -- "${relPath}"`,
      { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
    if (!out) return null
    // Oldest (the creation commit) is the last line.
    return out.split(/\r?\n/).filter(Boolean).pop() || null
  } catch {
    return null
  }
}

function gravatar(email) {
  const hash = createHash('md5').update(String(email).trim().toLowerCase()).digest('hex')
  return `https://www.gravatar.com/avatar/${hash}?d=identicon`
}

// Author name + avatar for a post, entirely from front matter (deterministic,
// no network, no git). `github:` maps to the account's avatar; `avatar:` is an
// explicit URL override. Falls back to a Gravatar identicon so an author who
// omits both still gets a stable image.
function resolveAuthor(data) {
  const name = (data.author && String(data.author).trim()) || DEFAULT_AUTHOR
  let avatarUrl
  if (data.avatar) {
    avatarUrl = String(data.avatar).trim()
  } else if (data.github) {
    avatarUrl = `https://github.com/${String(data.github).trim()}.png`
  } else {
    avatarUrl = gravatar(name)
  }
  return { name, avatarUrl }
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function collectPosts() {
  if (!existsSync(blogDir)) return []
  const posts = []
  for (const file of readdirSync(blogDir)) {
    if (!file.endsWith('.md')) continue
    const relPath = `blog/${file}`
    const slug = file.replace(/\.md$/, '')
    const raw = readFileSync(join(blogDir, file), 'utf8')
    const { data } = parseFrontmatter(raw)
    if (data.draft === true) continue

    const date =
      data.date || gitAddDate(relPath) || statSync(join(blogDir, file)).mtime.toISOString()
    const author = resolveAuthor(data)

    posts.push({
      slug,
      title: data.title || slug,
      summary: data.summary || '',
      date,
      author,
    })
  }
  // Newest first.
  posts.sort((a, b) => new Date(b.date) - new Date(a.date))
  return posts
}

function buildRss(posts) {
  const items = posts
    .map(
      (p) => `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${SITE}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${xmlEscape(p.summary)}</description>
    </item>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(FEED_TITLE)}</title>
    <link>${SITE}/blog</link>
    <description>${xmlEscape(FEED_DESCRIPTION)}</description>
    <language>en</language>
    <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

const posts = collectPosts()

const meta = {}
for (const p of posts) meta[p.slug] = { date: p.date, author: p.author }

writeFile(metaOut, JSON.stringify(meta, null, 2) + '\n')
writeFile(rssOut, buildRss(posts))

console.log(`gen-blog-meta: ${posts.length} post(s) → meta.generated.json + rss.xml`)
