import { Link } from 'react-router-dom'
import { Eyebrow } from '../../components/ui.jsx'

function CheckIcon() {
  return (
    <svg className="mt-0.5 size-4 shrink-0 text-brand-500" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CheckList({ items }) {
  return (
    <ul role="list" className="mt-6 space-y-3 text-sm/6 text-stone-600">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <CheckIcon />
          {item}
        </li>
      ))}
    </ul>
  )
}

function EinkShot({ src, sizeClass = 'eink-s-55 sm:eink-s-60' }) {
  return (
    <div className={`eink ${sizeClass}`}>
      <div className="eink-device">
        <div className="eink-screen">
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </div>
    </div>
  )
}

const UPGRADES = [
  {
    title: 'Custom Sleep Timer',
    body: 'Pick any sleep delay from 1 to 30 minutes, or set it to never sleep at all.',
  },
  {
    title: 'Quick Resume',
    body: 'Show the page you were reading as the sleep screen and wake straight back into the book.',
  },
  {
    title: 'Themed Menus',
    body: 'Built-in themes (Classic, Lyra, Lyra 3 Covers, and Roundedraff) now style the reader menus too.',
  },
  {
    title: 'Tilt to Turn',
    x3: true,
    body: 'On the X3, the built-in motion sensor turns pages with a gentle tilt of the device.',
  },
  {
    title: 'On-device Clock',
    x3: true,
    body: "X3 builds keep time with a real-time clock and sync over NTP whenever they're online.",
  },
  {
    title: 'Configurable Buttons',
    body: 'Page turns follow the screen orientation, and the side buttons can be disabled entirely.',
  },
  {
    title: 'Richer Rendering',
    body: 'Superscripts, subscripts, and horizontal rules now render for cleaner footnotes and section breaks.',
  },
  {
    title: 'Enhanced AA & Page Speed',
    body: 'Smoother grayscale anti-aliasing and tiled rendering with silent pre-indexing for faster, cleaner page turns.',
  },
  {
    title: 'Tidy Recents',
    body: 'Remove books from the recent list by hand, or auto-clear them once you finish reading.',
  },
  {
    title: 'Localisation',
    body: 'UI translations for Hebrew, Spanish, French, German, Italian, Portuguese, Russian, Ukrainian, Polish, and more.',
  },
  {
    title: 'Calibre Plugin',
    body: 'Send books from Calibre to the device over WiFi via the CrossPoint device plugin.',
  },
  {
    title: 'Sleep Screens',
    body: 'Choose a fixed image, the current book cover, or a random image from the SD card.',
  },
]

