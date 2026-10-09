import { useTranslation } from 'react-i18next'
import { useAiQuota } from '../lib/aiQuota'

// Reste de quota IA d'une fonctionnalité (aujourd'hui / cette semaine), à placer à côté du bouton IA.
// Rien n'est affiché si la fonctionnalité est illimitée pour le palier.
export default function AIQuotaBadge({ feature, className = '' }) {
  const { t } = useTranslation('dashboard')
  const q = useAiQuota(feature)
  if (!q || !q.enabled || (!q.daily && !q.weekly)) return null
  const empty = (q.daily && q.daily.remaining === 0) || (q.weekly && q.weekly.remaining === 0)
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 text-xs ${empty ? 'text-red-400' : 'text-app-muted-light'} ${className}`}
      title={t('Quota IA de votre palier, pour toute la boutique')}>
      {q.daily && <span>{t("Aujourd'hui")} : <strong>{q.daily.remaining}</strong>/{q.daily.limit}</span>}
      {q.weekly && <span>{t('Cette semaine')} : <strong>{q.weekly.remaining}</strong>/{q.weekly.limit}</span>}
    </span>
  )
}
