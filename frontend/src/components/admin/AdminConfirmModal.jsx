import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { theme } from '../../theme'

// Modale de confirmation des pages admin : libellé du bouton configurable, zone
// libre (children) pour un champ de saisie (ex. motif), se ferme avec Échap ou
// au clic à l'extérieur. `ConfirmDialog` du dashboard ne convient pas (bouton
// « Supprimer » figé).
export default function AdminConfirmModal({ open, title, message, confirmLabel, danger, busy, confirmDisabled, onConfirm, onCancel, children }) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="w-full max-w-md rounded-xl border p-5 shadow-xl" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        {title && <h2 className="text-base font-semibold text-app-primary mb-2">{title}</h2>}
        {message && <p className="text-sm text-app-muted-light mb-4">{message}</p>}
        {children}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onCancel} className={theme.btn.outline}>{t('Annuler')}</button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled}
            className={danger ? theme.btn.danger : theme.btn.primary}>{confirmLabel || t('Confirmer')}</button>
        </div>
      </div>
    </div>
  )
}