export default function Features() {
  return (
    <section className="eink relative border-t border-stone-200 bg-white py-20 sm:py-28">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Feature 1: Reading experience (reader cutout) */}
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <Eyebrow>Rendering</Eyebrow>
            <h3 className="mt-4 max-w-[22ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
              EPUB 2 and 3 rendering.
            </h3>
            <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">
              Parses EPUB 2 and 3 files, applies embedded CSS, and lays out chapters in the
              configured font, size, and margins. Chapter data is cached to SD on first open;
              subsequent opens are near-instant.
            </p>
            <CheckList
              items={[
                'Justified text with optional hyphenation',
                'Footnote links and table of contents navigation',
                'Reading position persisted across reboots',
              ]}
            />
          </div>

          <div className="relative mx-auto">
            <EinkShot src="/screenshots/feature-reader.png" />
          </div>
        </div>

        {/* Feature 2: Typography / settings (settings cutout, reversed) */}
        <div className="mt-24 grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="relative order-last mx-auto lg:order-first">
            <EinkShot src="/screenshots/feature-settings.png" />
          </div>

          <div>
            <Eyebrow>Typography</Eyebrow>
            <h3 className="mt-4 max-w-[22ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
              Configurable typography.
            </h3>
            <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">
              Three built-in font families (Noto Serif, Noto Sans, Open Dyslexic) and user fonts
              loaded from the SD card. Settings for font size, line spacing, screen margin,
              paragraph alignment, hyphenation, embedded style, and anti-aliasing.
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 text-sm" role="list">
              <div>
                <dt className="font-display font-semibold text-stone-900">Font Sizes</dt>
                <dd className="mt-1 text-stone-500">Small, Medium, Large, X-Large</dd>
              </div>
              <div>
                <dt className="font-display font-semibold text-stone-900">Load Custom Fonts</dt>
                <dd className="mt-1 text-stone-500">
                  Add your own TTFs via the{' '}
                  <Link to="/fonts" className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
                    font builder
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="font-display font-semibold text-stone-900">Alignment Options</dt>
                <dd className="mt-1 text-stone-500">Justify, Left, Center, Right, or the Book's Style</dd>
              </div>
              <div>
                <dt className="font-display font-semibold text-stone-900">Set Screen Margin</dt>
                <dd className="mt-1 text-stone-500">5–40 px, in 5-px increments</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Feature: WiFi transfer */}
        <div className="mt-24 grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <Eyebrow>Networking</Eyebrow>
            <h3 className="mt-4 max-w-[22ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
              WiFi transfer and sync.
            </h3>
            <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">
              The device runs an HTTP upload server when connected to WiFi or acting as a hotspot.
              Drop EPUBs in from any browser or use our{' '}
              <a
                href="https://github.com/crosspoint-reader/calibre-plugins/releases/"
                target="_blank"
                rel="noopener"
                className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
              >
                Calibre Plugin
              </a>
              .
            </p>
            <CheckList
              items={[
                'Joins an existing WiFi network or runs its own hotspot',
                'KOReader Sync for cross-device reading progress',
                'Multiple OPDS library servers configurable on-device',
                'Over-the-air firmware updates',
              ]}
            />
          </div>

          <div className="relative mx-auto">
            <EinkShot src="/screenshots/feature-transfer.png" />
          </div>
        </div>

        {/* Feature: Bookmarks (bookmarks list cutout, reversed) */}
        <div className="mt-24 grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="relative order-last mx-auto lg:order-first">
            <EinkShot src="/screenshots/feature-bookmarks.png" />
          </div>

          <div>
            <Eyebrow>Reading</Eyebrow>
            <h3 className="mt-4 max-w-[22ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
              Bookmark any passage.
            </h3>
            <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">
              Hold Confirm anywhere in the reader to drop a bookmark. Every saved spot remembers
              its page and reading percentage, so you can flip back to a favourite passage in a
              tap.
            </p>
            <CheckList
              items={[
                'Hold Confirm in the reader to save your spot',
                'Each entry shows its page number and percentage',
                "Jump straight to any bookmark, or delete ones you're done with",
              ]}
            />
          </div>
        </div>

        {/* Feature: Reading aids: Focus Reading + RTL (stacked frames) */}
        <div className="mt-24 grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <Eyebrow>Reading aids</Eyebrow>
            <h3 className="mt-4 max-w-[22ch] font-display text-3xl font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">
              Tuned to how you read.
            </h3>
            <p className="mt-4 max-w-[52ch] text-base/7 text-pretty text-stone-600">
              Focus Reading bolds the front of each word to guide your eye and set your pace. And
              full right-to-left layout brings the EPUB and text readers to languages like Hebrew
              and Arabic, with matching interface translations.
            </p>
            <CheckList
              items={[
                'Focus Reading bolds leading characters to pull your eye through the text',
                'Right-to-left layout in both the EPUB and plain-text readers',
              ]}
            />
          </div>

          {/* Stacked frames: Focus Reading behind, RTL in front */}
          <div className="relative mx-auto" style={{ width: 'min(100%,360px)', height: '520px' }}>
            {/* Back frame: Focus Reading (bolded word stems) */}
            <div className="eink eink-s-50 absolute top-1 left-0" style={{ transform: 'rotate(-5deg)' }}>
              <div className="eink-device">
                <div className="eink-screen">
                  <img src="/screenshots/feature-focus-reading.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
                </div>
              </div>
            </div>

            {/* Front frame: right-to-left reader */}
            <div className="eink eink-s-55 absolute right-0 bottom-0" style={{ transform: 'rotate(4deg)', zIndex: 2 }}>
              <div className="eink-device">
                <div className="eink-screen">
                  <img src="/screenshots/feature-rtl.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary features grid */}
        <div className="mt-24 border-t border-stone-200 pt-16">
          <Eyebrow>New in 1.4</Eyebrow>
          <h3 className="mt-4 max-w-[28ch] font-display text-2xl font-semibold tracking-tight text-balance text-stone-900 sm:text-3xl">
            A stack of smaller upgrades.
          </h3>
          <dl className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4" role="list">
            {UPGRADES.map((u) => (
              <div key={u.title} className="border-t border-stone-100 pt-4">
                <dt className="font-display text-sm font-semibold text-stone-900">
                  {u.title}
                  {u.x3 && <span className="font-mono text-xs font-medium text-stone-400"> · X3</span>}
                </dt>
                <dd className="mt-1.5 text-sm/6 text-stone-500">{u.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
