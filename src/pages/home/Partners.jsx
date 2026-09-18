const PARTNERS = [
  { name: 'Xteink', src: '/brands/xteink.svg', className: 'h-4 sm:h-5' },
  { name: 'Seeed Studio', src: '/brands/seeed.svg', className: 'h-4 sm:h-5' },
  { name: 'M5Stack', src: '/brands/m5stack.svg', className: 'h-6 sm:h-7' },
  { name: 'BOOX', src: '/brands/boox.svg', className: 'h-5 sm:h-6' },
]

export default function Partners() {
  return (
    <section className="border-t border-stone-200/70 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-10 sm:py-12 lg:px-8">
        <p className="text-center text-xs font-semibold tracking-[0.2em] text-stone-400 uppercase">
          Official partners of
        </p>
        <div className="mt-7 grid grid-cols-[auto_auto] items-center justify-center justify-items-center gap-x-10 gap-y-7 lg:flex lg:-translate-x-7 lg:gap-x-16">
          {PARTNERS.map((p) => (
            <img
              key={p.name}
              src={p.src}
              alt={p.name}
              className={`${p.className} w-auto opacity-45`}
              loading="lazy"
            />
          ))}
        </div>
      </div>
    </section>
  )
}
