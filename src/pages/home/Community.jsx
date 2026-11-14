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
  const [previous, setPrevious] = useState(null)
  const [motion, setMotion] = useState('opening')
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open === null) dialog.open && dialog.close()
    else if (!dialog.open) dialog.showModal()
  }, [open])

  useEffect(() => {
    if (open === null) return
    for (const delta of [-1, 1]) {
      const image = new Image()
      image.src = `/community/${order[(open + delta + order.length) % order.length]}.webp`
    }
  }, [open, order])

  const close = () => setMotion('closing')
  const reset = () => {
    setOpen(null)
    setPrevious(null)
    setMotion('opening')
  }
  const step = (delta) => {
    if (open === null || motion === 'closing') return
    setPrevious(open)
    setMotion(delta > 0 ? 'next' : 'prev')
    setOpen((open + delta + order.length) % order.length)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      step(e.key === 'ArrowRight' ? 1 : -1)
    }
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
        data-motion={motion}
        aria-label="Community photo"
        onClose={reset}
        onCancel={(e) => { e.preventDefault(); close() }}
        onKeyDown={onKeyDown}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        {open !== null && (
          <>
            <div className="home-shots-stage" onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && motion === 'closing') setOpen(null)
            }}>
              {previous !== null && (
                <img key={previous} className="home-shots-outgoing" src={`/community/${order[previous]}.webp`} alt="" aria-hidden="true" onAnimationEnd={() => setPrevious(null)} />
              )}
              <img key={open} className="home-shots-current" src={`/community/${order[open]}.webp`} alt={`Community photo ${open + 1} of ${order.length}`} />
            </div>
            <button type="button" className="home-shots-close" onClick={close} aria-label="Close">×</button>
            <button type="button" className="home-shots-nav home-shots-prev" onClick={() => step(-1)} aria-label="Previous photo">‹</button>
            <button type="button" className="home-shots-nav home-shots-next" onClick={() => step(1)} aria-label="Next photo">›</button>
          </>
        )}
      </dialog>
    </section>
  )
}
