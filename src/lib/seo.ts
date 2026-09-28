// Per-route <head> metadata. Shared by the worker (rewrites index.html so link
// previews and crawlers see it without running JS) and the client (keeps the
// tab title in sync on SPA navigation).
import blogMeta from '../pages/blog/meta.generated.json'

export const SITE = 'https://crosspointreader.com'
const SUFFIX = ' - CrossPoint Reader'

export type PageMeta = {
  title: string
  description: string
  type?: 'website' | 'article'
  published?: string
  noindex?: boolean
  // Social-card copy, when it should differ from the <title>/description.
  ogTitle?: string
  ogDescription?: string
}

const HOME: PageMeta = {
  title: 'CrossPoint Reader - Open Source E-Reader Software for ESP32',
  description:
    'CrossPoint is open source e-reader software for ESP32 e-ink devices. Get it for the Xteink, reTerminal Sticky, M5Paper, LilyGo T5, and more.',
  ogTitle: 'Read without limits.',
  ogDescription: 'Open source e-reader software for ESP32 e-ink devices, built by the community.',
}

const PAGES: Record<string, PageMeta> = {
  '/': HOME,
  '/docs': {
    title: 'Docs',
    description: 'Guides and reference for installing, using, and customizing CrossPoint Reader on your e-ink device.',
  },
  '/roadmap': {
    title: 'Roadmap & Scope',
    description: "How CrossPoint is evolving, what we're focused on, and where we're intentionally drawing the line.",
  },
  '/fonts': {
    title: 'Font Downloader & Builder',
    description: 'Download ready-made font families for CrossPoint, or convert your own TrueType and OpenType fonts in the browser.',
  },
  '/theme-builder': {
    title: 'SD Theme Builder',
    description: 'Visually build a CrossPoint SD theme and preview it on a simulated device screen.',
  },
  '/debug': {
    title: 'Advanced Flash Controls',
    description: 'Serial monitor, partition table inspection, and advanced flashing tools for CrossPoint devices.',
  },
  '/insider': {
    title: 'Nightly Builds',
    description: 'The latest nightly CrossPoint firmware, compiled from master, with a summary of what changed.',
  },
  '/login': {
    title: 'Nightly & Custom Builds',
    description: 'Get nightly and custom CrossPoint firmware builds.',
    noindex: true,
  },
  '/kosync': {
    title: 'Create a Sync Account',
    description: 'Register a KOReader-compatible sync account and keep your reading progress in sync across devices.',
  },
  '/unlocker': {
    title: 'OTA Xteink Unlocker',
    description: "Unlock Xteink devices that won't take an SD card flash, over the air, so you can install CrossPoint.",
  },
  '/unlock': {
    title: 'Have a Locked Device?',
    description: 'Some Xteink devices, including most from AliExpress, ship locked. Here is how to unlock yours and install CrossPoint.',
  },
  '/contact': {
    title: 'Get in Touch',
    description: 'Contact the CrossPoint Reader team about partnerships, press, hardware, or anything else.',
  },
  '/report-issue': {
    title: 'Report an Issue',
    description: 'Report a CrossPoint bug or request a feature. No GitHub account needed.',
  },
  '/accessories': {
    title: 'Accessories',
    description: 'Recommended cases, cables, storage, and other gear that pairs well with CrossPoint readers.',
  },
  '/devices': {
    title: 'Devices',
    description: 'E-readers that run CrossPoint. Pick one up and flash the latest firmware from your browser.',
  },
  '/blog': {
    title: 'Blog',
    description: 'Updates and announcements from the CrossPoint Reader project.',
  },
  '/brand': {
    title: 'Brand Kit',
    description: 'Download the CrossPoint Reader logo, icon, and mark as SVG and PNG, plus brand colors and type.',
  },
  '/admin': { title: 'Admin', description: 'CrossPoint admin.', noindex: true },
}

type BlogEntry = { title: string; summary: string; date: string }
const posts = blogMeta as Record<string, BlogEntry>

// Full metadata for a pathname; unknown paths fall back to the homepage.
export function pageMeta(pathname: string): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const post = path.startsWith('/blog/') ? posts[path.slice('/blog/'.length)] : undefined
  if (post) {
    return {
      title: post.title + SUFFIX,
      description: post.summary || PAGES['/blog'].description,
      type: 'article',
      published: post.date,
    }
  }
  const page = PAGES[path]
  if (!page) return HOME
  return page === HOME ? HOME : { ...page, title: page.title + SUFFIX }
}
