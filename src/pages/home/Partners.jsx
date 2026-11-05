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
    <section aria-label="Official partners" className="home-partners">
      <div className="home-partners-window">
        <div className="home-partners-track">
          {[false, true].map((duplicate) => (
            <ul key={String(duplicate)} aria-hidden={duplicate || undefined}>
              {PARTNERS.map((p) => (
                <li key={p.name}>
                  <img src={p.src} alt={duplicate ? '' : p.name} className={`${p.className} w-auto max-w-none rounded-none object-contain opacity-45`} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  )
}
