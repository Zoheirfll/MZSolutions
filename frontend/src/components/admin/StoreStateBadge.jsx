import { useTranslation } from 'react-i18next'
import { theme } from '../../theme'

// État commercial d'une boutique (calculé côté serveur : account_views.store_state).
const STATES = {
  trial: { label: 'En essai', cls: theme.badge.info },
  subscribed: { label: 'Abonnée', cls: theme.badge.success },
  expired: { label: 'Expirée', cls: theme.badge.warning },
  suspended: { label: 'Suspendue', cls: theme.badge.danger },
}

export const STATE_OPTIONS = ['trial', 'subscribed', 'expired', 'suspended']

export function stateLabel(state) {
  return STATES[state]?.label || state
}

export default function StoreStateBadge({ state }) {
  const { t } = useTranslation()
  const s = STATES[state]
  if (!s) return <span className={theme.badge.neutral}>{state}</span>
  return <span className={s.cls}>{t(s.label)}</span>
}
