const QUOTES = [
  {
    quote: 'reTerminal Sticky is built open — CrossPoint was the perfect fit for us since day 1.',
    src: '/press/seeedstudio.png',
    alt: 'Seeed Studio',
    className: 'mt-1.5 h-4 sm:h-5',
  },
  {
    quote: 'The excellent CrossPoint Reader alternative firmware was the X4’s saving grace',
    src: '/press/theverge.svg',
    alt: 'The Verge',
    className: 'h-6 sm:h-7',
  },
  {
    quote: 'CrossPoint is unquestionably superior to the OS that ships with the device',
    src: '/press/lifehacker.svg',
    alt: 'Lifehacker',
    className: 'h-6 sm:h-7',
  },
]

export default function PressQuotes() {
  return (
    <section className="border-t border-stone-200/70 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:px-8">
        <div className="grid gap-12 sm:grid-cols-3 sm:gap-10">
          {QUOTES.map((q) => (
            <figure key={q.alt} className="flex flex-col items-center text-center sm:items-start sm:text-left">
              <blockquote className="font-display text-xl/8 text-pretty text-stone-800 italic sm:text-2xl/9">
                &ldquo;{q.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5">
                <img
                  src={q.src}
                  alt={q.alt}
                  className={`${q.className} w-auto opacity-45 [filter:brightness(0)]`}
                  loading="lazy"
                />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
