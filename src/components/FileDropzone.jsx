import { useRef, useState } from 'react'

// A file picker that also accepts drag and drop. It wraps a real
// <input type="file">, so refs, `onChange` handlers and `input.files` keep
// working as they would with a plain input: dropped files are written to the
// input and a native `change` event is dispatched.

function parseAccept(accept) {
  return (accept || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}

function matchesAccept(file, tokens) {
  if (!tokens.length) return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  return tokens.some((t) => {
    if (t.startsWith('.')) return name.endsWith(t)
    if (t.endsWith('/*')) return type.startsWith(t.slice(0, -1))
    return type === t
  })
}

function describeAccept(tokens) {
  const exts = [...new Set(tokens.filter((t) => t.startsWith('.')))]
  if (exts.length) return exts.join(' or ')
  if (tokens.some((t) => t.startsWith('image/'))) return 'an image'
  return 'a supported file'
}

// Reads every file from dropped items, descending into dropped folders.
async function filesFromDrop(dataTransfer) {
  const entries = [...(dataTransfer.items || [])]
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry?.() : null))
    .filter(Boolean)
  if (!entries.length) return [...dataTransfer.files]

  const out = []
  async function walk(entry) {
    if (entry.isFile) {
      out.push(await new Promise((resolve, reject) => entry.file(resolve, reject)))
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      let batch
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
        for (const child of batch) await walk(child)
      } while (batch.length)
    }
  }
  for (const entry of entries) await walk(entry)
  return out
}

function UploadIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  )
}

function selectionLabel(files, multiple) {
  if (!files?.length) return null
  if (multiple && files.length > 1) return `${files.length} files selected`
  return files[0].name
}

/**
 * @param {object} props
 * @param {string} [props.accept] Same syntax as the input's accept attribute; also filters drops.
 * @param {boolean} [props.multiple]
 * @param {boolean} [props.directory] Pick a folder; dropped folders are read recursively.
 * @param {File|null} [props.file] Controlled selection to display. Omit to show the input's own files.
 * @param {string} [props.placeholder]
 * @param {string} [props.dropLabel]
 * @param {'sm'|'md'} [props.size]
 * @param {(state: {dragOver: boolean, label: string}) => import('react').ReactNode} [props.children]
 *   Custom content; replaces the default label.
 * @param {string} [props.className] Classes for the outer wrapper (layout).
 * @param {string} [props.zoneClassName] Extra classes for the drop target itself.
 */
export default function FileDropzone({
  accept,
  multiple = false,
  directory = false,
  disabled = false,
  file,
  inputRef,
  id,
  name,
  'aria-label': ariaLabel,
  onChange,
  placeholder,
  dropLabel,
  size = 'md',
  className = '',
  zoneClassName,
  children,
}) {
  const ownRef = useRef(null)
  // Bumped on every selection so a slow folder drop can't overwrite a newer pick.
  const selectionRef = useRef(0)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState(null)
  const [ownLabel, setOwnLabel] = useState(null)
  const tokens = parseAccept(accept)
  const many = multiple || directory

  const setRefs = (el) => {
    ownRef.current = el
    if (typeof inputRef === 'function') inputRef(el)
    else if (inputRef) inputRef.current = el
  }

  const handleChange = (e) => {
    selectionRef.current += 1
    setError(null)
    setOwnLabel(selectionLabel(e.target.files, many))
    onChange?.(e)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const token = ++selectionRef.current
    let dropped
    try {
      dropped = directory ? await filesFromDrop(e.dataTransfer) : [...e.dataTransfer.files]
    } catch {
      if (token === selectionRef.current) setError('Could not read the dropped folder. Try again or use the picker.')
      return
    }
    if (token !== selectionRef.current) return
    if (!dropped.length) return
    const accepted = dropped.filter((f) => matchesAccept(f, tokens))
    if (!accepted.length) {
      const what = dropped.length > 1 ? 'None of the dropped files are' : `“${dropped[0].name}” is not`
      setError(`${what} ${describeAccept(tokens)}.`)
      return
    }
    const input = ownRef.current
    if (!input) return
    const dt = new DataTransfer()
    for (const f of many ? accepted : accepted.slice(0, 1)) dt.items.add(f)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const selected = file !== undefined ? selectionLabel(file ? [file] : [], false) : ownLabel
  const defaultPlaceholder = directory
    ? 'Choose or drop a folder…'
    : multiple
      ? 'Choose or drop files…'
      : 'Choose or drop a file…'
  const label = dragOver
    ? dropLabel || (directory ? 'Drop folder' : multiple ? 'Drop files' : 'Drop file')
    : selected || placeholder || defaultPlaceholder

  const sizeCls = size === 'sm' ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm'
  const stateCls = dragOver
    ? 'border-brand-600 bg-brand-50 text-brand-700'
    : selected
      ? 'border-stone-300 bg-stone-50 text-stone-700'
      : 'border-stone-300 bg-stone-50 text-stone-500'
  const zoneCls =
    zoneClassName ??
    `flex w-full min-w-0 items-center justify-center gap-2 rounded-md border border-dashed text-center ${sizeCls} ${stateCls} ${
      disabled ? '' : 'hover:border-stone-400 hover:text-stone-700'
    }`

  return (
    <div className={`min-w-0 ${className}`}>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
        }}
        onDrop={handleDrop}
        className={`${zoneCls} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600 ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
      >
        {children ? (
          children({ dragOver, label })
        ) : (
          <>
            <UploadIcon className={`shrink-0 ${size === 'sm' ? 'size-3.5' : 'size-4'}`} />
            <span className="break-all">{label}</span>
          </>
        )}
        <input
          ref={setRefs}
          type="file"
          id={id}
          name={name}
          aria-label={ariaLabel}
          accept={accept}
          multiple={many || undefined}
          {...(directory ? { webkitdirectory: '' } : {})}
          disabled={disabled}
          className="sr-only"
          onChange={handleChange}
        />
      </label>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
