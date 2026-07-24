// Build-time blog metadata generator.
//
// Blog posts are markdown files under `blog/`. Their title/summary come from
// front matter, but the publish date and author are derived from git — the
// commit that first added the file — so authors don't hand-maintain them.
// Git history isn't available in the browser bundle, so we resolve it here at
// build time and emit two artifacts (both gitignored, regenerated each build):
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
const REPO = 'crosspoint-reader/crosspoint-tools' // where blog/*.md live
const DEFAULT_AUTHOR = 'CrossPoint Team'
const FEED_TITLE = 'CrossPoint Reader Blog'
const FEED_DESCRIPTION = 'Updates and announcements from the CrossPoint Reader project.'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const blogDir = join(rootDir, 'blog')
const metaOut = join(rootDir, 'src/pages/blog/meta.generated.json')
const rssOut = join(rootDir, 'public/blog/rss.xml')

// Optional committed map of commit-email → { name?, github }. Resolves avatars
// deterministically (no network), which is the reliable path — a build-time
// GitHub API call can't be counted on (some environments can't verify TLS from
// Node, and unpushed commits 404). Keys are lower-cased emails.
function loadAuthors() {
  const p = join(blogDir, 'authors.json')
  if (!existsSync(p)) return {}
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'))
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]))
  } catch {
    return {}
  }
}
const AUTHORS = loadAuthors()

// Ask git for the commit that added `relPath`: ISO date, author name, email, sha
// (tab-separated). --diff-filter=A limits to the add; --follow tracks renames.
// Returns null for uncommitted files (local preview) or when git is unavailable.
function gitAddCommit(relPath) {
  try {
    const out = execSync(
      `git log --diff-filter=A --follow --format=%aI%x09%an%x09%ae%x09%H -- "${relPath}"`,
      { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
    if (!out) return null
    // Oldest (the add) is the last line if the file was ever re-added.
    const line = out.split(/\r?\n/).filter(Boolean).pop()
    const [date, name, email, sha] = line.split('\t')
    return { date, name, email, sha }
  } catch {
    return null
  }
}

// Resolve the real GitHub avatar for a commit by asking the API which account
// authored that SHA — works for any commit email, as long as the commit is
// pushed to GitHub. No token required (uses GITHUB_TOKEN if present to lift the
// 60 req/hr anonymous limit). Returns null when offline, unpushed, or the email
// isn't linked to a GitHub account.
async function githubCommitAvatar(sha) {
  if (!sha) return null
  try {
    const headers = { 'User-Agent': 'crosspoint-tools-blog', Accept: 'application/vnd.github+json' }
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${sha}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.author?.avatar_url || null // data.author is null if email is unlinked
  } catch {
    return null
  }
}

function gravatar(email) {
  const hash = createHash('md5').update(String(email).trim().toLowerCase()).digest('hex')
  return `https://www.gravatar.com/avatar/${hash}?d=identicon`
}

// Avatar from the commit email alone (no network): a GitHub noreply address
// decodes to a GitHub avatar, otherwise Gravatar (identicon default).
function emailAvatar(email) {
  if (email) {
    const withId = /^(\d+)\+([^@]+)@users\.noreply\.github\.com$/i.exec(email)
    if (withId) return `https://avatars.githubusercontent.com/u/${withId[1]}`
    const legacy = /^([^@]+)@users\.noreply\.github\.com$/i.exec(email)
    if (legacy) return `https://github.com/${legacy[1]}.png`
    return gravatar(email)
  }
  return `https://www.gravatar.com/avatar/?d=identicon`
}

// Author name + avatar for a post. Resolution order, each tier deterministic
// before the network one: front-matter override → committed authors map →
// GitHub API by commit SHA (best-effort) → email/Gravatar.
async function resolveAuthor(data, commit) {
  const mapped = commit?.email ? AUTHORS[commit.email.toLowerCase()] : null
  const name = data.author || mapped?.name || commit?.name || DEFAULT_AUTHOR

  if (data.avatar) return { name, avatarUrl: data.avatar }
  if (mapped?.github) return { name, avatarUrl: `https://github.com/${mapped.github}.png` }
  const apiAvatar = await githubCommitAvatar(commit?.sha)
  return { name, avatarUrl: apiAvatar || emailAvatar(commit?.email) }
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function collectPosts() {
  if (!existsSync(blogDir)) return []
  const posts = []
  for (const file of readdirSync(blogDir)) {
    if (!file.endsWith('.md')) continue
    const relPath = `blog/${file}`
    const slug = file.replace(/\.md$/, '')
    const raw = readFileSync(join(blogDir, file), 'utf8')
    const { data } = parseFrontmatter(raw)
    if (data.draft === true) continue

    const commit = gitAddCommit(relPath)
    const date =
      data.date || commit?.date || statSync(join(blogDir, file)).mtime.toISOString()
    const author = await resolveAuthor(data, commit)

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

const posts = await collectPosts()

const meta = {}
for (const p of posts) meta[p.slug] = { date: p.date, author: p.author }

writeFile(metaOut, JSON.stringify(meta, null, 2) + '\n')
writeFile(rssOut, buildRss(posts))

console.log(`gen-blog-meta: ${posts.length} post(s) → meta.generated.json + rss.xml`)
