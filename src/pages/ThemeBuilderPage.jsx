// SD Theme Builder. The interactive editor is powered by the vanilla-JS engine
// in src/lib/theme-builder.js, which queries this markup by element id / data
// attribute — keep those intact. This component only renders the (restyled)
// chrome and hands the DOM to the engine after mount.
import { useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import { initThemeBuilder } from '../lib/theme-builder.js'

function Code({ children }) {
  return (
    <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-xs text-stone-700">
      {children}
    </code>
  )
}

export default function ThemeBuilderPage() {
  useEffect(() => {
    document.title = 'Theme Builder - CrossPoint Reader'
    // Engine guards against double init (React StrictMode runs effects twice).
    initThemeBuilder()
  }, [])

  return (
    <Layout>
      {/* Page header */}
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
          <Eyebrow>Tools</Eyebrow>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            SD Theme Builder
          </h1>
          <p className="mt-3 max-w-2xl text-sm/6 text-stone-600">
            Visually build a CrossPoint SD theme and preview it on a simulated device screen.
            Exports a firmware-compatible <Code>theme.json</Code> (schema 1, inherits{' '}
            <Code>lyra</Code>) using the new <Code>screens</Code> layout + widget system.
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:px-8">
        {/* LEFT: editor */}
        <div className="order-2 lg:order-1">
          {/* Start row */}
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-950/5">
            <div>
              <label
                htmlFor="presetSelect"
                className="block font-mono text-xs font-medium tracking-wide text-stone-500 uppercase"
              >
                Start from preset
              </label>
              <select
                id="presetSelect"
                className="mt-1.5 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
              ></select>
            </div>
            <button
              id="loadPresetBtn"
              type="button"
              className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              Load preset
            </button>
            <div className="ml-auto">
              <label
                htmlFor="importInput"
                className="cursor-pointer rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 shadow-sm ring-1 ring-stone-950/10 transition hover:bg-stone-50 hover:text-stone-900"
              >
                Import theme.json&hellip;
              </label>
              <input id="importInput" type="file" accept=".json,application/json" className="hidden" />
            </div>
          </div>

          {/* Engine-rendered controls */}
          <div id="controls" className="rounded-2xl bg-white px-4 py-2 ring-1 ring-stone-950/5"></div>
        </div>

        {/* RIGHT: preview + output */}
        <div className="order-1 space-y-4 lg:order-2">
          {/* Device mockup */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-950/5">
            <div className="mb-3 flex items-center justify-between">
              <div className="inline-flex rounded-lg bg-stone-100 p-0.5 font-mono text-xs font-medium">
                <button type="button" data-device="x3" className="rounded-md bg-brand-600 px-3 py-1 text-white">
                  X3
                </button>
                <button type="button" data-device="x4" className="rounded-md px-3 py-1 text-stone-600">
                  X4
                </button>
              </div>
              <div className="inline-flex flex-wrap gap-1 text-xs font-medium">
                <button type="button" data-surface="home" className="rounded-md bg-stone-900 px-2.5 py-1 text-white">
                  Home
                </button>
                <button
                  type="button"
                  data-surface="fileBrowser"
                  className="rounded-md px-2.5 py-1 text-stone-600 hover:bg-stone-100"
                >
                  Files
                </button>
                <button
                  type="button"
                  data-surface="recentBooks"
                  className="rounded-md px-2.5 py-1 text-stone-600 hover:bg-stone-100"
                >
                  Recent
                </button>
                <button
                  type="button"
                  data-surface="settings"
                  className="rounded-md px-2.5 py-1 text-stone-600 hover:bg-stone-100"
                >
                  Settings
                </button>
                <button
                  type="button"
                  data-surface="reader"
                  className="rounded-md px-2.5 py-1 text-stone-600 hover:bg-stone-100"
                >
                  Reader
                </button>
              </div>
            </div>

            {/* the device bezel */}
            <div className="mx-auto w-fit rounded-[28px] bg-stone-800 p-3 shadow-lg">
              <div className="overflow-hidden rounded-[14px] bg-white ring-1 ring-black/10">
                <canvas
                  id="deviceCanvas"
                  width="480"
                  height="800"
                  className="block"
                  style={{ imageRendering: 'pixelated' }}
                ></canvas>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-stone-500">
              <button
                id="selPrev"
                type="button"
                className="rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-stone-950/10 transition hover:bg-stone-50"
              >
                &lsaquo; Prev
              </button>
              <span className="font-mono tracking-wide uppercase">simulated selection</span>
              <button
                id="selNext"
                type="button"
                className="rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-stone-950/10 transition hover:bg-stone-50"
              >
                Next &rsaquo;
              </button>
            </div>
          </div>

          {/* Validation */}
          <div id="validation" className="rounded-2xl bg-white p-4 text-xs ring-1 ring-stone-950/5"></div>

          {/* Export */}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-950/5">
            <div className="flex flex-wrap gap-2">
              <button
                id="downloadZipBtn"
                type="button"
                className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Download package (.zip)
              </button>
              <button
                id="downloadJsonBtn"
                type="button"
                className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 shadow-sm ring-1 ring-stone-950/10 transition hover:bg-stone-50 hover:text-stone-900"
              >
                Download theme.json
              </button>
              <button
                id="copyJsonBtn"
                type="button"
                className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 shadow-sm ring-1 ring-stone-950/10 transition hover:bg-stone-50 hover:text-stone-900"
              >
                Copy JSON
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-stone-600">
              <input
                id="writeAll"
                type="checkbox"
                className="size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
              />
              Write all metric fields (not just changes)
            </label>
            <p className="mt-2 text-[11px] text-stone-400">
              Icon BMPs are generated by the official CrossPoint Python script in CI (see{' '}
              <span className="font-medium">Icon Assets</span>). Build them first to include{' '}
              <code className="font-mono">icons/*.bmp</code> in the package; otherwise the zip
              contains <code className="font-mono">theme.json</code> only.
            </p>
          </div>

          {/* JSON output */}
          <details className="rounded-2xl bg-white p-4 ring-1 ring-stone-950/5">
            <summary className="cursor-pointer font-mono text-xs font-medium tracking-wide text-stone-700 uppercase">
              theme.json preview
            </summary>
            <pre
              id="jsonOutput"
              className="mt-3 max-h-96 overflow-auto rounded-lg bg-stone-900 p-3 font-mono text-[11px] leading-relaxed text-stone-100"
            ></pre>
          </details>
        </div>
      </div>
    </Layout>
  )
}
