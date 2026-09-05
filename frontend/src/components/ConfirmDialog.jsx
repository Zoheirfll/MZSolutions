import { theme } from '../theme'

// Modale de confirmation stylée — remplace le `window.confirm()` natif du
// navigateur (popup moche, non stylable, incohérente avec le thème sombre).
// `open` = {message, onConfirm} | null.
export default function ConfirmDialog({ open, onCancel }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl border p-5 bg-app-card border-app shadow-xl animate-[fadeIn_0.15s_ease]">
        <p className="text-sm text-app-primary mb-4">{open.message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={theme.btn.outline + ' text-sm'}>
            Annuler
          </button>
          <button type="button" onClick={open.onConfirm}
            className="text-sm px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}
