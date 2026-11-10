export default function ShopSupportNote({ children, className = '' }) {
  return (
    <div className={`flex items-start gap-2 font-hand text-xl/6 font-medium text-brand-800 ${className}`}>
      <svg
        className="w-10 shrink-0"
        viewBox="0 0 40 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M36 36 C 12 36, 6 23, 8 4" />
        <path d="M2 11 L8 4 L15 10" />
      </svg>
      <p className="-rotate-2">{children}</p>
    </div>
  )
}
