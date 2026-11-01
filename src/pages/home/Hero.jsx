import { Link } from 'react-router-dom'
import { Button, Eyebrow } from '../../components/ui.jsx'

// E-ink device frame: screen contents come from a firmware screenshot so the
// mockups render pixel-identical to the real UI.
function EinkShot({ src, screenClass = '', x3 = false }) {
  return (
    <div className={x3 ? 'eink-device eink-device-x3' : 'eink-device'}>
      <div className={`eink-screen ${x3 ? 'eink-screen-x3' : ''} ${screenClass}`.trim()}>
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section className="eink relative overflow-x-clip">
      {/* soft brand wash + faint paper grain behind the hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-stone-50 via-white to-brand-50/50"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 paper-grain opacity-[0.05]"
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-[1fr_auto] lg:gap-16 lg:px-8 lg:py-24">
        <div>
          <Eyebrow>built by readers, for readers</Eyebrow>
          <h1 className="mt-2 max-w-[18ch] font-display text-5xl/[1.05] font-semibold tracking-tight text-balance text-stone-900 sm:text-7xl/[1.05]">
            Read without limits.
          </h1>
          <p className="mt-6 max-w-[48ch] font-serif text-xl/9 text-pretty text-stone-600">
            CrossPoint is <strong className="font-medium text-stone-900">the best way to read
            on the go</strong>, built in the open, by the community. Get it for the Xteink,
            reTerminal Sticky, M5Paper, LilyGo T5, and more devices with every release.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button as={Link} to="/install" variant="primary" className="px-4 py-2.5">
              <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Install CrossPoint
            </Button>
            <Button as={Link} to="/devices" variant="outline" className="px-4 py-2.5">
              <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
              </svg>
              Shop Devices
            </Button>

            {/* Hand-drawn annotation pointing back at the shop button */}
            <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
              <svg
                className="mt-3 w-10 shrink-0 text-stone-400"
                viewBox="0 0 40 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M38 20 C 30 22, 18 20, 5 8" />
                <path d="M5 8 l 0.5 7" />
                <path d="M5 8 l 7.5 0.5" />
              </svg>
              <span className="mt-4 max-w-[18ch] -rotate-2 font-hand text-lg/6 font-medium text-stone-500">
                Buying from us helps support development
              </span>
            </div>
          </div>

        </div>

        {/* Device mockup: home screen, scaled 0.55 → ≈290×440 + bezel */}
        <div className="relative mx-auto lg:mx-0">
          {/* floating reader-preview cutout behind the main device */}
          <div className="pointer-events-none absolute -top-8 -left-16 hidden rotate-[-6deg] lg:block">
            <div className="eink eink-s-35">
              <EinkShot src="/screenshots/hero-reader.png" />
            </div>
          </div>

          {/* floating settings cutout (Display tab) */}
          <div className="pointer-events-none absolute -right-14 bottom-0 hidden rotate-[5deg] lg:block">
            <div className="eink eink-s-35">
              <EinkShot src="/screenshots/hero-settings.png" />
            </div>
          </div>

          {/* main device: home screen (Lyra theme, pixel-accurate port) */}
          <div className="eink eink-s-55 sm:eink-s-60 relative">
            <EinkShot src="/screenshots/hero-home.png" screenClass="is-home" x3 />
          </div>

        </div>
      </div>

    </section>
  )
}
