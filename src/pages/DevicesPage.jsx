import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'
import { ProductCard, useShopItems } from './shop/ShopGridPage.jsx'
import { specFor } from './shop/deviceSpecs.js'

// --- Filter model -----------------------------------------------------------
// "Any of" groups: a device matches if it has at least one checked option.
// Features: a device must have every checked feature.
const inches = (n) => `${n}"`
const GROUPS = [
  {
    key: 'screen',
    label: 'Screen Size',
    options: () => [
      { value: 'lt4', label: 'Under 4"' },
      { value: 'gte4', label: '4" and Larger' },
    ],
    test: (s, v) => s.screen != null && (v === 'lt4' ? s.screen < 4 : s.screen >= 4),
  },
  {
    key: 'connector',
    label: 'Connector',
    options: () => [
      { value: 'usb-c', label: 'USB-C' },
      { value: 'pogo', label: 'Pogo Pins' },
    ],
    test: (s, v) => s.connectors?.includes(v),
  },
  {
    key: 'ram',
    label: 'External RAM',
    options: () => [
      { value: 'yes', label: 'With PSRAM' },
      { value: 'no', label: 'Without PSRAM' },
    ],
    test: (s, v) => s.psram != null && (v === 'yes' ? s.psram > 0 : s.psram === 0),
  },
]

const FEATURES = [
  { value: 'frontlight', label: 'Frontlight', test: (s) => s.frontlight && s.frontlight !== 'none' },
  { value: 'warm', label: 'Warm/Cool Frontlight', test: (s) => s.frontlight === 'warm-cool' },
  { value: 'touch', label: 'Touchscreen', test: (s) => !!s.touch },
  { value: 'front', label: 'Front Buttons', test: (s) => !!s.frontButtons },
  { value: 'side', label: 'Side Buttons', test: (s) => !!s.sideButtons },
  { value: 'home', label: 'Home Button', test: (s) => !!s.homeButton },
  { value: 'gyro', label: 'Gyro / Tilt Page Turn', test: (s) => !!s.gyro },
  { value: 'rtc', label: 'Real-Time Clock', test: (s) => !!s.rtc },
]

const SORTS = [
  { value: '', label: 'Featured' },
  { value: 'screen-desc', label: 'Screen: Largest First', key: (s) => -(s.screen ?? -Infinity) },
  { value: 'screen-asc', label: 'Screen: Smallest First', key: (s) => s.screen ?? Infinity },
  { value: 'ppi', label: 'Sharpest (PPI)', key: (s) => -(s.ppi ?? -Infinity) },
  { value: 'battery', label: 'Biggest Battery', key: (s) => -(s.battery ?? -Infinity) },
  { value: 'price', label: 'Price: Low to High', key: (s) => s.price ?? Infinity },
  { value: 'weight', label: 'Lightest', key: (s) => s.weight ?? Infinity },
  { value: 'name', label: 'Name A–Z' },
]

const FILTER_KEYS = [...GROUPS.map((g) => g.key), 'f']

function readSelected(params) {
  const sel = {}
  for (const k of FILTER_KEYS) sel[k] = (params.get(k) || '').split(',').filter(Boolean)
  return sel
}

// `skip` leaves one group out, for "how many would match if I ticked this" counts.
function matches(spec, sel, skip) {
  if (!spec) return false
  for (const g of GROUPS) {
    if (g.key === skip || !sel[g.key].length) continue
    if (!sel[g.key].some((v) => g.test(spec, v))) return false
  }
  if (skip !== 'f') {
    for (const v of sel.f) if (!FEATURES.find((x) => x.value === v)?.test(spec)) return false
  }
  return true
}

