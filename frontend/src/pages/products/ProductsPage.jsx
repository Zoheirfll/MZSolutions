import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const PER_PAGE_OPTIONS = [10, 25, 50]

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function ImageIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function AlertIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13" {...props}>
      <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
}

function Spinner({ label = 'Chargement…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-app-muted">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">{label}</span>
    </div>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-app-muted">
      {icon && <div className="mb-3 text-app-muted">{icon}</div>}
      <p className="text-sm font-medium text-app-primary">{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{subtitle}</p>}
    </div>
  )
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const [data, setData]         = useState({ results: [], count: 0, page: 1, per_page: 10 })
  const [search, setSearch]     = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [categories, setCategories] = useState([])
  const [threshold, setThreshold] = useState(null)
  const [page, setPage]         = useState(1)
  const [perPage, setPerPage]   = useState(10)
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    api.get('/products/categories/?parent=null&per_page=200').then(({ data }) => setCategories(data.results || [])).catch(() => {})
    api.get('/stores/me/settings/').then(({ data }) => setThreshold(data.low_stock_threshold)).catch(() => {})
  }, [])

  const fetchProducts = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search)    params.set('search', search)
    if (catSearch) params.set('category', catSearch)
    api.get(`/products/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, search, catSearch])

  useEffect(() => { fetchProducts() }, [fetchProducts])
  useEffect(() => { setSelected(new Set()) }, [data.results])

  const handleToggle = async (product) => {
    await api.put(`/products/${product.id}/`, { is_active: !product.is_active })
    fetchProducts()
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce produit ?')) return
    await api.delete(`/products/${id}/`)
    fetchProducts()
  }

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const allIds     = data.results.map(p => p.id)
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id))

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(allIds))
  const toggleRow = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleBulkToggle = async (activate) => {
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(id => api.put(`/products/${id}/`, { is_active: activate })))
      fetchProducts()
    } catch {} finally { setBulkBusy(false) }
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Supprimer ${selected.size} produit(s) ?`)) return
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(id => api.delete(`/products/${id}/`)))
      fetchProducts()
    } catch {} finally { setBulkBusy(false) }
  }

  const firstImage = (p) => p.images?.[0]?.image_url

  return (
    <DashboardLayout title="Produits">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        {selected.size > 0 ? (
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={theme.badge.info}>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
            <button onClick={() => handleBulkToggle(true)} disabled={bulkBusy} className={theme.btn.secondary}>Activer</button>
            <button onClick={() => handleBulkToggle(false)} disabled={bulkBusy} className={theme.btn.secondary}>Désactiver</button>
            <button onClick={handleBulkDelete} disabled={bulkBusy} className={theme.btn.danger}>Supprimer</button>
          </div>
        ) : (
        <div className="flex gap-3 flex-wrap">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Recherche par produit"
            className="px-4 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition w-full sm:w-55"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          />
          <Select
            value={catSearch}
            onChange={v => { setCatSearch(v); setPage(1) }}
            options={[{ value: '', label: 'Toutes les catégories' }, ...categories.map(c => ({ value: c.name, label: c.name }))]}
            className="px-4 py-2 rounded-lg text-sm text-app-primary border w-full sm:w-55"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          />
        </div>
        )}
        <button
          onClick={() => navigate('/dashboard/produits/nouveau')}
          className={theme.btn.primary + ' text-sm shrink-0'}
        >
          <PlusIcon /> Ajouter un produit
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-violet-600" /></th>
              <th className="px-4 py-3 font-medium w-10">ID</th>
              <th className="px-4 py-3 font-medium w-16">IMAGE</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">PRIX</th>
              <th className="px-4 py-3 font-medium">PRIX PROMO</th>
              <th className="px-4 py-3 font-medium">CATÉGORIE</th>
              <th className="px-4 py-3 font-medium">QUANTITÉ</th>
              <th className="px-4 py-3 font-medium">VENDU</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10}><Spinner /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={10}>
                <EmptyState icon={<ImageIcon />} title="Aucun produit trouvé" subtitle="Ajoutez votre premier produit pour commencer." />
              </td></tr>
            ) : data.results.map(p => {
              const stockQty = p.total_stock ?? p.stock
              const isLowStock = threshold != null && stockQty <= threshold
              return (
              <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleRow(p.id)} className="accent-violet-600" />
                </td>
                <td className="px-4 py-3 text-app-muted text-xs">{p.id}</td>
                <td className="px-4 py-3">
                  {firstImage(p)
                    ? <img src={firstImage(p)} alt={p.name} className="w-10 h-10 object-cover rounded-lg" />
                    : <div className="w-10 h-10 rounded-lg flex items-center justify-center text-app-muted" style={{ background: theme.dark.card }}><ImageIcon width={16} height={16} /></div>
                  }
                </td>
                <td className="px-4 py-3 text-app-primary font-medium max-w-45 truncate">{p.name}</td>
                <td className="px-4 py-3 text-violet-300 font-semibold">{Number(p.price).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3">
                  {p.active_promotion ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-semibold">{Number(p.active_promotion.discounted_price).toLocaleString('fr-DZ')} DZD</span>
                      <span className={theme.badge.danger} title={p.active_promotion.name}>
                        -{p.active_promotion.discount_type === 'percentage'
                          ? `${Number(p.active_promotion.discount_value)}%`
                          : `${Number(p.active_promotion.discount_value).toLocaleString('fr-DZ')} DZD`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-app-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-app-muted-light">
                  {p.category_names?.length > 0 ? p.category_names.join(', ') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={isLowStock ? 'text-red-400 font-semibold' : 'text-app-primary'}>{stockQty}</span>
                    {isLowStock && <AlertIcon className="text-red-400 shrink-0" />}
                  </div>
                </td>
                <td className="px-4 py-3 text-app-muted">{p.sold_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/dashboard/produits/${p.id}/modifier`)}
                      className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition cursor-pointer"
                      title="Modifier"
                    ><EditIcon /></button>
                    <button
                      onClick={() => handleToggle(p)}
                      className={(p.is_active ? theme.badge.success : theme.badge.neutral) + ' cursor-pointer hover:opacity-80 transition'}
                    >{p.is_active ? 'Actif' : 'Inactif'}</button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer"
                      title="Supprimer"
                    ><TrashIcon /></button>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-2 text-xs text-app-muted">
          <span>Lignes par page :</span>
          <Select
            value={perPage}
            onChange={v => { setPerPage(Number(v)); setPage(1) }}
            options={PER_PAGE_OPTIONS.map(n => ({ value: n, label: n }))}
            className="px-2 py-1 rounded border text-app-primary text-xs"
            style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }}
          />
          <span>{data.count} produit{data.count !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded text-sm text-app-muted-light hover:text-app-primary disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed"
          >← Précédent</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
            Math.max(0, page - 3), Math.min(totalPages, page + 2)
          ).map(n => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-8 h-8 rounded text-sm transition cursor-pointer ${n === page ? 'bg-violet-600 text-white' : ''}`}
              style={n === page ? undefined : { color: theme.dark.muted }}
            >{n}</button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded text-sm text-app-muted-light hover:text-app-primary disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed"
          >Suivant →</button>
        </div>
      </div>
    </DashboardLayout>
  )
}
