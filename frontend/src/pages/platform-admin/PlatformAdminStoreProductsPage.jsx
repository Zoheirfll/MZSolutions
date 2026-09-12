import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../../api/axios'
import { theme } from '../../theme'

export default function PlatformAdminStoreProductsPage() {
  const { storeId } = useParams()
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    setLoading(true)
    api.get(`/platform-admin/stores/${storeId}/products/`, { params: { per_page: 50 } })
      .then(({ data }) => setProducts(data.results))
      .catch(err => setError(err.response?.data?.detail || 'Boutique introuvable ou service inactif.'))
      .finally(() => setLoading(false))
  }, [storeId])

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link to="/platform-admin/boutiques" className={theme.btn.ghost}>← Boutiques</Link>
        <h1 className="text-xl font-bold text-app-primary">Produits (lecture seule)</h1>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</p>}

      {!error && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Prix</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Actif</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-app-muted">Chargement…</td></tr>}
              {!loading && products.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-app-muted">Aucun produit.</td></tr>}
              {!loading && products.map(p => (
                <tr key={p.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                  <td className="px-4 py-3 text-app-primary">{p.name}</td>
                  <td className="px-4 py-3 text-app-muted">{p.price} DA</td>
                  <td className="px-4 py-3 text-app-muted">{p.total_stock ?? p.stock}</td>
                  <td className="px-4 py-3 text-app-muted">{p.is_active ? 'Oui' : 'Non'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
