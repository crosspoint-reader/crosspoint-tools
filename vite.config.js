import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

import { defaultFallbackNames, DEFAULT_FALLBACK_FILES } from './src/lib/cpfont/fallbacks.js'

// Set WEB_ONLY=1 to run the React frontend without the Cloudflare Worker
// backend (no wrangler/Cloudflare login required). Most Worker-backed API calls
// won't work in this mode; the pre-built font library is proxied below.
const webOnly = process.env.WEB_ONLY === '1'

// Set NO_BACKEND=1 for a deployment with no Worker at all (the Vercel static
// host). The font builder runs fully in the browser either way; this only tells
// the UI to drop features that need the Worker API, so the page issues zero
// /api/ requests instead of failing ones.
const noBackend = process.env.NO_BACKEND === '1'

const FALLBACK_DIR = path.resolve('scripts/font-builder/default-fallback-fonts')
const FALLBACK_URL_PREFIX = '/font-fallbacks/'

// Serves the bundled fallback fonts the browser font builder downloads on
// demand. They live next to the reference Python generator (which also reads
// them), so instead of a second copy under public/ this emits them straight
// into the client bundle and serves them from disk during dev.
function fontFallbacks() {
  // Every CJK variant, so any coverage selection can be served.
  const names = [...new Set([
    ...DEFAULT_FALLBACK_FILES,
    ...defaultFallbackNames('cjk-jp'),
    ...defaultFallbackNames('cjk-sc'),
    ...defaultFallbackNames('cjk-tc'),
  ])]

  return {
    name: 'crosspoint-font-fallbacks',
    apply: () => true,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(FALLBACK_URL_PREFIX)) return next()
        const name = decodeURIComponent(req.url.slice(FALLBACK_URL_PREFIX.length).split('?')[0])
        if (!names.includes(name)) return next()
        const file = path.join(FALLBACK_DIR, name)
        if (!existsSync(file)) return next()
        res.setHeader('Content-Type', 'font/ttf')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      // Client build only: the Worker bundle has no business carrying 50 MB of
      // fonts, and `this.emitFile` there would try to inline them.
      if (this.environment?.name && this.environment.name !== 'client') return
      for (const name of names) {
        const file = path.join(FALLBACK_DIR, name)
        if (!existsSync(file)) {
          this.warn(`fallback font missing: ${name}`)
          continue
        }
        this.emitFile({
          type: 'asset',
          fileName: `font-fallbacks/${name}`,
          source: readFileSync(file),
        })
      }
    },
  }
}

export default defineConfig({
  define: { __NO_BACKEND__: JSON.stringify(noBackend) },
  // The .cpfont builder runs in a module worker that pulls in the wasm binary
  // as a separate asset, so the worker bundle has to be ES (Vite's default
  // IIFE worker format cannot code-split).
  worker: { format: 'es' },
  plugins: [react(), tailwindcss(), fontFallbacks(), ...(webOnly ? [] : [cloudflare()])],
  server: webOnly
    ? {
        proxy: {
          '/api/prebuilt-fonts': {
            target: 'https://github.com',
            changeOrigin: true,
            followRedirects: true,
            rewrite: (path) =>
              '/crosspoint-reader/crosspoint-fonts/releases/latest/download/' +
              (path.slice('/api/prebuilt-fonts/'.length) || 'fonts.json'),
          },
        },
      }
    : undefined,
})
