// Shared helpers + small components for the Insider (nightly builds) and
// Login (Royalty.dev subscription) pages.

export function formatDate(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatSize(bytes) {
  if (!bytes) return '—'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function relativeTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Strip conventional commit prefixes and capitalize the first letter.
export function cleanCommitMessage(message) {
  const msg = message
    .split('\n')[0]
    .replace(/^(feat|fix|chore|refactor|docs|style|test|perf|ci|build|revert)(\(.+?\))?:\s*/i, '')
  return msg.charAt(0).toUpperCase() + msg.slice(1)
}

export function getFlashSteps(skipReset) {
  return [
    'Download firmware',
    'Connect to device',
    'Validate partition table',
    'Read OTA data',
    'Flash firmware',
    'Update boot partition',
    skipReset ? 'Disconnect' : 'Reset device',
  ]
}

export function Spinner({ className = 'size-5 text-stone-400' }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

const STEP_COLORS = {
  pending: 'text-stone-400',
  running: 'text-stone-900',
  done: 'text-brand-600',
  error: 'text-red-600',
}

const STEP_ICONS = {
  pending: '○',
  running: '◠',
  done: '✓',
  error: '✗',
}

// Vertical flash progress checklist with an inline progress bar during the
// "Flash firmware" step.
export function FlashSteps({ steps, states, progress }) {
  return (
    <ul role="list" className="mt-4 divide-y divide-stone-100">
      {steps.map((name, i) => {
        const st = states[i] || 'pending'
        const showBar = st === 'running' && name === 'Flash firmware'
        return (
          <li key={name} className={`flex items-center gap-3 py-3 text-sm/5 ${STEP_COLORS[st]}`}>
            <span
              className={`flex size-5 shrink-0 items-center justify-center ${st === 'running' ? 'animate-spin' : ''}`}
              aria-hidden="true"
            >
              {STEP_ICONS[st]}
            </span>
            <span className={showBar ? '' : 'flex-1'}>{name}</span>
            {showBar && (
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-200"
                  style={{ width: `${progress.toFixed(1)}%` }}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// Commit list shared by the insider and login changelog cards.
export function ChangelogList({ changelog, emptyText = 'No changelog available', className = '' }) {
  return (
    <ul
      role="list"
      className={`mt-4 divide-y divide-stone-100 overflow-y-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {changelog?.length ? (
        changelog.map((c, i) => (
          <li key={i} className="flex gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="text-stone-800">{cleanCommitMessage(c.message)}</div>
              <div className="mt-0.5 text-xs text-stone-400">{c.author}</div>
            </div>
            <span className="shrink-0 pt-0.5 text-xs text-stone-400 tabular-nums">
              {c.date ? relativeTime(c.date) : ''}
            </span>
          </li>
        ))
      ) : (
        <li className="py-3 text-sm text-stone-400">{emptyText}</li>
      )}
    </ul>
  )
}
