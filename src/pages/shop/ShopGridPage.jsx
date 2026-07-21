import { useEffect, useMemo, useState } from 'react'
import Layout from '../../components/Layout.jsx'
import { Eyebrow } from '../../components/ui.jsx'

export function accessoryImageUrl(a) {
  return a.imageUpdatedAt
    ? '/api/accessories/' + a.id + '/image?v=' + encodeURIComponent(a.imageUpdatedAt)
    : null
}

// Legacy entries predate the category field and are all accessories.
export function accessoryCategory(a) {
  return a.category || 'accessory'
}

function SearchIcon() {
  return (
    <svg
      className="size-4 text-stone-400"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="2"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  )
}

function ProductCard({ item }) {
  const imgUrl = accessoryImageUrl(item)
  const clickable = !!item.link

  const body = (
    <>
      <div className="aspect-square w-full bg-stone-100">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={item.title}
            loading="lazy"
            className={`size-full object-contain p-4 transition ${clickable ? 'group-hover:scale-[1.02]' : ''}`}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-stone-400">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3
          className={`text-sm font-semibold ${clickable ? 'text-stone-900 group-hover:text-brand-600' : 'text-stone-500'}`}
        >
          {item.title}
        </h3>
        <span
          className={`mt-auto pt-3 text-xs font-medium ${clickable ? 'text-brand-600' : 'text-stone-400'}`}
        >
          {clickable ? (
            <>
              Buy Now <span aria-hidden="true">&rarr;</span>
            </>
          ) : (
            'Coming soon'
          )}
        </span>
      </div>
    </>
  )

  const cardCls =
    'flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-stone-950/5'

  if (!clickable) {
    return <div className={cardCls}>{body}</div>
  }
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className={`group ${cardCls} transition hover:shadow-md hover:ring-stone-950/10`}
    >
      {body}
    </a>
  )
}

// Amazon-style product grid with optional search, shared by /devices and /accessories.
export default function ShopGridPage({ category, eyebrow, title, intro, emptyText, showSearch = true }) {
  const [items, setItems] = useState(null) // null = loading
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.title = title + ' - CrossPoint Reader'
  }, [title])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/accessories')
        const data = await res.json()
        if (!cancelled) {
          setItems((data.accessories || []).filter((a) => accessoryCategory(a) === category))
        }
      } catch {
        if (!cancelled) setItems([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [category])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((a) => a.title.toLowerCase().includes(q))
  }, [items, query])

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-base/7 text-stone-600">{intro}</p>
        </div>

        {showSearch && (
          <div className="relative mt-8 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <SearchIcon />
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={'Search ' + title.toLowerCase() + '...'}
              aria-label={'Search ' + title.toLowerCase()}
              className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pr-3 pl-9 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
          </div>
        )}

        {items === null ? (
          <p className="mt-10 text-sm text-stone-400">Loading...</p>
        ) : filtered.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((a) => (
              <ProductCard key={a.id} item={a} />
            ))}
          </div>
        ) : (
          <p className="mt-10 text-sm text-stone-400">
            {query.trim() ? 'No results match "' + query.trim() + '".' : emptyText}
          </p>
        )}
      </div>
    </Layout>
  )
}
