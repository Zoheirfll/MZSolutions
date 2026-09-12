import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../../api/axios'
import { theme } from '../../theme'

export default function PlatformAdminStoreOrdersPage() {
  const { storeId } = useParams()
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    setLoading(true)
    api.get(`/platform-admin/stores/${storeId}/orders/`, { params: { per_page: 50 } })
      .then(({ data }) => setOrders(data.results))
      .catch(err => setError(err.response?.data?.detail || 'Boutique introuvable ou service inactif.'))
      .finally(() => setLoading(false))
  }, [storeId])

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link to="/platform-admin/boutiques" className={theme.btn.ghost}>← Boutiques</Link>
        <h1 className="text-xl font-bold text-app-primary">Commandes (lecture seule)</h1>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</p>}

      {!error && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Wilaya</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-app-muted">Chargement…</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-app-muted">Aucune commande.</td></tr>}
              {!loading && orders.map(o => (
                <tr key={o.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                  <td className="px-4 py-3 text-app-primary">{o.first_name} {o.last_name}</td>
                  <td className="px-4 py-3 text-app-muted">{o.phone}</td>
                  <td className="px-4 py-3 text-app-muted">{o.wilaya}</td>
                  <td className="px-4 py-3 text-app-muted">{o.status}</td>
                  <td className="px-4 py-3 text-app-muted">{o.total} DA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
