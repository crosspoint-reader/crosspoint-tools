import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// Set WEB_ONLY=1 to run the React frontend without the Cloudflare Worker
// backend (no wrangler/Cloudflare login required). Most Worker-backed API calls
// won't work in this mode; the pre-built font library is proxied below.
const webOnly = process.env.WEB_ONLY === '1'

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(webOnly ? [] : [cloudflare()])],
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
