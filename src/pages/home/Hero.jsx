import { Link } from 'react-router-dom'
import { Button } from '../../components/ui.jsx'

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

export default function Hero({ onOpenBuy }) {
  return (
    <section className="eink relative overflow-hidden">
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
          <h1 className="max-w-[18ch] font-display text-5xl/[1.05] font-semibold tracking-tight text-balance text-stone-900 sm:text-7xl/[1.05]">
            Read without limits.
          </h1>
          <p className="mt-6 max-w-[48ch] font-serif text-xl/9 text-pretty text-stone-600">
            CrossPoint is <strong className="font-medium text-stone-900">the best way to read
            on the go</strong>, built in the open, by the community. Get it for the Xteink X3
            and X4, the Sticky from Seeed Studio, the M5Paper, the LilyGo T5, and more devices
            with every release.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button as="a" href="#flash-tools" variant="primary" className="px-4 py-2.5">
              <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Get CrossPoint
            </Button>
            <Button as="button" type="button" variant="outline" className="px-4 py-2.5" onClick={onOpenBuy}>
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

          {/* Secondary links */}
          <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-400">
            <Link
              to="/debug"
              className="inline-flex items-center gap-1.5 font-medium no-underline underline-offset-4 hover:text-stone-700 hover:underline"
            >
              <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
              </svg>
              Advanced Flash Controls
            </Link>
            <span aria-hidden="true" className="text-stone-300">&middot;</span>
            <a
              href="https://github.com/crosspoint-reader/crosspoint-reader"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 font-medium no-underline underline-offset-4 hover:text-stone-700 hover:underline"
            >
              <svg className="size-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
              </svg>
              View on GitHub
            </a>
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
