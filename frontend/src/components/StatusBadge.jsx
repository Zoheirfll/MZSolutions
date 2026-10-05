import { theme } from '../theme'
import { tt } from '../i18n'

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
  scheduled:        tt('Programmée'),
  pending:          tt('En attente'),
  no_answer_1:      tt('Non joignable — 1ère tentative'),
  no_answer_2:      tt('Non joignable — 2ème tentative'),
  no_answer_3:      tt('Non joignable — 3ème tentative'),
  no_answer:        tt('Sans réponse'),
  confirmed:        tt('Confirmée'),
  preparing:        tt('Préparation de commande'),
  prepared:         tt('Préparée'),
  in_progress:      tt('En cours'),
  shipped:          tt('Expédiée'),
  out_for_delivery: tt('Sorti en livraison'),
  delivered:        tt('Livrée'),
  returned:         tt('Retournée'),
  cancel_requested: tt('Annulation demandée'),
  cancelled:        tt('Annulée'),
  duplicate:        tt('Commande double'),
  fake:             tt('Commande fictive'),
}

export default function StatusBadge({ status, label, variant, children }) {
  const cls = theme.badge[variant || ORDER_STATUS_VARIANT[status]] || theme.badge.neutral
  return <span className={cls}>{children || label || ORDER_STATUS_LABEL[status] || status}</span>
}

export { ORDER_STATUS_VARIANT, ORDER_STATUS_LABEL }
