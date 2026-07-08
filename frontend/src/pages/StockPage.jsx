import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import Select from '../components/Select'
import api from '../api/axios'
import { theme } from '../theme'

const PER_PAGE_OPTIONS = [20, 50, 100]

export default function StockPage() {
  const [lowStock, setLowStock]   = useState({ threshold: 5, count: 0, results: [] })
  const [threshold, setThreshold] = useState(5)
  const [saving, setSaving]       = useState(false)

  const [inventory, setInventory] = useState({ results: [], count: 0, page: 1, per_page: 20 })
  const [invLoading, setInvLoading] = useState(true)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [perPage, setPerPage]     = useState(20)

  const fetchLowStock = () => {
    api.get('/products/low-stock/')
      .then(({ data }) => { setLowStock(data); setThreshold(data.threshold) })
      .catch(() => {})
  }

  const fetchInventory = useCallback(() => {
    setInvLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search) params.set('search', search)
    api.get(`/products/inventory/?${params}`)
      .then(({ data }) => setInventory(data))
      .catch(() => {})
      .finally(() => setInvLoading(false))
  }, [page, perPage, search])

  useEffect(() => { fetchLowStock() }, [])
  useEffect(() => { fetchInventory() }, [fetchInventory])

  const saveThreshold = async () => {
    setSaving(true)
    try {
      await api.put('/stores/me/settings/', { low_stock_threshold: threshold })
      fetchLowStock()
    } catch {} finally { setSaving(false) }
  }

  const totalPages = Math.max(1, Math.ceil(inventory.count / perPage))

  return (
    <DashboardLayout title="Stock & Inventaire">
      {/* Réglage seuil */}
      <div className="rounded-xl border p-5 mb-5 flex items-center gap-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-200 mb-0.5">Seuil d'alerte stock bas</p>
          <p className="text-xs" style={{ color: theme.dark.muted }}>Les produits avec un stock ≤ à ce seuil sont signalés ci-dessous.</p>
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
            className={theme.btn.primary + ' text-sm px-4 py-2'}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Bannière résumé stock bas */}
      <div className="flex items-center gap-3 mb-8">
        <div className="rounded-xl border px-5 py-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-2xl font-bold text-red-400">{lowStock.count}</p>
          <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>articles en stock bas (≤ {lowStock.threshold}) — mis en évidence en orange/rouge ci-dessous</p>
        </div>
      </div>

      {/* Inventaire complet */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-base font-semibold text-gray-200">Inventaire complet</h2>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Recherche par produit"
          className="px-3.5 py-2 rounded-lg text-sm text-gray-200 border outline-none focus:border-violet-500 transition w-full sm:w-64"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-150">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">VARIANTE</th>
              <th className="px-4 py-3 font-medium">OPTION</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">STOCK</th>
            </tr>
          </thead>
          <tbody>
            {invLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-b" style={{ borderColor: theme.dark.borderRowHover }}>
                  <td className="px-4 py-3"><div className={theme.skeleton + ' h-4 w-32'} /></td>
                  <td className="px-4 py-3"><div className={theme.skeleton + ' h-4 w-16'} /></td>
                  <td className="px-4 py-3"><div className={theme.skeleton + ' h-4 w-16'} /></td>
                  <td className="px-4 py-3"><div className={theme.skeleton + ' h-4 w-16'} /></td>
                  <td className="px-4 py-3"><div className={theme.skeleton + ' h-4 w-20'} /></td>
                </tr>
              ))
            ) : inventory.results.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="flex flex-col items-center justify-center text-center py-12 px-6 text-gray-500">
                    <p className="text-sm">Aucun produit trouvé.</p>
                  </div>
                </td>
              </tr>
            ) : inventory.results.map((item, i) => (
              <tr key={i} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{item.product_name}</td>
                <td className="px-4 py-3 text-gray-400">{item.variant_name || '—'}</td>
                <td className="px-4 py-3 text-gray-400">{item.option_value || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs font-mono">{item.sku || '—'}</td>
                <td className="px-4 py-3">
                  <span className={item.stock === 0 ? theme.badge.danger : item.stock <= lowStock.threshold ? theme.badge.warning : theme.badge.success}>
                    {item.stock}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inventory.count > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <div className="flex items-center gap-2 text-xs">
            <span>{inventory.count} article{inventory.count !== 1 ? 's' : ''} — Lignes par page :</span>
            <Select value={perPage} onChange={v => { setPerPage(Number(v)); setPage(1) }}
              options={PER_PAGE_OPTIONS.map(n => ({ value: n, label: n }))}
              className="px-2 py-1 rounded-lg border text-gray-300 text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">← Précédent</button>
            <span className={theme.badge.info}>{page}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">Suivant →</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
