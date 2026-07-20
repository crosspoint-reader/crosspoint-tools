import { useMemo } from 'react'

const PHOTO_COUNT = 12

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
    <section className="relative border-t border-stone-200 bg-stone-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="max-w-[32ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          CrossPoint community shots.
        </h2>
      </div>
      <div className="marquee mt-10">
        <div className="marquee-track" aria-hidden="true">
          {/* Duplicate set (required for seamless loop) */}
          {[0, 1].map((pass) =>
            order.map((n) => (
              <div key={`${pass}-${n}`} className="marquee-item">
                <img src={`/community/${n}.webp`} alt="" loading="lazy" />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
