import { useEffect } from 'react'
import { theme } from '../theme'

// Notification légère en bas à droite — remplace les `alert()` natifs du
// navigateur (moches, bloquants, non stylables). `toast` = {message, type}
// ('success'|'error'|'info'), `onClose` appelé automatiquement après 4s.
export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [toast, onClose])

  if (!toast) return null

  const colors = {
    success: { border: '#10b98140', bg: 'rgba(16,185,129,0.08)', text: '#34d399' },
    error:   { border: '#ef444440', bg: 'rgba(239,68,68,0.08)',  text: '#f87171' },
    info:    { border: theme.dark.border, bg: theme.dark.card,   text: 'var(--text-primary)' },
  }[toast.type || 'info']

  return (
    <div
      className="fixed bottom-5 right-5 z-100 max-w-sm rounded-xl border px-4 py-3 shadow-xl flex items-start gap-3 animate-[fadeIn_0.2s_ease]"
      style={{ background: colors.bg, borderColor: colors.border }}
      role="status"
    >
      <p className="text-sm flex-1" style={{ color: colors.text }}>{toast.message}</p>
      <button onClick={onClose} className="text-xs shrink-0 cursor-pointer opacity-60 hover:opacity-100 transition" style={{ color: colors.text }}>
        ✕
      </button>
    </div>
  )
}
