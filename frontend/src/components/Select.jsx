import { useEffect, useRef, useState } from 'react'
import { theme } from '../theme'

// Custom dropdown replacing the native <select>. Windows/Chrome renders
// native selects with OS chrome that ignores almost all authored CSS
// (background, text color) — appearance:none, color-scheme and
// forced-color-adjust all failed to override it on some machines, so this
// draws the list entirely in React/Tailwind instead.
export default function Select({ value, onChange, options, placeholder = 'Sélectionner…', className = '', style, disabled = false, variant = 'dark' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const selected = options.find(o => String(o.value) === String(value))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={style}
        className={`${className} flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className={`truncate ${selected ? '' : 'opacity-50'}`}>{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          width="14" height="14" className={`shrink-0 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full max-h-64 overflow-y-auto rounded-lg border shadow-xl py-1"
          style={variant === 'light' ? { background: '#ffffff', borderColor: '#e5e7eb' } : { background: theme.dark.sidebar, borderColor: theme.dark.border }}>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors duration-100 cursor-pointer ${
                String(o.value) === String(value)
                  ? (variant === 'light' ? 'bg-violet-50 text-violet-700' : 'bg-violet-600/20 text-violet-300')
                  : (variant === 'light' ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 hover:bg-white/6')
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
