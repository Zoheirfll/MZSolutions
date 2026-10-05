import { useTranslation } from 'react-i18next'
import { theme } from '../../theme'

export function AdminError({ message, onRetry }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border p-6 text-center" style={{ background: theme.dark.card, borderColor: '#7f1d1d' }}>
      <p className="text-sm text-red-400 mb-3">{message || t('Impossible de charger les données.')}</p>
      {onRetry && <button onClick={onRetry} className={theme.btn.outline}>{t('Réessayer')}</button>}
    </div>
  )
}

export function AdminEmpty({ title, description }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border p-10 text-center" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <p className="text-sm font-medium text-app-primary">{title || t('Aucun résultat')}</p>
      {description && <p className="text-xs text-app-muted mt-1">{description}</p>}
    </div>
  )
}
