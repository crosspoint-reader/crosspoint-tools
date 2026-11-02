import { useMemo } from 'react'

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

  return (
    <section className="home-shots">
      <div className="home-wrap">
        <h2 className="home-hand home-shots-heading">Join the thousands of readers who love CrossPoint</h2>
      </div>
      <div className="home-wrap home-shots-grid" aria-hidden="true">
        {order.map((n) => (
          <img key={n} src={`/community/${n}.webp`} alt="" loading="lazy" />
        ))}
      </div>
    </section>
  )
}
