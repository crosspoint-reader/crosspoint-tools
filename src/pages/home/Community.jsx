import { useEffect, useMemo, useRef, useState } from 'react'

const PHOTO_COUNT = 24

export default function Community() {
  // Shuffle once per mount, exactly like the old inline script did.
  const order = useMemo(() => {
    const arr = Array.from({ length: PHOTO_COUNT }, (_, i) => i + 1)
    for (let j = arr.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1))
      ;[arr[j], arr[k]] = [arr[k], arr[j]]
    }
    return arr
  }, [])

  // Index into `order` of the photo shown full size, or null when closed.
  const [open, setOpen] = useState(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open === null) dialog.open && dialog.close()
    else if (!dialog.open) dialog.showModal()
  }, [open])

  const step = (delta) => setOpen((i) => (i + delta + order.length) % order.length)

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
  }

  return (
    <section className="home-shots">
      <div className="home-wrap">
        <h2 className="home-hand home-shots-heading">Join the thousands of readers who love CrossPoint</h2>
      </div>
      <div className="home-wrap home-shots-grid">
        {order.map((n, i) => (
          <button key={n} type="button" onClick={() => setOpen(i)} aria-label={`View community photo ${i + 1} of ${order.length}`}>
            <img src={`/community/${n}.webp`} alt="" loading="lazy" />
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="home-shots-dialog"
        aria-label="Community photo"
        onClose={() => setOpen(null)}
        onKeyDown={onKeyDown}
        onClick={(e) => e.target === e.currentTarget && setOpen(null)}
      >
        {open !== null && (
          <>
            <img src={`/community/${order[open]}.webp`} alt={`Community photo ${open + 1} of ${order.length}`} />
            <button type="button" className="home-shots-close" onClick={() => setOpen(null)} aria-label="Close">×</button>
            <button type="button" className="home-shots-nav home-shots-prev" onClick={() => step(-1)} aria-label="Previous photo">‹</button>
            <button type="button" className="home-shots-nav home-shots-next" onClick={() => step(1)} aria-label="Next photo">›</button>
          </>
        )}
      </dialog>
    </section>
  )
}
