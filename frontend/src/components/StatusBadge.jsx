import { theme } from '../theme'

// Mapping statut commande → variante theme.badge (source unique, remplace les
// couleurs inline dupliquées entre OrdersPage / StockPage / etc.)
const ORDER_STATUS_VARIANT = {
  scheduled:        'info',
  pending:          'warning',
  no_answer_1:      'warning',
  no_answer_2:      'warning',
  no_answer_3:      'warning',
  confirmed:        'success',
  shipped:          'info',
  delivered:        'success',
  returned:         'danger',
  cancel_requested: 'danger',
  cancelled:        'danger',
}

const ORDER_STATUS_LABEL = {
  scheduled:        'Programmée',
  pending:          'En attente',
  no_answer_1:      'Non joignable — 1ère tentative',
  no_answer_2:      'Non joignable — 2ème tentative',
  no_answer_3:      'Non joignable — 3ème tentative',
  confirmed:        'Confirmée',
  shipped:          'Expédiée',
  delivered:        'Livrée',
  returned:         'Retournée',
  cancel_requested: 'Annulation demandée',
  cancelled:        'Annulée',
}

export default function StatusBadge({ status, label, variant, children }) {
  const cls = theme.badge[variant || ORDER_STATUS_VARIANT[status]] || theme.badge.neutral
  return <span className={cls}>{children || label || ORDER_STATUS_LABEL[status] || status}</span>
}

export { ORDER_STATUS_VARIANT, ORDER_STATUS_LABEL }
