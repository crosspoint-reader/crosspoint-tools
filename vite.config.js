import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// Set WEB_ONLY=1 to run the React frontend without the Cloudflare Worker
// backend (no wrangler/Cloudflare login required). Worker-backed API calls
// won't work in this mode, but every page renders. Used by `npm run dev:web`.
const webOnly = process.env.WEB_ONLY === '1'

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(webOnly ? [] : [cloudflare()])],
})
