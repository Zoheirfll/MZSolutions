import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const PER_PAGE_OPTIONS = [10, 25, 50]

export default function ProductsPage() {
  const navigate = useNavigate()
  const [data, setData]         = useState({ results: [], count: 0, page: 1, per_page: 10 })
  const [search, setSearch]     = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [page, setPage]         = useState(1)
  const [perPage, setPerPage]   = useState(10)
  const [loading, setLoading]   = useState(true)

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

  const firstImage = (p) => p.images?.[0]?.image_url

  return (
    <DashboardLayout title="Produits">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-3">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Recherche par produit"
            className="px-4 py-2 rounded-lg text-sm text-gray-200 border outline-none focus:border-violet-500 transition"
            style={{ background: theme.dark.card, borderColor: theme.dark.border, width: 220 }}
          />
          <input
            value={catSearch}
            onChange={e => { setCatSearch(e.target.value); setPage(1) }}
            placeholder="Recherche par catégorie"
            className="px-4 py-2 rounded-lg text-sm text-gray-200 border outline-none focus:border-violet-500 transition"
            style={{ background: theme.dark.card, borderColor: theme.dark.border, width: 220 }}
          />
        </div>
        <button
          onClick={() => navigate('/dashboard/produits/nouveau')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#7c3aed' }}
        >
          Ajouter un produit +
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium w-10">ID</th>
              <th className="px-4 py-3 font-medium w-16">IMAGE</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">PRIX</th>
              <th className="px-4 py-3 font-medium">CATÉGORIE</th>
              <th className="px-4 py-3 font-medium">QUANTITÉ</th>
              <th className="px-4 py-3 font-medium">VENDU</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">Chargement…</td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">Aucun produit trouvé.</td></tr>
            ) : data.results.map(p => (
              <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.id}</td>
                <td className="px-4 py-3">
                  {firstImage(p)
                    ? <img src={firstImage(p)} alt={p.name} className="w-10 h-10 object-cover rounded-lg" />
                    : <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg" style={{ background: theme.dark.card }}>📦</div>
                  }
                </td>
                <td className="px-4 py-3 text-gray-200 font-medium max-w-45 truncate">{p.name}</td>
                <td className="px-4 py-3 text-violet-300 font-semibold">{Number(p.price).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 text-gray-400">
                  {p.category_names?.length > 0 ? p.category_names.join(', ') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-300">{p.stock}</td>
                <td className="px-4 py-3 text-gray-500">{p.sold_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/dashboard/produits/${p.id}/modifier`)}
                      className="text-xs px-2.5 py-1 rounded text-violet-300 hover:bg-violet-600/20 transition"
                    >✏️</button>
                    <button
                      onClick={() => handleToggle(p)}
                      className={`text-xs px-2.5 py-1 rounded transition ${
                        p.is_active ? 'text-emerald-400 hover:bg-emerald-900/20' : 'text-gray-500 hover:bg-white/5'
                      }`}
                    >{p.is_active ? '● Actif' : '○ Inactif'}</button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-xs px-2.5 py-1 rounded text-red-400 hover:bg-red-900/20 transition"
                    >🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Lignes par page :</span>
          <select
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
            className="px-2 py-1 rounded border text-gray-300 text-xs"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          >
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>{data.count} produit{data.count !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 disabled:opacity-40 transition"
          >← Précédent</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
            Math.max(0, page - 3), Math.min(totalPages, page + 2)
          ).map(n => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className="w-8 h-8 rounded text-sm transition"
              style={{
                background: n === page ? '#7c3aed' : 'transparent',
                color: n === page ? '#fff' : theme.dark.muted,
              }}
            >{n}</button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 disabled:opacity-40 transition"
          >Suivant →</button>
        </div>
      </div>
    </DashboardLayout>
  )
}
