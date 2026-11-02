import { useEffect, useState } from 'react'

// Live numbers come from /api/stats. These are the last known good values and
// stand in until the fetch resolves — and stay put if it never does.
const FALLBACK_STATS = {
  contributors: 242,
  forks: 1947,
  changes: 126,
  downloads: 198781,
}

const STAT_LABELS = [
  ['contributors', 'contributors around the world'],
  ['forks', 'community forks built on CrossPoint'],
  ['changes', 'changes in the last major release'],
  ['downloads', 'devices running CrossPoint'],
]

function useCommunityStats() {
  const [stats, setStats] = useState(FALLBACK_STATS)

  useEffect(() => {
    let cancelled = false
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        if (cancelled) return
        // Only take keys that came back as numbers, so a partial or malformed
        // response can't blank out a tile.
        setStats((prev) => {
          const next = { ...prev }
          for (const key of Object.keys(prev)) {
            if (typeof data[key] === 'number') next[key] = data[key]
          }
          return next
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return stats
}

export default function CommunityStats() {
  const stats = useCommunityStats()

  return (
    <dl className="grid grid-cols-2 gap-8 pt-10 lg:grid-cols-4">
      {STAT_LABELS.map(([key, label]) => (
        <div key={key}>
          <dt className="sr-only">{label}</dt>
          <dd className="font-display text-5xl font-semibold tracking-tight text-stone-900">
            {stats[key].toLocaleString('en-US')}
          </dd>
          <dd className="mt-1 text-sm text-stone-500">{label}</dd>
        </div>
      ))}
    </dl>
  )
}
