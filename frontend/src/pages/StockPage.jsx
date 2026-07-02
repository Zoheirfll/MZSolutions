import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { theme } from '../theme'

export default function StockPage() {
  const [data, setData]       = useState({ threshold: 5, count: 0, results: [] })
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState(5)
  const [saving, setSaving]   = useState(false)

  const fetchStock = () => {
    setLoading(true)
    api.get('/products/low-stock/')
      .then(({ data }) => { setData(data); setThreshold(data.threshold) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchStock() }, [])

  const saveThreshold = async () => {
    setSaving(true)
    try {
      await api.put('/stores/me/settings/', { low_stock_threshold: threshold })
      fetchStock()
    } catch {} finally { setSaving(false) }
  }

  return (
    <DashboardLayout title="Stock & Inventaire">
      {/* Réglage seuil */}
      <div className="rounded-xl border p-5 mb-5 flex items-center gap-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-200 mb-0.5">Seuil d'alerte stock bas</p>
          <p className="text-xs" style={{ color: theme.dark.muted }}>Les produits avec un stock ≤ à ce seuil apparaissent ici.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number" min="0"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-20 px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 text-center"
            style={{ borderColor: theme.dark.border }}
          />
          <button
            onClick={saveThreshold}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition"
            style={{ background: '#7c3aed' }}
          >
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Bannière résumé */}
      <div className="flex items-center gap-3 mb-5">
        <div className="rounded-xl border px-5 py-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-2xl font-bold text-red-400">{data.count}</p>
          <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>articles en stock bas (≤ {data.threshold})</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">VARIANTE</th>
              <th className="px-4 py-3 font-medium">OPTION</th>
              <th className="px-4 py-3 font-medium">STOCK</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-500">Chargement…</td></tr>
            ) : data.results.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12">
                  <p className="text-2xl mb-2">✅</p>
                  <p className="text-gray-500 text-sm">Tous les stocks sont au-dessus du seuil.</p>
                </td>
              </tr>
            ) : data.results.map((item, i) => (
              <tr key={i} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{item.product_name}</td>
                <td className="px-4 py-3 text-gray-400">{item.variant_name || '—'}</td>
                <td className="px-4 py-3 text-gray-400">{item.option_value || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    item.stock === 0 ? 'bg-red-900/30 text-red-400' : 'bg-amber-900/30 text-amber-400'
                  }`}>
                    {item.stock === 0 ? 'Épuisé' : `${item.stock} restant${item.stock > 1 ? 's' : ''}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
