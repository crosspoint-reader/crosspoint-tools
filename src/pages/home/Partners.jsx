const PARTNERS = [
  { name: 'Xteink', src: '/brands/xteink.svg', className: 'h-4 sm:h-5' },
  { name: 'Seeed Studio', src: '/brands/seeed.svg', className: 'h-4 sm:h-5' },
  { name: 'M5Stack', src: '/brands/m5stack.svg', className: 'h-6 sm:h-7' },
  { name: 'BOOX', src: '/brands/boox.svg', className: 'h-5 sm:h-6' },
  { name: 'EEGORead', src: '/brands/eego-partner.png', className: 'h-3.5 sm:h-4 brightness-0' },
  { name: 'CLOUD ZAO', src: '/brands/cloudzao.svg', className: 'h-9 sm:h-10 brightness-0' },
]

export default function Partners() {
  return (
    <section aria-label="Official partners" className="col-span-full pt-8">
      <div>
        <p className="text-center text-xs text-stone-500 uppercase">
          Official partners
        </p>
        <div className="mt-7 grid grid-cols-[auto_auto] items-center justify-center justify-items-center gap-x-10 gap-y-7 lg:flex lg:gap-x-10 xl:gap-x-16">
          {PARTNERS.map((p) => (
            <img
              key={p.name}
              src={p.src}
              alt={p.name}
              className={`${p.className} w-auto min-w-0 object-contain opacity-45`}
              loading="lazy"
            />
          ))}
        </div>
      </div>
    </section>
  )
}
