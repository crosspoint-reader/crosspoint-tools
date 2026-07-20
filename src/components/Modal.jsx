import { useEffect } from 'react'

// Shared modal shell: backdrop, card, title bar, Escape/backdrop-click to close.
export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[calc(100vh-4rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-stone-950/5">
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4">
          <h2 className="font-display text-xl font-semibold tracking-tight text-stone-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-2 rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
