// Web Worker host for the .cpfont generator.
//
// Rasterizing a CJK family is tens of thousands of glyphs per size, so it runs
// off the main thread. The worker owns the FreeType wasm instance and the
// bundled fallback downloads; the page only sees log lines and finished files.

import { buildCpfonts } from './build.js'
import { fetchDefaultFallbacks, defaultFallbackNames } from './fallbacks.js'
import { FontBuildError, resolveIntervals } from './intervals.js'

const toBytes = (value) => (value instanceof Uint8Array ? value : new Uint8Array(value))

function mapFallbackFamily(family) {
  if (!family) return null
  const mapped = {}
  for (const [style, bytes] of Object.entries(family)) {
    if (bytes) mapped[style] = toBytes(bytes)
  }
  return Object.keys(mapped).length ? mapped : null
}

self.onmessage = async (event) => {
  const { type, request } = event.data ?? {}
  if (type !== 'build') return

  const log = (line) => self.postMessage({ type: 'log', line })

  try {
    const intervals = resolveIntervals(request.intervals)

    const fallbackNames = defaultFallbackNames(request.intervals)
    self.postMessage({ type: 'phase', phase: 'fallbacks', total: fallbackNames.length })
    const defaultFallbacks = await fetchDefaultFallbacks(fallbackNames, {
      onProgress: ({ name, index, total }) => {
        self.postMessage({ type: 'progress', phase: 'fallbacks', name, index, total })
      },
    })

    self.postMessage({ type: 'phase', phase: 'building', total: request.sizes.length })
    const styles = {}
    for (const [style, bytes] of Object.entries(request.styles)) {
      if (bytes) styles[style] = toBytes(bytes)
    }

    const files = await buildCpfonts({
      family: request.family,
      sizes: request.sizes,
      intervals,
      styles,
      fallbacks: (request.fallbacks ?? []).map(mapFallbackFamily),
      defaultFallbacks,
      forceAutohint: Boolean(request.forceAutohint),
      darkenAa: Boolean(request.darkenAa),
      log: (line) => {
        log(line)
        // Each "Generating <name>" line starts the next size.
        if (line.startsWith('Generating ')) {
          self.postMessage({ type: 'progress', phase: 'building', name: line.slice(11).split(' ')[0] })
        }
      },
    })

    const payload = files.map((file) => ({ name: file.name, data: file.data.buffer }))
    self.postMessage({ type: 'done', files: payload }, payload.map((file) => file.data))
  } catch (error) {
    // FontBuildError messages are written for end users; anything else is a
    // bug or an out-of-memory condition, so keep the raw message for the log.
    self.postMessage({
      type: 'error',
      message: error instanceof FontBuildError
        ? error.message
        : (error?.message || 'Font build failed'),
      fatal: !(error instanceof FontBuildError),
    })
  }
}
