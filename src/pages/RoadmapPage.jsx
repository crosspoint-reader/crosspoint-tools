import { useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import { Eyebrow } from '../components/ui.jsx'

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2.25" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function AlertIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2.25" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
      />
    </svg>
  )
}

// ---- Small shared pieces -------------------------------------------------

function PhaseBadges({ status, phase, live = false }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {live ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-brand-700">
          <span className="size-1.5 animate-pulse rounded-full bg-brand-500" />
          {status}
        </span>
      ) : (
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-stone-700">
          {status}
        </span>
      )}
      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 font-mono text-xs font-medium text-stone-600">
        {phase}
      </span>
    </div>
  )
}

function FocusGrid({ items }) {
  return (
    <div className="mt-6">
      <p className="font-mono text-xs font-semibold tracking-wide text-stone-500 uppercase">Focus areas</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200/70">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function NumberChip({ n, dark = false }) {
  return (
    <span
      className={`flex size-7 items-center justify-center rounded-md font-mono text-xs font-bold ${
        dark ? 'bg-white text-stone-900' : 'bg-brand-500 text-white'
      }`}
    >
      {n}
    </span>
  )
}

// ---- Page ----------------------------------------------------------------

export default function RoadmapPage() {
  useEffect(() => {
    document.title = 'Roadmap & Scope - CrossPoint Reader'
  }, [])

  return (
    <Layout>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-stone-200 bg-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 dot-field text-stone-900/[0.05] [mask-image:radial-gradient(80%_100%_at_50%_0%,black,transparent_75%)]"
        />
        <div className="relative mx-auto max-w-5xl px-6 py-14 sm:py-20">
          <div className="flex flex-col items-center text-center">
            <Eyebrow>Project direction</Eyebrow>
            <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-5xl">
              Roadmap &amp; Scope
            </h1>
            <p className="mt-4 mx-auto max-w-xl text-pretty text-stone-600">
              How CrossPoint is evolving, what we're focused on, and where we're intentionally drawing the line.
            </p>
          </div>

          {/* Phase progress indicator */}
          <div className="mt-10">
            <div className="mx-auto flex max-w-3xl items-center">
              {/* Phase 0 (in progress) */}
              <div className="flex flex-col items-center">
                <div className="flex size-9 items-center justify-center rounded-full bg-brand-500 font-mono text-xs font-semibold text-white ring-4 ring-brand-100">
                  0
                </div>
                <div className="mt-2 font-mono text-[11px] font-medium tracking-wide text-stone-500 uppercase">
                  Close-out
                </div>
              </div>
              <div className="mx-1 h-1 flex-1 rounded-full bg-stone-200">
                <div className="h-full w-1/3 rounded-full bg-brand-400" />
              </div>
              {/* Phase 1 */}
              <div className="flex flex-col items-center">
                <div className="flex size-9 items-center justify-center rounded-full bg-white font-mono text-xs font-semibold text-stone-600 ring-2 ring-stone-300">
                  1
                </div>
                <div className="mt-2 font-mono text-[11px] font-medium tracking-wide text-stone-500 uppercase">
                  Footprint
                </div>
              </div>
              <div className="mx-1 h-1 flex-1 rounded-full bg-stone-200" />
              {/* Phase 2 */}
              <div className="flex flex-col items-center">
                <div className="flex size-9 items-center justify-center rounded-full bg-white font-mono text-xs font-semibold text-stone-600 ring-2 ring-stone-300">
                  2
                </div>
                <div className="mt-2 font-mono text-[11px] font-medium tracking-wide text-stone-500 uppercase">
                  Multi-device
                </div>
              </div>
              <div className="mx-1 h-1 flex-1 rounded-full bg-stone-200" />
              {/* Phase 3 */}
              <div className="flex flex-col items-center">
                <div className="flex size-9 items-center justify-center rounded-full bg-white font-mono text-xs font-semibold text-stone-600 ring-2 ring-stone-300">
                  3
                </div>
                <div className="mt-2 font-mono text-[11px] font-medium tracking-wide text-stone-500 uppercase">
                  Reading
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 flex justify-center gap-3 text-sm">
            <a
              href="#roadmap"
              className="rounded-md bg-brand-500 px-4 py-2 font-semibold text-white no-underline shadow-sm hover:bg-brand-600"
            >
              View Roadmap
            </a>
            <a
              href="#scope"
              className="rounded-md bg-white px-4 py-2 font-semibold text-stone-700 ring-1 ring-stone-950/10 no-underline hover:bg-stone-50"
            >
              View Scope
            </a>
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section id="roadmap" className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <Eyebrow>Roadmap</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
              Phased path forward
            </h2>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-pretty text-stone-600">
          CrossPoint transitions from its current state into the tighter scope below in sequential phases. We close
          out commitments already in flight before locking down to the stricter "fill gaps the stock firmware leaves"
          delineator. Phases are sequential; we do not start the next phase until the prior one is wrapped or
          explicitly carried over.
        </p>

        {/* Timeline */}
        <ol className="relative mt-12 space-y-10 before:absolute before:top-2 before:bottom-2 before:left-5 before:w-px before:bg-gradient-to-b before:from-brand-300 before:via-stone-200 before:to-stone-100 sm:before:left-6">
          {/* Phase 0 */}
          <li className="relative pl-16 sm:pl-20">
            <div className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-full bg-brand-500 font-mono text-sm font-bold text-white ring-4 ring-brand-100 sm:size-12 sm:text-base">
              0
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.18)] sm:p-8">
              <PhaseBadges status="In progress" phase="Phase 0" live />
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900">
                Close Out Legacy Scope Items
              </h3>
              <p className="mt-2 text-stone-600">
                <span className="font-semibold text-stone-900">Goal:</span> Land the work already in motion under the
                prior, broader scope so contributors are not left hanging, and so we enter the stricter phases with a
                clean slate.
              </p>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-xs font-semibold tracking-wide text-stone-500 uppercase">In Phase 0</p>
                  <ul className="mt-3 space-y-2.5 text-sm">
                    <li className="flex gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-stone-100/60">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-500" />
                      <span className="text-stone-700">
                        <strong className="font-semibold text-stone-900">RTL support PRs</strong> currently open:
                        reviewing, iterating, and merging the in-flight right-to-left work.
                      </span>
                    </li>
                    <li className="flex gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-stone-100/60">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-500" />
                      <span className="text-stone-700">
                        <strong className="font-semibold text-stone-900">Dictionary PR</strong>: offline dictionary
                        lookup work.
                      </span>
                    </li>
                    <li className="flex gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-stone-100/60">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-500" />
                      <span className="text-stone-700">
                        <strong className="font-semibold text-stone-900">Bookmarks</strong>: first-class navigation
                        markers in EPUBs.
                      </span>
                    </li>
                    <li className="flex gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-stone-100/60">
                      <AlertIcon className="mt-0.5 size-4 shrink-0 text-stone-400" />
                      <span className="text-stone-700">
                        <strong className="font-semibold text-stone-900">Transparent sleep screens</strong>{' '}
                        (potential): in if it lands clean, shelved if it stalls.
                      </span>
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="font-mono text-xs font-semibold tracking-wide text-stone-500 uppercase">
                    Exit criteria
                  </p>
                  <ul className="mt-3 space-y-2.5 text-sm">
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone-400" />
                      <span className="text-stone-600">
                        RTL, dictionary, and bookmarks PRs are merged or explicitly closed with a reason.
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone-400" />
                      <span className="text-stone-600">Transparent sleep screens merged or shelved.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone-400" />
                      <span className="text-stone-600">
                        No other "legacy scope" features accepted during this phase.
                      </span>
                    </li>
                  </ul>
                  <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900 ring-1 ring-brand-200">
                    Once Phase 0 closes, the tighter{' '}
                    <a href="#scope" className="font-semibold underline underline-offset-2">
                      scope
                    </a>{' '}
                    is fully enforced. "But it was on the old roadmap" is no longer a valid argument.
                  </p>
                </div>
              </div>
            </div>
          </li>

          {/* Phase 1 */}
          <li className="relative pl-16 sm:pl-20">
            <div className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-full bg-white font-mono text-sm font-bold text-stone-700 ring-2 ring-stone-300 sm:size-12 sm:text-base">
              1
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.18)] sm:p-8">
              <PhaseBadges status="Up next" phase="Phase 1" />
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900">
                Consolidation &amp; Footprint
              </h3>
              <p className="mt-2 text-stone-600">
                <span className="font-semibold text-stone-900">Goal:</span> Reduce memory and flash usage and clean up
                the codebase so that future device support and reading-quality work has room to breathe.
              </p>

              <FocusGrid
                items={[
                  'DRAM & heap fragmentation reduction',
                  'Flash footprint reduction',
                  'HAL / SDK boundary refactors',
                  'Themes → SD-loaded assets',
                ]}
              />

              <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 ring-1 ring-stone-200">
                <span className="font-mono text-xs font-semibold tracking-wide text-stone-700 uppercase">
                  Closed during phase
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 line-through decoration-stone-400">
                  New built-in themes
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 line-through decoration-stone-400">
                  New network connectors
                </span>
              </div>
            </div>
          </li>

          {/* Phase 2 */}
          <li className="relative pl-16 sm:pl-20">
            <div className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-full bg-white font-mono text-sm font-bold text-stone-700 ring-2 ring-stone-300 sm:size-12 sm:text-base">
              2
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.18)] sm:p-8">
              <PhaseBadges status="Planned" phase="Phase 2" />
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900">
                Multi-Device ESP32 Support &amp; Recovery Bridge
              </h3>
              <p className="mt-2 text-stone-600">
                <span className="font-semibold text-stone-900">Goal:</span> Land the SDK / HAL generalization work so
                CrossPoint runs cleanly on ESP32-based e-reader hardware beyond Xteink (X3 / X4), including ESP32-S3
                class devices. In parallel, lay the groundwork for CrossPoint to act as a safe bridge onto community
                firmware for users on locked devices.
              </p>

              <FocusGrid
                items={[
                  'Pluggable per-device SDK layers',
                  'Per-device build configuration',
                  'New ESP32 target documentation',
                  'Bootloader / recovery bridge',
                ]}
              />

              <div className="mt-5 rounded-lg bg-brand-50/60 px-4 py-3 ring-1 ring-brand-200/70">
                <p className="text-sm text-stone-700">
                  <strong className="font-semibold text-stone-900">Bootloader / recovery bridge:</strong> a workflow
                  that helps users on locked devices reach community firmware (CrossPoint <em>or</em> other forks)
                  without bricking. Includes a recoverable fallback when a flash goes wrong. Fork-neutral: CrossPoint
                  should be a bridge, not a trap. Driven by{' '}
                  <a
                    className="font-semibold text-brand-700 underline underline-offset-2"
                    href="https://github.com/jeremydk"
                    target="_blank"
                    rel="noopener"
                  >
                    @jeremydk
                  </a>{' '}
                  alongside the SDK abstraction work.
                </p>
              </div>

              <p className="mt-4 text-xs text-stone-500">
                Depends on Phase 1 cleanup landing first; otherwise we generalize a moving target.
              </p>
            </div>
          </li>

          {/* Phase 3 */}
          <li className="relative pl-16 sm:pl-20">
            <div className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-full bg-white font-mono text-sm font-bold text-stone-700 ring-2 ring-stone-300 sm:size-12 sm:text-base">
              3
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-950/5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.18)] sm:p-8">
              <PhaseBadges status="Future" phase="Phase 3" />
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900">
                Reading Experience Deepening
              </h3>
              <p className="mt-2 text-stone-600">
                <span className="font-semibold text-stone-900">Goal:</span> With the codebase smaller and portable,
                invest in the things only a focused reader firmware should do: EPUB rendering, typography,
                hyphenation, layout edge cases, and gap-filling for languages and scripts that neither stock nor other
                CrossPoint forks handle well.
              </p>

              <FocusGrid
                items={[
                  'EPUB parsing & rendering',
                  'Typography (fonts, hyphenation, justification)',
                  'Underserved languages & complex scripts',
                  'E-ink driver refinement (ghosting, partial updates)',
                ]}
              />
            </div>
          </li>
        </ol>

        {/* Out of roadmap */}
        <div className="mt-14 rounded-2xl border border-dashed border-stone-300 bg-stone-50/50 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <svg
              className="size-5 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636"
              />
            </svg>
            <h3 className="font-display text-xl font-semibold tracking-tight text-stone-900">Out of roadmap</h3>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            Explicitly <em>not</em> on the roadmap. May live in other CrossPoint forks; won't be picked up here.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              'Interactive apps (games, calculators, notepads)',
              'Writing / authoring tools',
              'Active connectivity (RSS, news, browsers)',
              'PDF rendering as first-class format',
            ].map((item) => (
              <span
                key={item}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* How this changes */}
        <div className="mt-8 rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
          <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900">
            How this roadmap changes
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
              Phase boundaries are decided by maintainers, not by individual PRs.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
              If a phase needs to be extended or an item carried over, that is documented here with a short note.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
              Proposals for new phases or reordering should go through a Discussion first.
            </li>
          </ul>
        </div>
      </section>

      {/* SCOPE */}
      <section id="scope" className="relative border-t border-stone-200 bg-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-64 blueprint-grid text-stone-900/[0.03] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
        <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div>
            <Eyebrow>Scope</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
              Project Vision &amp; Scope
            </h2>
            <p className="mt-4 max-w-2xl text-pretty text-stone-600">
              The goal of CrossPoint Reader is to create an efficient, open-source reading experience for ESP32-based
              e-reader devices. Xteink hardware (X3, X4) is where the project started and remains a primary target,
              but CrossPoint is broadening to support the wider ecosystem of small ESP32 e-ink readers. A dedicated
              e-reader should do one thing exceptionally well:{' '}
              <strong className="font-semibold text-stone-900">facilitate focused reading.</strong>
            </p>
          </div>

          {/* Core mission + guiding principle */}
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl bg-stone-50 p-6 ring-1 ring-stone-200/70">
              <div className="flex items-center gap-2">
                <NumberChip n="1" />
                <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900">Core Mission</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">
                A lightweight, high-performance firmware that maximizes the potential of ESP32-based e-reader
                hardware, prioritizing legibility, performance, and usability over "swiss-army-knife" functionality.{' '}
                <strong className="font-semibold text-stone-900">Not</strong> a kitchen-sink firmware.{' '}
                <strong className="font-semibold text-stone-900">Not</strong> Xteink-only. Device-specific code lives
                behind the HAL / SDK boundary so the reader core stays portable across ESP32-C3, ESP32-S3, and
                adjacent variants.
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-6 ring-1 ring-stone-200/70">
              <div className="flex items-center gap-2">
                <NumberChip n="2" />
                <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900">
                  Guiding Principle
                </h3>
              </div>
              <p className="mt-3 text-sm font-medium text-stone-900">Fill the gaps the stock firmware leaves.</p>
              <ul className="mt-3 space-y-1.5 text-sm text-stone-600">
                <li>• Stock firmware already does it well? We won't duplicate it.</li>
                <li>• Another popular fork solves it well? We defer rather than fragment.</li>
                <li>• Doesn't improve reading or long-term maintainability? Out of scope.</li>
              </ul>
              <p className="mt-3 text-xs text-stone-500">
                <strong className="font-medium text-stone-700">Language priority:</strong> English first, then
                languages where stock firmware fails or forks haven't addressed gaps.
              </p>
            </div>
          </div>

          {/* Current focus */}
          <div className="mt-8 rounded-2xl bg-brand-50/60 p-6 ring-1 ring-brand-200/70 sm:p-8">
            <div className="flex items-center gap-2">
              <NumberChip n="3" />
              <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900">Current Focus</h3>
              <span className="rounded-full bg-white px-2.5 py-0.5 font-mono text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
                Until further notice
              </span>
            </div>
            <p className="mt-3 text-sm text-stone-700">
              Intentionally narrowing scope to consolidate the codebase as we open it up to more ESP32 e-reader
              devices.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Memory footprint', 'DRAM & heap. ESP32-C3 sets the ceiling.'],
                ['Flash footprint', 'Room for more device targets & features.'],
                ['Code cleanup', 'Refactors, dead code, tighter abstractions.'],
                ['Reading experience', 'EPUB, typography, hyphenation, legibility.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg bg-white p-4 ring-1 ring-brand-200/70">
                  <p className="font-semibold text-stone-900">{title}</p>
                  <p className="mt-1 text-xs text-stone-600">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-lg bg-white px-4 py-3 ring-1 ring-stone-300">
              <p className="font-mono text-xs font-semibold tracking-wide text-stone-700 uppercase">
                Temporarily closed
              </p>
              <p className="mt-1 text-sm text-stone-700">
                <strong className="font-semibold text-stone-900">New themes</strong> (theming surface is frozen) and{' '}
                <strong className="font-semibold text-stone-900">new external network connectors</strong> (sync
                engines, cloud storage, OPDS extensions, remote file access). Open a Discussion first if you're
                unsure.
              </p>
            </div>
          </div>

          {/* Scope: In / Out */}
          <div className="mt-10">
            <div className="flex items-center gap-2">
              <NumberChip n="4" />
              <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900">Scope</h3>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {/* In-Scope */}
              <div className="rounded-2xl bg-white p-6 ring-1 ring-brand-200/60 sm:p-7">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
                    <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    In-scope
                  </span>
                  <span className="text-xs text-stone-500">Improves reading or maintainability</span>
                </div>
                <ul className="mt-4 space-y-3 text-sm">
                  {[
                    ['EPUB Rendering & Optimization', 'Rendering engine, CSS/image handling, parsing performance.'],
                    ['Typography & Legibility', 'Fonts, hyphenation, spacing, margins.'],
                    ['E-Ink Driver Refinement', 'Fewer full-screen flashes, better ghosting management.'],
                    ['Reading UX', 'Bookmarks, progress, button mapping, navigation.'],
                    ['Library Management', 'Simple, intuitive local-collection organization.'],
                    ['Local Transfer', 'Pull-based loading via web server or widely-used standards.'],
                    ['Reference Tools', 'Local, offline dictionary lookup.'],
                    [
                      'Memory, Flash & Code Quality',
                      'Refactors that reduce resource use, even without a user-visible feature.',
                    ],
                    [
                      'Bootloader / Recovery Bridge',
                      'Helps users on locked devices reach any community firmware safely.',
                    ],
                  ].map(([title, body]) => (
                    <li key={title}>
                      <strong className="font-semibold text-stone-900">{title}</strong>
                      <p className="text-stone-600">{body}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Out-of-Scope */}
              <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-300/70 sm:p-7">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-stone-700 ring-1 ring-stone-300">
                    <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                    Out-of-scope
                  </span>
                  <span className="text-xs text-stone-500">Compromises stability or mission</span>
                </div>
                <ul className="mt-4 space-y-3 text-sm">
                  {[
                    ['Interactive Apps', 'No notepads, calculators, or games.'],
                    ['Writing / Authoring Tools', 'Input hardware and RAM are wrong for this.'],
                    ['Active Connectivity', 'No RSS, news aggregators, or web browsers.'],
                    ['Media Playback', 'No audio players or audiobooks.'],
                    ['Complex Annotation', 'No typed-out notes.'],
                    ['Stock-firmware duplication', "If it already works well, we don't reimplement it."],
                    ['Fork duplication', 'If another popular fork solves it well, we defer.'],
                    [
                      'PDF Rendering',
                      'Fixed layout makes for a poor e-ink reading experience on this hardware class.',
                    ],
                  ].map(([title, body]) => (
                    <li key={title}>
                      <strong className="font-semibold text-stone-900">{title}</strong>
                      <p className="text-stone-600">{body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Idea evaluation */}
          <div className="relative mt-10 overflow-hidden rounded-2xl bg-stone-900 p-6 text-stone-100 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 dot-field text-white/[0.05] [mask-image:radial-gradient(100%_100%_at_50%_0%,black,transparent_80%)]"
            />
            <div className="relative">
              <div className="flex items-center gap-2">
                <NumberChip n="5" dark />
                <h3 className="font-display text-lg font-semibold tracking-tight text-white">Idea Evaluation</h3>
              </div>
              <p className="mt-3 text-sm text-stone-400">Before proposing a feature, ask:</p>
              <ol className="mt-4 space-y-2.5 text-sm">
                {[
                  <>
                    Does the stock firmware already handle this well?{' '}
                    <span className="text-stone-500">If yes, we pass.</span>
                  </>,
                  <>
                    Does another popular CrossPoint fork already handle this well?{' '}
                    <span className="text-stone-500">If yes, we usually defer.</span>
                  </>,
                  <>Does it improve the core reading experience, or reduce memory / flash / code complexity?</>,
                  <>
                    Is it in one of the temporarily closed areas?{' '}
                    <span className="text-stone-500">If yes, wait.</span>
                  </>,
                  <>
                    Would adding it make the codebase harder to clean up or port to other devices?{' '}
                    <span className="text-stone-500">If yes, rework or defer.</span>
                  </>,
                ].map((body, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-stone-800 font-mono text-[10px] font-bold text-stone-300">
                      {i + 1}
                    </span>
                    <span className="text-stone-200">{body}</span>
                  </li>
                ))}
              </ol>
              <blockquote className="mt-5 border-l-4 border-brand-400 pl-4 font-serif text-sm text-stone-300 italic">
                <strong className="font-semibold text-white not-italic">Note to contributors:</strong> CrossPoint is
                intentionally narrow. "It would be cool if..." features are not enough; the bar is "this fixes
                something the stock firmware does poorly, or it makes the firmware leaner and easier to maintain."
              </blockquote>
            </div>
          </div>

          {/* Calls to action */}
          <div className="mt-12">
            <div className="flex items-center gap-2">
              <NumberChip n="6" />
              <h3 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Calls to Action</h3>
            </div>
            <p className="mt-3 text-stone-600">
              Where contributor help is most valuable right now. Open a Discussion or issue first so we can
              coordinate.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-display font-semibold text-stone-900">
                    Theme System: Move Themes Off-Firmware
                  </h4>
                  <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-stone-700 uppercase ring-1 ring-stone-300">
                    Help wanted
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  Abstract themes out of firmware so they load from SD card instead of consuming flash.
                </p>
                <p className="mt-3 text-xs text-stone-500">
                  <strong className="font-semibold text-stone-700">Status:</strong>{' '}
                  <a
                    href="https://github.com/itsthisjustin"
                    target="_blank"
                    rel="noopener"
                    className="text-brand-600 underline underline-offset-2"
                  >
                    @itsthisjustin
                  </a>{' '}
                  plans to take this on eventually but is open to someone claiming it sooner.
                </p>
              </div>

              <div className="rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-display font-semibold text-stone-900">
                    SDK Abstraction for All ESP32 E-Readers
                  </h4>
                  <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-brand-700 uppercase">
                    In progress
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  Generalize SDK layers (display, input, storage, battery) away from Xteink-specific assumptions.
                </p>
                <p className="mt-3 text-xs text-stone-500">
                  <strong className="font-semibold text-stone-700">Status:</strong>{' '}
                  <a
                    href="https://github.com/jeremydk"
                    target="_blank"
                    rel="noopener"
                    className="text-brand-600 underline underline-offset-2"
                  >
                    @jeremydk
                  </a>{' '}
                  is actively working. Coordinate before touching{' '}
                  <code className="rounded bg-stone-100 px-1 font-mono text-[0.85em]">open-x4-sdk/</code> or{' '}
                  <code className="rounded bg-stone-100 px-1 font-mono text-[0.85em]">lib/hal/</code>.
                </p>
              </div>

              <div className="rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-display font-semibold text-stone-900">
                    Bootloader / Recovery Bridge for Locked Devices
                  </h4>
                  <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-brand-700 uppercase">
                    In progress
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  Bootloader / recovery-flash workflow that lets users reach <em>any</em> community firmware without
                  bricking, with a recoverable fallback when a flash goes wrong.
                </p>
                <p className="mt-3 text-xs text-stone-500">
                  <strong className="font-semibold text-stone-700">Status:</strong>{' '}
                  <a
                    href="https://github.com/jeremydk"
                    target="_blank"
                    rel="noopener"
                    className="text-brand-600 underline underline-offset-2"
                  >
                    @jeremydk
                  </a>{' '}
                  alongside SDK abstraction. ESP32 bootloader / OTA experience welcome.
                </p>
              </div>

              <div className="rounded-xl bg-white p-6 ring-1 ring-stone-950/5">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-display font-semibold text-stone-900">
                    Identifying Other Stock-Firmware Gaps
                  </h4>
                  <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-stone-700 uppercase ring-1 ring-stone-300">
                    Help wanted
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  Catalogue what stock (and other popular forks) handle poorly: RTL text, underserved languages,
                  rendering edge cases, accessibility, input quirks.
                </p>
                <p className="mt-3 text-xs text-stone-500">
                  Feedback even without code is genuinely useful, so open a Discussion with screenshots, sample
                  EPUBs, and expected vs actual behavior.
                </p>
              </div>
            </div>
          </div>

          {/* Funding */}
          <div className="mt-12 rounded-2xl bg-stone-50 p-6 ring-1 ring-royalty/30 sm:p-8">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-royalty font-mono text-xs font-bold text-white">
                7
              </span>
              <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900">
                Funding &amp; Contributor Sustainability
              </h3>
            </div>
            <p className="mt-3 text-sm text-stone-700">
              CrossPoint uses{' '}
              <a
                href="https://royalty.dev"
                target="_blank"
                rel="noopener"
                className="font-semibold text-brand-700 underline underline-offset-2"
              >
                Royalty.dev
              </a>{' '}
              (a product built by{' '}
              <a
                href="https://github.com/itsthisjustin"
                target="_blank"
                rel="noopener"
                className="font-semibold text-brand-700 underline underline-offset-2"
              >
                @itsthisjustin
              </a>
              ) to fund contributors. There has been some tension in the community around this, so the intent is
              being clarified here directly.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-mono text-xs font-semibold tracking-wide text-stone-500 uppercase">
                  Why we do this
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-stone-700">
                  <li>
                    • Long-term contributor interest, in response to community requests for a way to give back.
                  </li>
                  <li>
                    • Motivate investment in the <em>core</em> project rather than spinning up competing forks.
                  </li>
                  <li>• Pay for new ESP32 devices to port CrossPoint to additional hardware.</li>
                  <li>• Give the project a credible long-term path to sustainability.</li>
                </ul>
              </div>
              <div>
                <p className="font-mono text-xs font-semibold tracking-wide text-stone-500 uppercase">How it works</p>
                <ul className="mt-2 space-y-1.5 text-sm text-stone-700">
                  <li>• Distributed automatically based on impact and tenure.</li>
                  <li>
                    • Over <strong className="font-semibold text-stone-900">$600</strong> raised in the first few
                    days of opening funding.
                  </li>
                  <li>
                    • Scoring methodology is published at{' '}
                    <a
                      href="https://app.royalty.dev/transparency"
                      target="_blank"
                      rel="noopener"
                      className="text-brand-700 underline underline-offset-2"
                    >
                      app.royalty.dev/transparency
                    </a>
                    .
                  </li>
                </ul>
              </div>
            </div>
            <p className="mt-5 text-xs text-stone-600">
              <strong className="font-semibold text-stone-900">This is not fixed in stone.</strong> Weighting,
              eligibility, and distribution rules can be tweaked. If you have concerns or suggestions, open a
              Discussion. The goal is a system that fairly recognizes the people doing the work, not a perfect one on
              day one.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  )
}