// --- UI ---------------------------------------------------------------------
function Checkbox({ label, count, checked, onChange }) {
  const disabled = !checked && count === 0
  return (
    <label className={`flex items-center gap-2.5 py-1 text-sm ${disabled ? 'text-stone-300' : 'text-stone-700'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 rounded border-stone-300 text-brand-600 accent-brand-600 focus-visible:outline-brand-500"
      />
      <span className="flex-1">{label}</span>
      <span className="text-xs text-stone-400 tabular-nums">{count}</span>
    </label>
  )
}

function FilterGroup({ label, children }) {
  return (
    <div className="border-t border-stone-200 py-4 first:border-t-0 first:pt-0">
      <fieldset>
        <legend className="mb-1 text-xs font-semibold tracking-[0.12em] text-stone-400 uppercase">{label}</legend>
        {children}
      </fieldset>
    </div>
  )
}

function SpecChips({ spec }) {
  if (!spec) return null
  const chips = [
    spec.screen && inches(spec.screen),
    spec.resolution && `${spec.resolution[0]}×${spec.resolution[1]}`,
    spec.frontlight === 'warm-cool' ? 'Warm/Cool Light' : spec.frontlight === 'white' ? 'Frontlight' : null,
    spec.touch && 'Touch',
    spec.gyro && 'Gyro',
    spec.rtc && 'RTC',
  ].filter(Boolean)
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <li key={c} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
          {c}
        </li>
      ))}
    </ul>
  )
}

// null in the spec table means unknown, which is different from "doesn't have it".
const yes = (v) => (v == null ? '?' : v ? '✓' : '—')
const COLUMNS = [
  ['Screen', (s) => (s.screen ? inches(s.screen) : '—')],
  ['Resolution', (s) => (s.resolution ? `${s.resolution[0]}×${s.resolution[1]}` : '—')],
  ['PPI', (s) => s.ppi ?? '?'],
  ['Frontlight', (s) => ({ 'warm-cool': 'Warm/Cool', white: 'White', none: '—' })[s.frontlight] ?? '?'],
  ['Touch', (s) => yes(s.touch)],
  ['Gyro', (s) => yes(s.gyro)],
  ['RTC', (s) => yes(s.rtc)],
  ['Front Buttons', (s) => yes(s.frontButtons)],
  ['Side Buttons', (s) => yes(s.sideButtons)],
  ['Home Button', (s) => yes(s.homeButton)],
  ['Connector', (s) => s.connectors?.map((c) => (c === 'usb-c' ? 'USB-C' : 'Pogo')).join(' + ') || '?'],
  ['Battery', (s) => (s.battery ? `${s.battery.toLocaleString()} mAh` : '?')],
  ['Weight', (s) => (s.weight ? `${s.weight} g` : '?')],
  ['Price', (s) => (s.price ? `$${Math.round(s.price)}` : '?')],
  ['Chip', (s) => s.mcu ?? '?'],
  ['PSRAM', (s) => (s.psram == null ? '?' : s.psram ? `${s.psram} MB` : '—')],
]

function CompareTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-950/5">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-200 text-xs text-stone-500">
          <tr>
            <th scope="col" className="sticky left-0 bg-white px-4 py-3 font-semibold">Device</th>
            {COLUMNS.map(([h]) => (
              <th key={h} scope="col" className="px-3 py-3 font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map(({ item, spec }) => (
            <tr key={item.id}>
              <th scope="row" className="sticky left-0 bg-white px-4 py-3 font-semibold whitespace-nowrap text-stone-900">
                {item.link ? (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </th>
              {COLUMNS.map(([h, fmt]) => (
                <td key={h} className="px-3 py-3 whitespace-nowrap text-stone-600 tabular-nums">
                  {spec ? fmt(spec) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DevicesPage() {
  const items = useShopItems('device')
  const [params, setParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const sel = readSelected(params)
  const sort = params.get('sort') || ''
  const view = params.get('view') === 'table' ? 'table' : 'grid'

  const rows = useMemo(() => (items || []).map((item) => ({ item, spec: specFor(item) })), [items])
  const specs = rows.map((r) => r.spec).filter(Boolean)
  const activeCount = FILTER_KEYS.reduce((n, k) => n + sel[k].length, 0)

  const update = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const toggle = (key, value) => {
    const cur = sel[key]
    update(key, (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]).join(','))
  }
  const clearAll = () => {
    const next = new URLSearchParams(params)
    for (const k of FILTER_KEYS) next.delete(k)
    setParams(next, { replace: true })
  }

  // Devices without a spec entry yet still show until a filter is applied.
  const visible = rows.filter((r) => (activeCount ? matches(r.spec, sel) : true))
  const sorter = SORTS.find((s) => s.value === sort)
  if (sort === 'name') visible.sort((a, b) => a.item.title.localeCompare(b.item.title))
  else if (sorter?.key) visible.sort((a, b) => sorter.key(a.spec || {}) - sorter.key(b.spec || {}))

  const countFor = (skip, test) => rows.filter((r) => matches(r.spec, sel, skip) && test(r.spec)).length

  const filters = (
    <div>
      {GROUPS.map((g) => (
        <FilterGroup key={g.key} label={g.label}>
          {g.options(specs).map((o) => (
            <Checkbox
              key={o.value}
              label={o.label}
              count={countFor(g.key, (s) => g.test(s, o.value))}
              checked={sel[g.key].includes(o.value)}
              onChange={() => toggle(g.key, o.value)}
            />
          ))}
        </FilterGroup>
      ))}
      <FilterGroup label="Features">
        {FEATURES.map((f) => (
          <Checkbox
            key={f.value}
            label={f.label}
            // Features AND together, so the count reflects adding this one too.
            count={rows.filter((r) => matches(r.spec, sel) && f.test(r.spec)).length}
            checked={sel.f.includes(f.value)}
            onChange={() => toggle('f', f.value)}
          />
        ))}
      </FilterGroup>
    </div>
  )

  const selectCls =
    'rounded-lg border border-stone-300 bg-white py-2 pr-8 pl-3 text-sm text-stone-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none'

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <Eyebrow>Runs CrossPoint out of the box</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            Devices
          </h1>
          <p className="mt-3 text-base/7 text-stone-600">
            E-readers that run CrossPoint. Filter by the hardware you care about, compare specs, and
            flash the latest firmware from your browser.
          </p>
        </div>

        <div className="mt-10 lg:grid lg:grid-cols-[14rem_1fr] lg:gap-10">
          <aside className="hidden lg:block">
            {filters}
            {activeCount > 0 && (
              <button onClick={clearAll} className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700">
                Clear All Filters
              </button>
            )}
          </aside>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-950/10 lg:hidden"
              >
                Filters{activeCount ? ` (${activeCount})` : ''}
              </button>
              <p className="text-sm text-stone-500" aria-live="polite">
                {items ? `${visible.length} of ${rows.length} devices` : ''}
              </p>
              <div className="ml-auto flex items-center gap-2">
                <label className="sr-only" htmlFor="device-sort">Sort by</label>
                <select id="device-sort" value={sort} onChange={(e) => update('sort', e.target.value)} className={selectCls}>
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-stone-950/10" role="group" aria-label="View">
                  {['grid', 'table'].map((v) => (
                    <button
                      key={v}
                      onClick={() => update('view', v === 'grid' ? '' : v)}
                      aria-pressed={view === v}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${view === v ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'}`}
                    >
                      {v === 'table' ? 'Compare' : 'Grid'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {showFilters && (
              <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-stone-950/5 lg:hidden">
                {filters}
                {activeCount > 0 && (
                  <button onClick={clearAll} className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700">
                    Clear All Filters
                  </button>
                )}
              </div>
            )}

            {items === null ? (
              <p className="mt-8 text-sm text-stone-400">Loading...</p>
            ) : visible.length === 0 ? (
              <p className="mt-8 text-sm text-stone-500">
                {rows.length ? (
                  <>
                    No devices match those filters.{' '}
                    <button onClick={clearAll} className="font-medium text-brand-600 hover:text-brand-700">
                      Clear Filters
                    </button>
                  </>
                ) : (
                  'No devices listed yet. Check back soon.'
                )}
              </p>
            ) : view === 'table' ? (
              <div className="mt-6">
                <CompareTable rows={visible} />
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map(({ item, spec }) => (
                  <ProductCard key={item.id} item={item} ctaLabel="Buy Now">
                    <SpecChips spec={spec} />
                  </ProductCard>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
