// Shared helpers for the admin dashboard, ported from public/admin.html.

// Parse a response body as JSON without throwing on HTML error pages
// (edge errors, challenges). Returns { ok, status, data, raw }.
export async function readJsonResponse(res) {
  const raw = await res.text()
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    // non-JSON body; leave data null
  }
  return { ok: res.ok, status: res.status, data, raw }
}

export function describeFailure(r) {
  if (r.data && r.data.error) return r.data.error
  return 'HTTP ' + r.status + ' (non-JSON response: ' + r.raw.slice(0, 80).replace(/\s+/g, ' ') + '...)'
}

export function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1)
}

// Shared field styling so every input/textarea in the dashboard matches.
export const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

export const inputClsXs =
  'w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'
