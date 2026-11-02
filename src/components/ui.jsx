// Shared primitives so spacing, button styling and eyebrows stay consistent
// across every page.

export function Button({ as = 'a', variant = 'outline', className = '', children, ...props }) {
  const Tag = as
  const base =
    'inline-flex items-center justify-center gap-x-2 rounded-sm px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
  const variants = {
    primary:
      'bg-brand-700 text-white hover:bg-brand-800 focus-visible:outline-brand-500',
    outline:
      'bg-stone-50 text-stone-900 ring-1 ring-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-stone-400',
    royalty:
      'bg-royalty text-white shadow-sm hover:bg-royalty-dark focus-visible:outline-royalty',
  }
  return (
    <Tag className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </Tag>
  )
}

// Small editorial labels shared across pages.
export function Eyebrow({ children, className = '' }) {
  return (
    <p className={`inline-block font-mono text-[10px]/6 font-medium tracking-[0.12em] uppercase text-brand-700 ${className}`}>
      {children}
    </p>
  )
}

// Outer (padding + optional bg) / inner (max-width + centering) section shell.
export function Section({ id, className = '', innerClassName = '', children }) {
  return (
    <section id={id} className={`py-20 sm:py-28 ${className}`}>
      <div className={`mx-auto max-w-7xl px-6 lg:px-8 ${innerClassName}`}>{children}</div>
    </section>
  )
}

// Inline "Read more →" text link, used consistently for low-key secondary actions.
export function TextLink({ href = '#', children, className = '', ...props }) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-x-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 ${className}`}
      {...props}
    >
      {children}
      <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
        &rarr;
      </span>
    </a>
  )
}
