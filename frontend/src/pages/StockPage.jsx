import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import Select from '../components/Select'
import api from '../api/axios'
import { theme } from '../theme'

const PER_PAGE_OPTIONS = [20, 50, 100]

const STOCK_FILTER_OPTIONS = [
  { value: '',    label: 'Tout le stock' },
  { value: 'low', label: 'Stock bas uniquement' },
  { value: 'out', label: 'Rupture uniquement' },
]

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function DownloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

function HistoryIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function AdjustIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function AdjustModal({ item, onClose, onSaved }) {
  const [quantity, setQuantity] = useState('')
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    const q = Number(quantity)
    if (!q) { setError('Entrez une quantité positive (entrée) ou négative (sortie).'); return }
    setSaving(true)
    setError('')
    try {
      await api.post('/products/stock/adjust/', {
        product_id: item.product_id, variant_option_id: item.variant_option_id, quantity: q, note,
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'ajustement.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-app-primary">Ajuster le stock</h3>
          <button onClick={onClose} className="text-app-muted hover:text-app-primary transition cursor-pointer"><CloseIcon /></button>
        </div>
        <p className="text-xs mb-5" style={{ color: theme.dark.muted }}>
          {item.product_name}{item.variant_name ? ` — ${item.variant_name} : ${item.option_value}` : ''} · Stock actuel : {item.stock}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Quantité (positive = entrée, négative = sortie) *</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} required
              className={inputCls} style={bdrStyle} placeholder="Ex : 10 ou -3" />
          </div>
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Note (optionnel)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className={inputCls} style={bdrStyle} placeholder="Ex : Réception fournisseur, casse, inventaire…" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-app-muted-light hover:text-app-primary cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {saving ? '…' : 'Ajuster'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MovementsModal({ item, onClose }) {
  const [movements, setMovements] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    api.get(`/products/stock/movements/?product=${item.product_id}&per_page=50`)
      .then(({ data }) => setMovements(data.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [item.product_id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border p-6 max-h-[85vh] overflow-y-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-app-primary">Mouvements de stock — {item.product_name}</h3>
          <button onClick={onClose} className="text-app-muted hover:text-app-primary transition cursor-pointer"><CloseIcon /></button>
        </div>
        {loading ? (
          <p className="text-sm text-center py-8" style={{ color: theme.dark.muted }}>Chargement…</p>
        ) : movements.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: theme.dark.muted }}>Aucun mouvement enregistré pour ce produit.</p>
        ) : (
          <div className="space-y-2">
            {movements.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5" style={{ background: theme.dark.sidebar }}>
                <div>
                  <p className="text-sm text-app-primary">{m.reason_label}{m.option_value ? ` — ${m.option_value}` : ''}</p>
                  <p className="text-xs" style={{ color: theme.dark.muted }}>{new Date(m.created_at).toLocaleString('fr-DZ')}{m.note ? ` · ${m.note}` : ''}</p>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${m.quantity >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {m.quantity >= 0 ? '+' : ''}{m.quantity}
                </span>
              </div>
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

export default function StockPage() {
  const navigate = useNavigate()
  const [lowStock, setLowStock]   = useState({ threshold: 5, count: 0, results: [] })
  const [threshold, setThreshold] = useState(5)
  const [saving, setSaving]       = useState(false)

  const [inventory, setInventory] = useState({ results: [], count: 0, page: 1, per_page: 20 })
  const [invLoading, setInvLoading] = useState(true)
  const [search, setSearch]       = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [perPage, setPerPage]     = useState(20)
  const [adjustingItem, setAdjustingItem] = useState(null)
  const [historyItem, setHistoryItem]     = useState(null)
  const [exporting, setExporting] = useState(false)

  const fetchLowStock = () => {
    api.get('/products/low-stock/')
      .then(({ data }) => { setLowStock(data); setThreshold(data.threshold) })
      .catch(() => {})
  }

  const fetchInventory = useCallback(() => {
    setInvLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search) params.set('search', search)
    if (stockFilter) params.set('stock_filter', stockFilter)
    api.get(`/products/inventory/?${params}`)
      .then(({ data }) => setInventory(data))
      .catch(() => {})
      .finally(() => setInvLoading(false))
  }, [page, perPage, search, stockFilter])

  useEffect(() => { fetchLowStock() }, [])
  useEffect(() => { fetchInventory() }, [fetchInventory])

  const saveThreshold = async () => {
    setSaving(true)
    try {
      await api.put('/stores/me/settings/', { low_stock_threshold: threshold })
      fetchLowStock()
    } catch {} finally { setSaving(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (stockFilter) params.set('stock_filter', stockFilter)
      params.set('export', 'csv')
      const { data } = await api.get(`/products/inventory/?${params}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'inventaire.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(inventory.count / perPage))

  return (
    <DashboardLayout title="Stock & Inventaire" subtitle="Cette page surveille votre stock. En haut, elle liste les produits dont le stock est descendu sous un seuil que vous pouvez régler vous-même (par exemple, être alerté dès qu'il reste moins de 5 unités), pour éviter la rupture de stock. En bas, vous trouvez l'inventaire complet de tous vos produits et de leurs variantes avec leur stock actuel, recherchable si vous voulez vérifier un article précis.">
      {/* Réglage seuil */}
      <div className="rounded-xl border p-5 mb-5 flex items-center gap-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex-1">
          <p className="text-sm font-medium text-app-primary mb-0.5">Seuil d'alerte stock bas</p>
          <p className="text-xs" style={{ color: theme.dark.muted }}>Les produits avec un stock ≤ à ce seuil sont signalés ci-dessous.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number" min="0"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-20 px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 text-center"
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
        <h2 className="text-base font-semibold text-app-primary">Inventaire complet</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Recherche par produit"
            className="px-3.5 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition w-full sm:w-56"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          />
          <div className="w-52">
            <Select value={stockFilter} onChange={v => { setStockFilter(v); setPage(1) }} options={STOCK_FILTER_OPTIONS} variant="dark" />
          </div>
          <button onClick={handleExport} disabled={exporting || inventory.count === 0}
            className="px-3.5 py-2 rounded-lg text-sm font-medium border text-app-primary hover:bg-violet-500/5 disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
            style={{ borderColor: theme.dark.border }}>
            <DownloadIcon /> {exporting ? 'Export…' : 'Exporter'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">VARIANTE</th>
              <th className="px-4 py-3 font-medium">OPTION</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">STOCK</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
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
                  <td className="px-4 py-3"><div className={theme.skeleton + ' h-4 w-20'} /></td>
                </tr>
              ))
            ) : inventory.results.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center justify-center text-center py-12 px-6 text-app-muted">
                    <p className="text-sm">Aucun produit trouvé.</p>
                  </div>
                </td>
              </tr>
            ) : inventory.results.map((item, i) => (
              <tr key={i} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary font-medium">
                  <button onClick={() => navigate(`/dashboard/produits/${item.product_id}/modifier`)} className="hover:text-violet-300 transition cursor-pointer">{item.product_name}</button>
                </td>
                <td className="px-4 py-3 text-app-muted-light">{item.variant_name || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{item.option_value || '—'}</td>
                <td className="px-4 py-3 text-app-muted text-xs font-mono">{item.sku || '—'}</td>
                <td className="px-4 py-3">
                  <span className={item.stock === 0 ? theme.badge.danger : item.stock <= (inventory.threshold ?? lowStock.threshold) ? theme.badge.warning : theme.badge.success}>
                    {item.stock}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setAdjustingItem(item)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition cursor-pointer" title="Ajuster le stock"><AdjustIcon /></button>
                    <button onClick={() => setHistoryItem(item)} className="p-1.5 rounded text-app-primary hover:bg-violet-500/10 transition cursor-pointer" title="Historique des mouvements"><HistoryIcon /></button>
                  </div>
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
              className="px-2 py-1 rounded-lg border text-app-primary text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">← Précédent</button>
            <span className={theme.badge.info}>{page}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">Suivant →</button>
          </div>
        </div>
      )}

      {adjustingItem && (
        <AdjustModal item={adjustingItem} onClose={() => setAdjustingItem(null)} onSaved={() => { setAdjustingItem(null); fetchInventory(); fetchLowStock() }} />
      )}
      {historyItem && (
        <MovementsModal item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </DashboardLayout>
  )
}
