import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { theme } from '../theme'
import StatusBadge from './StatusBadge'

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

// Modal d'historique de commandes d'un client — réutilisé par ClientsPage,
// AtRiskCustomersPage et BlacklistPage (pas de modèle Customer, on retrouve
// les commandes via `search` sur le téléphone, voir CLAUDE.md).
export default function ClientOrdersModal({ phone, name, onClose }) {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/orders/?search=${encodeURIComponent(phone)}&per_page=50`)
      .then(({ data }) => setOrders((data.results || []).filter(o => o.phone === phone)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [phone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border p-6 max-h-[85vh] overflow-y-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-app-primary">Historique — {name || 'Client'}</h3>
          <button onClick={onClose} className="text-app-muted hover:text-app-primary transition cursor-pointer"><CloseIcon /></button>
        </div>
        <p className="text-xs font-mono mb-5" style={{ color: theme.dark.muted }}>{phone}</p>

        {loading ? (
          <p className="text-sm text-center py-8" style={{ color: theme.dark.muted }}>Chargement…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: theme.dark.muted }}>Aucune commande trouvée pour ce numéro.</p>
        ) : (
          <div className="space-y-2">
            {orders.map(o => (
              <button
                key={o.id}
                onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
                className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-violet-500/5 transition cursor-pointer"
                style={{ background: theme.dark.sidebar }}
              >
                <div>
                  <p className="text-sm text-app-primary font-medium">#{o.id}</p>
                  <p className="text-xs" style={{ color: theme.dark.muted }}>{new Date(o.created_at).toLocaleDateString('fr-DZ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-app-primary">{Number(o.total).toLocaleString('fr-DZ')} DZD</span>
                  <StatusBadge status={o.status} label={o.status_label} />
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-app-muted-light hover:text-app-primary cursor-pointer transition">Fermer</button>
        </div>
      </div>
    </div>
  )
}
