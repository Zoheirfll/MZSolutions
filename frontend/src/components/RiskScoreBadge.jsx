import { theme } from '../theme'

export default function RiskScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className={theme.badge.neutral}>—</span>
  }
  if (score >= 67) return <span className={theme.badge.danger}>Élevé ({score})</span>
  if (score >= 34) return <span className={theme.badge.warning}>Moyen ({score})</span>
  return <span className={theme.badge.success}>Faible ({score})</span>
}
