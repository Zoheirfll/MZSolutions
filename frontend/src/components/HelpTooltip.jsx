import { useState, useEffect, useRef } from 'react'
import { theme } from '../theme'

// Icône "?" avec popover d'aide contextuelle — même look que le bouton
// d'aide de page (DashboardLayout.jsx::PageInfoButton) mais réutilisable
// n'importe où dans une page (ex. à côté d'un titre de section précis).
export default function HelpTooltip({ title, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative inline-block shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={title || 'Aide'}
        aria-expanded={open}
        className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-bold border border-(--border-color-hover) text-app-muted-light hover:text-violet-400 hover:border-violet-500/40 hover:bg-violet-500/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        ?
      </button>
      {open && (
        <div
          className="absolute z-50 top-6 left-0 w-72 rounded-xl border p-3.5 text-xs leading-relaxed text-app-primary shadow-xl space-y-1.5"
          style={{ background: theme.dark.sidebar, borderColor: theme.dark.borderHover, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}
        >
          {title && <p className="text-[10px] font-semibold tracking-widest text-violet-400">{title}</p>}
          <div className="whitespace-pre-line">{children}</div>
        </div>
      )}
    </div>
  )
}
