import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const TABS = [
  { key: '',  label: 'Tous' },
  { key: '0', label: 'Non récupérés' },
  { key: '1', label: 'Récupérés' },
]

function StatusBadge({ cart }) {
  if (cart.is_recovered)   return <span className={theme.badge.success}>Récupéré</span>
  if (cart.reminder_sent)  return <span className={theme.badge.warning}>Relance envoyée</span>
  return <span className={theme.badge.neutral}>En attente</span>
}

export default function AbandonedCartsPage() {
  const [carts,   setCarts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('')
  const [page,    setPage]    = useState(1)
  const [total,   setTotal]   = useState(0)
  const PER_PAGE = 20

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: PER_PAGE })
    if (tab !== '') params.set('recovered', tab)
    api.get(`/orders/abandoned-carts/?${params}`)
      .then(({ data }) => { setCarts(data.results); setTotal(data.count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tab, page])

  const switchTab = (t) => { setTab(t); setPage(1) }
  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <DashboardLayout title="Paniers abandonnés">
      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
              tab === t.key
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: theme.dark.card, borderBottom: `1px solid ${theme.dark.border}` }}>
                {['Date', 'Client', 'Email', 'Wilaya', 'Articles', 'Total', 'Statut'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.dark.border}` }}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className={`h-3 rounded ${theme.skeleton} w-24`} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : carts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-500">
                    <svg className="w-10 h-10 mx-auto mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
                    </svg>
                    Aucun panier abandonné
                  </td>
                </tr>
              ) : carts.map(cart => (
                <tr key={cart.id}
                  className="transition-colors duration-150"
                  style={{ borderBottom: `1px solid ${theme.dark.border}`, background: theme.dark.app }}
                  onMouseEnter={e => e.currentTarget.style.background = theme.dark.card}
                  onMouseLeave={e => e.currentTarget.style.background = theme.dark.app}>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {new Date(cart.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-200 font-medium">{cart.first_name} {cart.last_name}</p>
                    <p className="text-gray-500 text-xs">{cart.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{cart.email || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-gray-400">{cart.wilaya || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{(cart.items || []).length} article(s)</td>
                  <td className="px-4 py-3 text-violet-400 font-semibold">
                    {Number(cart.total).toLocaleString('fr-DZ')} DA
                  </td>
                  <td className="px-4 py-3"><StatusBadge cart={cart} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">{total} panier(s) au total</p>
          <div className="flex gap-1">
            {[...Array(totalPages)].map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)}
                className={`w-8 h-8 rounded-lg text-sm transition-colors cursor-pointer ${
                  page === i + 1
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-400 hover:bg-white/5'
                }`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
