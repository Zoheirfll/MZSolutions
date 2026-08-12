import { theme } from '../theme'

// Mapping statut commande → variante theme.badge (source unique, remplace les
// couleurs inline dupliquées entre OrdersPage / StockPage / etc.)
const ORDER_STATUS_VARIANT = {
  scheduled:        'info',
  pending:          'warning',
  no_answer_1:      'warning',
  no_answer_2:      'warning',
  no_answer_3:      'warning',
  no_answer:        'warning',
  confirmed:        'success',
  preparing:        'info',
  prepared:         'info',
  in_progress:      'info',
  shipped:          'info',
  out_for_delivery: 'info',
  delivered:        'success',
  returned:         'danger',
  cancel_requested: 'danger',
  cancelled:        'danger',
  duplicate:        'neutral',
  fake:             'neutral',
}

const ORDER_STATUS_LABEL = {
  scheduled:        'Programmée',
  pending:          'En attente',
  no_answer_1:      'Non joignable — 1ère tentative',
  no_answer_2:      'Non joignable — 2ème tentative',
  no_answer_3:      'Non joignable — 3ème tentative',
  no_answer:        'Sans réponse',
  confirmed:        'Confirmée',
  preparing:        'Préparation de commande',
  prepared:         'Préparée',
  in_progress:      'En cours',
  shipped:          'Expédiée',
  out_for_delivery: 'Sorti en livraison',
  delivered:        'Livrée',
  returned:         'Retournée',
  cancel_requested: 'Annulation demandée',
  cancelled:        'Annulée',
  duplicate:        'Commande double',
  fake:             'Commande fictive',
}

export default function StatusBadge({ status, label, variant, children }) {
  const cls = theme.badge[variant || ORDER_STATUS_VARIANT[status]] || theme.badge.neutral
  return <span className={cls}>{children || label || ORDER_STATUS_LABEL[status] || status}</span>
}

export { ORDER_STATUS_VARIANT, ORDER_STATUS_LABEL }
