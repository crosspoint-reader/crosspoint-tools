import Modal from './Modal.jsx'

// Device picker that links out to the Xteink store for the unlocked developer edition.

const DEVICES = [
  { name: 'Xteink X4', note: 'Developer Edition', href: 'https://go.sjv.io/2RV5N7' },
  { name: 'Xteink X4 Pro', note: 'Developer Edition', href: 'https://go.sjv.io/xJXY9d' },
  { name: 'Xteink X3', note: 'Developer Edition', href: 'https://go.sjv.io/m4oEmM' },
  {
    name: 'Seeed Studio Sticky (Coming Soon)',
    // note: 'Use coupon code CROSSPOINT for 5% off',
    disabled: true,
  },
]

export default function BuyModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Buy CrossPoint Supported Devices">
      <div className="space-y-5">
        <div>
          <div className="text-sm font-semibold text-stone-900">Select your device</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {DEVICES.map((d) =>
              d.disabled ? (
                <div
                  key={d.name}
                  className="relative cursor-not-allowed rounded-xl border border-stone-200 bg-stone-50 p-4 opacity-60"
                >
                  <div className="text-sm font-semibold text-stone-500">{d.name}</div>
                  {d.note && <div className="mt-0.5 text-xs text-stone-400">{d.note}</div>}
                </div>
              ) : (
                <a
                  key={d.name}
                  href={d.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative rounded-xl border border-stone-200 p-4 no-underline hover:border-brand-500 hover:bg-brand-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-stone-900">{d.name}</div>
                    <svg className="size-4 shrink-0 text-stone-300 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                  <div className="mt-0.5 text-xs text-stone-400">{d.note}</div>
                </a>
              )
            )}
          </div>
        </div>

        <p className="text-xs/5 text-stone-400">Links open in a new tab.</p>
      </div>
    </Modal>
  )
}
