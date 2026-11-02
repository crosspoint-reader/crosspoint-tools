// Per-route <head> metadata. Shared by the worker (rewrites index.html so link
// previews and crawlers see it without running JS) and the client (keeps the
// tab title in sync on SPA navigation).
import blogMeta from '../pages/blog/meta.generated.json' with { type: 'json' }

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
  title: 'CrossPoint Reader — Free, Open Source E-Reader Software',
  description:
    'Free, open source software for compact e-readers. Explore supported devices, custom fonts, Bluetooth page turners, and reading sync. Install from your browser.',
  ogTitle: 'Read without limits.',
  ogDescription: 'Your books, on a reader you can make your own. Free, open source e-reader software, built by the people who read on it.',
}

const PAGES: Record<string, PageMeta> = {
  '/': HOME,
  '/install': {
    title: 'Install CrossPoint',
    description: 'Install the latest stable CrossPoint firmware over USB, with step-by-step instructions and help for your reader.',
  },
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
  '/debug': {
    title: 'Advanced Flash Controls',
    description: 'Serial monitor, partition table inspection, and advanced flashing tools for CrossPoint devices.',
  },
  '/insider': {
    title: 'Nightly Builds',
    noindex: true,
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
    title: 'Other Ways to Install CrossPoint',
    description: 'Help installing CrossPoint on Xteink readers with USB flashing disabled, including SD-card and OTA options.',
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
    description: 'Ready-made accessories and 3D-printable designs for CrossPoint readers, including cases, cables, docks, and other gear.',
  },
  '/devices': {
    title: 'Devices',
    description: 'E-readers that run CrossPoint. Pick one up and flash the latest firmware from your browser.',
  },
  '/device-comparison': {
    title: 'Device Comparison',
    description: 'A hands-on comparison of CrossPoint e-readers: screens, buttons, touch, frontlights, and everyday reading with Xteink, Seeed, M5Stack, and EEGORead devices.',
  },
  '/blog': {
    title: 'Blog',
    description: 'Updates and announcements from the CrossPoint Reader project.',
  },
  '/brand': {
    title: 'Brand Kit',
    description: 'Download the CrossPoint Reader logo, icon, and mark as SVG and PNG, plus brand colors and type.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    description: 'What CrossPoint Reader and CrossPoint Sync collect, why, who we share it with, and how to delete it.',
  },
  '/terms': {
    title: 'Terms of Service',
    description: 'The terms for using crosspointreader.com and the hosted CrossPoint Sync service.',
  },
  '/admin': { title: 'Admin', description: 'CrossPoint admin.', noindex: true },
}

type BlogEntry = { title: string; summary: string; date: string }
const posts = blogMeta as Record<string, BlogEntry>

// Full metadata for a pathname, including noindex for unknown pages.
export function pageMeta(pathname: string): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const slug = path.slice('/blog/'.length)
  const post = path.startsWith('/blog/') && Object.hasOwn(posts, slug) ? posts[slug] : undefined
  if (post) {
    return {
      title: post.title + SUFFIX,
      description: post.summary || PAGES['/blog'].description,
      type: 'article',
      published: post.date,
    }
  }
  const page = PAGES[path]
  if (!page) return { title: 'Page not found' + SUFFIX, description: 'This page could not be found.', noindex: true }
  return page === HOME ? HOME : { ...page, title: page.title + SUFFIX }
}


export const OG_IMAGE = SITE + '/og-home.png'
export const OG_ALT = 'CrossPoint Reader: Read without limits. Your books, on a reader you can make your own, alongside the reading and home screens.'

export function canonicalUrl(pathname: string): string {
  return SITE + (pathname === '/' ? '' : pathname.replace(/\/+$/, ''))
}

export function isPage(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return Object.hasOwn(PAGES, path) ||
    (path.startsWith('/blog/') && Object.hasOwn(posts, path.slice(6)))
}

export function sitemapXml(): string {
  const paths = [...Object.keys(PAGES).filter((path) => !PAGES[path].noindex),
    ...Object.keys(posts).map((slug) => '/blog/' + slug)]
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths.map((path) => `<url><loc>${escapeHtml(canonicalUrl(path))}</loc></url>`).join('') + '</urlset>'
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const SEO_SELECTOR = 'title, link[rel="canonical"], meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], meta[property^="article:"], script[data-seo]'

// One head definition for initial HTML, prerendering, and client-side navigation.
export function pageHead(pathname: string): string {
  const meta = pageMeta(pathname)
  const canonical = canonicalUrl(pathname)
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="robots" content="${meta.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}" />`,
  ]
  const social = {
    'og:type': meta.type || 'website',
    'og:site_name': 'CrossPoint Reader',
    'og:locale': 'en_US',
    'og:url': canonical,
    'og:title': meta.ogTitle || meta.title,
    'og:description': meta.ogDescription || meta.description,
    'og:image': OG_IMAGE,
    'og:image:type': 'image/png',
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:alt': OG_ALT,
    'twitter:card': 'summary_large_image',
    'twitter:title': meta.ogTitle || meta.title,
    'twitter:description': meta.ogDescription || meta.description,
    'twitter:image': OG_IMAGE,
    'twitter:image:alt': OG_ALT,
    ...(meta.published ? { 'article:published_time': meta.published } : {}),
  }
  for (const [key, value] of Object.entries(social)) {
    tags.push(`<meta ${key.startsWith('twitter:') ? 'name' : 'property'}="${key}" content="${escapeHtml(value)}" />`)
  }
  if (pathname === '/') {
    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', '@id': SITE + '/#organization', name: 'CrossPoint Reader',
          url: SITE, logo: SITE + '/logo.png', sameAs: ['https://github.com/crosspoint-reader/crosspoint-reader'] },
        { '@type': 'WebSite', '@id': SITE + '/#website', name: 'CrossPoint Reader', url: SITE,
          description: meta.description, publisher: { '@id': SITE + '/#organization' } },
      ],
    }
    tags.push(`<script type="application/ld+json" data-seo>${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`)
  }
  return tags.join('\n')
}
