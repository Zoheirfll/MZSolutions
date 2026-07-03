import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">Chargement…</span>
    </div>
  )
}

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

export default function DropshipperMyProductsPage() {
  const [selected, setSelected]   = useState([])
  const [search, setSearch]       = useState('')
  const [catalog, setCatalog]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [busyId, setBusyId]       = useState(null)

  const fetchSelected = () => api.get('/dropshipping/products/').then(({ data }) => setSelected(data))

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchSelected(), api.get('/products/?per_page=50')])
      .then(([, prod]) => setCatalog(prod.data.results ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      api.get(`/products/?search=${encodeURIComponent(search)}&per_page=50`)
        .then(({ data }) => setCatalog(data.results ?? []))
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const selectedProductIds = new Set(selected.map(s => s.product))
  const selectionByProduct = Object.fromEntries(selected.map(s => [s.product, s]))

  const toggle = async (product) => {
    setBusyId(product.id)
    try {
      if (selectedProductIds.has(product.id)) {
        await api.delete(`/dropshipping/products/${selectionByProduct[product.id].id}/`)
      } else {
        await api.post('/dropshipping/products/', { product: product.id })
      }
      await fetchSelected()
    } finally {
      setBusyId(null)
    }
  }

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title="Mes produits">
      <p className="text-sm mb-4" style={{ color: theme.dark.muted }}>
        Choisissez les produits du catalogue que vous souhaitez promouvoir et vendre. Vous ne gérez pas de stock — le stock reste celui du vendeur.
      </p>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un produit…" className={`${inputCls} mb-5 max-w-md`} style={bdrStyle} />

      {loading ? <Spinner /> : (
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
          <table className="w-full text-sm min-w-140">
            <thead style={{ background: theme.dark.sidebar }}>
              <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                <th className="px-4 py-3 font-medium">PRODUIT</th>
                <th className="px-4 py-3 font-medium">PRIX</th>
                <th className="px-4 py-3 font-medium">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {catalog.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">Aucun produit trouvé.</td></tr>
              ) : catalog.map(p => {
                const isSelected = selectedProductIds.has(p.id)
                return (
                  <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                    <td className="px-4 py-3 text-gray-200">{p.name}</td>
                    <td className="px-4 py-3 text-gray-400">{money(p.price)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggle(p)}
                        disabled={busyId === p.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-60 ${
                          isSelected ? 'text-red-400 border hover:bg-red-900/20' : 'text-white bg-violet-600 hover:bg-violet-500'
                        }`}
                        style={isSelected ? { borderColor: theme.dark.border } : {}}
                      >
                        {busyId === p.id ? '…' : isSelected ? 'Retirer' : 'Ajouter'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}
