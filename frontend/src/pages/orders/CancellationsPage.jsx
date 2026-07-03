import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const PER_PAGE_OPTIONS = [10, 25, 50]

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function XIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function ChevronLeftIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export default function CancellationsPage({ mode }) {
  const navigate   = useNavigate()
  const isRequests = mode === 'requests'

  const [data,    setData]    = useState({ results: [], count: 0 })
  const [page,    setPage]    = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [loading, setLoading] = useState(true)

  const statusFilter = isRequests ? 'cancel_requested' : 'cancelled'

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage, status: statusFilter })
    api.get(`/orders/?${params}`)
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, statusFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const changeStatus = async (id, newStatus) => {
    await api.post(`/orders/${id}/status/`, { status: newStatus })
    fetchOrders()
  }

  const orders     = data.results || []
  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <DashboardLayout title={isRequests ? "Demande d'annulation" : 'Annulation confirmée'}>

      <div className="rounded-xl border overflow-x-auto mb-4" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-165">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">NUMÉRO DE TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">EMPLACEMENT</th>
              <th className="px-4 py-3 font-medium">COMMUNE</th>
              <th className="px-4 py-3 font-medium">PRIX TOTAL</th>
              <th className="px-4 py-3 font-medium">DATE</th>
              {isRequests && <th className="px-4 py-3 font-medium">ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isRequests ? 8 : 7} className="py-16">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={isRequests ? 8 : 7}>
                <div className={theme.emptyState}>
                  <svg className="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>Aucune commande trouvée</p>
                </div>
              </td></tr>
            ) : orders.map(o => (
              <tr
                key={o.id}
                onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
                className="border-b hover:bg-white/2 transition cursor-pointer"
                style={{ borderColor: theme.dark.border + '44' }}
              >
                <td className="px-4 py-3 text-gray-500">#{o.id}</td>
                <td className="px-4 py-3 text-gray-200 font-medium">{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 text-gray-300">{o.phone}</td>
                <td className="px-4 py-3 text-gray-300">{o.wilaya}</td>
                <td className="px-4 py-3 text-gray-400">{o.commune || '—'}</td>
                <td className="px-4 py-3 text-gray-200 font-semibold">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(o.created_at).toLocaleDateString('fr-DZ')}
                </td>
                {isRequests && (
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeStatus(o.id, 'cancelled')}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-red-400 border border-red-800 hover:bg-red-900/20 transition"
                      >
                        <CheckIcon /> Confirmer
                      </button>
                      <button
                        onClick={() => changeStatus(o.id, 'confirmed')}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-emerald-400 border border-emerald-800 hover:bg-emerald-900/20 transition"
                      >
                        <XIcon /> Rejeter
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm" style={{ color: theme.dark.muted }}>
        <p>{data.count} commande{data.count !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            Lignes par page :
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="px-2 py-1 rounded-lg border text-gray-300 text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-white/5 flex items-center justify-center">
              <ChevronLeftIcon />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className={`px-2.5 py-1 rounded text-xs transition ${page === n ? 'bg-violet-600 text-white' : ''}`}
                style={page === n ? undefined : { color: theme.dark.muted }}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-white/5 flex items-center justify-center">
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
