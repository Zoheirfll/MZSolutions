import { theme } from '../theme'
import { useTranslation } from 'react-i18next'

export default function RiskScoreBadge({ score }) {
  const { t } = useTranslation('dashboard')
  if (score === null || score === undefined) {
    return <span className={theme.badge.neutral}>—</span>
  }
  if (score >= 67) return <span className={theme.badge.danger}>{t('Élevé ({{score}})', { score })}</span>
  if (score >= 34) return <span className={theme.badge.warning}>{t('Moyen ({{score}})', { score })}</span>
  return <span className={theme.badge.success}>{t('Faible ({{score}})', { score })}</span>
}
