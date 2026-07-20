const POINTS = [
  {
    title: 'Right-to-left support',
    body: 'Full right-to-left layout in both the EPUB and plain-text readers, with matching Hebrew and Arabic interface translations.',
  },
  {
    title: 'Proper glyph shaping',
    body: 'Contextual shaping for Arabic, Farsi, and Urdu. Careful line-breaking for Korean and Vietnamese. Diacritics that sit exactly where they should.',
  },
  {
    title: 'Per-language hyphenation',
    body: 'Line-breaking rules tuned for Polish, Swedish, Finnish, and more, so justified text stays even in any tongue.',
  },
]

export default function EveryLanguage() {
  return (
    <section className="relative overflow-hidden border-t border-stone-200 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="max-w-[24ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          Reads your language.
        </h2>
        <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">
          Every translation comes from a native speaker in the community. The interface speaks
          more than twenty languages, and the reader itself goes much further.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-7xl grid-cols-1 gap-10 px-6 sm:grid-cols-3 lg:px-8">
        {POINTS.map((p) => (
          <div key={p.title}>
            <h3 className="font-display text-lg font-semibold text-stone-900">{p.title}</h3>
            <p className="mt-2 text-sm/6 text-pretty text-stone-600">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
