import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../theme'

// Custom dropdown replacing the native <select>. Windows/Chrome renders
// native selects with OS chrome that ignores almost all authored CSS
// (background, text color) — appearance:none, color-scheme and
// forced-color-adjust all failed to override it on some machines, so this
// draws the list entirely in React/Tailwind instead.
//
// The option list is rendered via a portal into document.body, positioned
// with `position: fixed` computed from the trigger's bounding rect — a
// plain `position: absolute` popup gets clipped whenever this Select sits
// inside any ancestor with `overflow-x-auto`/`overflow-hidden` (e.g. a
// horizontally-scrollable table wrapper), which silently cuts the dropdown
// off or forces an unwanted inner scrollbar. The portal escapes that clipping
// entirely, so this Select is always safe to use inside a scrollable table.
export default function Select({ value, onChange, options, placeholder = 'Sélectionner…', className = '', style, disabled = false, variant = 'dark' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const ref = useRef(null)
  const listRef = useRef(null)

  const updateCoords = () => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUpward = spaceBelow < 220 && rect.top > spaceBelow
    setCoords({
      left: rect.left,
      width: rect.width,
      top: openUpward ? undefined : rect.bottom + 6,
      bottom: openUpward ? window.innerHeight - rect.top + 6 : undefined,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updateCoords()
    const onReflow = () => updateCoords()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open])

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && ref.current.contains(e.target)) return
      if (listRef.current && listRef.current.contains(e.target)) return
      setOpen(false)
    }
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
      {open && coords && createPortal(
        <div
          ref={listRef}
          className="fixed z-100 max-h-64 overflow-y-auto rounded-lg border shadow-xl py-1"
          style={{
            left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom,
            ...(variant === 'light' ? { background: '#ffffff', borderColor: '#e5e7eb' } : { background: theme.dark.sidebar, borderColor: theme.dark.border }),
          }}
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors duration-100 cursor-pointer ${
                String(o.value) === String(value)
                  ? (variant === 'light' ? 'bg-violet-50 text-violet-700' : 'bg-violet-600/20 text-violet-300')
                  : (variant === 'light' ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 hover:bg-violet-500/5')
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
