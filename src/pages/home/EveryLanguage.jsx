function Em({ children }) {
  return <strong className="font-medium text-stone-900">{children}</strong>
}

export default function EveryLanguage() {
  return (
    <section className="relative overflow-hidden border-t border-stone-200 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="max-w-[24ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
          Reads your language.
        </h2>
        <p className="mt-6 max-w-3xl font-serif text-xl/9 text-pretty text-stone-600">
          The community has translated CrossPoint into <Em>nearly thirty languages</Em>, from
          Spanish and German to Hebrew, Ukrainian, and Vietnamese. The reader lays out{' '}
          <Em>right-to-left text</Em> properly, shapes <Em>script languages</Em> correctly,
          and <Em>hyphenates each language by its own rules</Em>. And if yours is
          missing, a translation is one of the easiest ways to contribute.
        </p>
      </div>
    </section>
  )
}
