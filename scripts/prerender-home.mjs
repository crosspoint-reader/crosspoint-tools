// Render the actual homepage at build time so its text and links don't depend on JS.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

const output = process.env.WEB_ONLY === '1' ? 'dist' : 'dist/client'
process.env.WEB_ONLY = '1'
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  ssr: {
    noExternal: ['react-router-dom', 'react-router'],
    resolve: { conditions: ['import', 'module', 'development'] },
  },
})
try {
  const { MemoryRouter } = await server.ssrLoadModule('react-router-dom')
  const { default: HomePage } = await server.ssrLoadModule('/src/pages/HomePage.jsx')
  const { pageHead, sitemapXml, SITE } = await server.ssrLoadModule('/src/lib/seo.ts')
  const markup = renderToString(createElement(MemoryRouter, { initialEntries: ['/'] },
    createElement('div', { className: 'isolate min-h-dvh bg-stone-50 font-sans text-stone-900 antialiased' },
      createElement(HomePage))))
  assert.match(markup, /<h1[^>]*>Read without/)
  assert.match(markup, /href="\/install"/)
  let html = await readFile(`${output}/index.html`, 'utf8')
  assert.ok(html.includes('<div id="root"></div>'))
  html = html.replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`)
  html = html.replace(/<title>[\s\S]*?<\/title>|<meta (?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+|article:[^"]+)"[^>]*>|<link rel="canonical"[^>]*>/g, '')
  html = html.replace('</head>', () => pageHead('/') + '\n</head>')
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1)
  await writeFile(`${output}/index.html`, html)
  await writeFile(`${output}/sitemap.xml`, sitemapXml())
  await writeFile(`${output}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`)
  console.log('Prerendered homepage, metadata, sitemap.xml, and robots.txt')
} finally {
  await server.close()
}
