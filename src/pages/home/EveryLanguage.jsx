import { Eyebrow } from '../../components/ui.jsx'

function Em({ children }) {
  return <strong className="font-medium text-stone-900">{children}</strong>
}

export default function EveryLanguage() {
  return (
    <section className="eink relative overflow-hidden border-t border-stone-200 bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8">
        <div>
          <Eyebrow>hola · ciao · hallo</Eyebrow>
          <h2 className="mt-2 max-w-[24ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
            Reads your language.
          </h2>
          <p className="mt-6 max-w-[58ch] font-serif text-xl/9 text-pretty text-stone-600">
            The community has translated CrossPoint into <Em>nearly thirty languages</Em>, from
            Spanish and German to Hebrew, Ukrainian, and Vietnamese. The reader lays out{' '}
            <Em>right-to-left text</Em> properly, shapes <Em>script languages</Em> correctly,
            and <Em>hyphenates each language by its own rules</Em>. There&rsquo;s even{' '}
            <Em>Focus Reading</Em> for readers who like a guided pace. And if your language is
            missing, a translation is one of the easiest ways to contribute.
          </p>
        </div>

        {/* Stacked frames: Focus Reading behind, RTL (Hebrew) in front */}
        <div className="relative mx-auto" style={{ width: 'min(100%,360px)', height: '520px' }}>
          <div className="eink eink-s-50 absolute top-1 left-0" style={{ transform: 'rotate(-5deg)' }}>
            <div className="eink-device">
              <div className="eink-screen">
                <img src="/screenshots/feature-focus-reading.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
              </div>
            </div>
          </div>
          <div className="eink eink-s-55 absolute right-0 bottom-0" style={{ transform: 'rotate(4deg)', zIndex: 2 }}>
            <div className="eink-device">
              <div className="eink-screen">
                <img src="/screenshots/feature-rtl.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
