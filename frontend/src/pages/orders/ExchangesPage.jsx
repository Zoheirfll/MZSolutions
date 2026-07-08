import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const FILTERS = [
  { label: 'Toutes',    value: '' },
  { label: 'En attente', value: 'open' },
  { label: 'Approuvées', value: 'approved' },
  { label: 'Refusées',   value: 'rejected' },
]

const STATUS_BADGE = {
  open:     theme.badge.warning,
  approved: theme.badge.success,
  rejected: theme.badge.danger,
}

function ExchangeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M4 7h13l-3-3m3 3-3 3M20 17H7l3 3m-3-3 3-3" />
    </svg>
  )
}

function Spinner({ label = 'Chargement…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
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
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-gray-500">
      {icon && <div className="mb-3 text-gray-600">{icon}</div>}
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{subtitle}</p>}
    </div>
  )
}

export default function ExchangesPage() {
  const navigate = useNavigate()
  const [data, setData]       = useState({ results: [], count: 0, page: 1, per_page: 10 })
  const [filter, setFilter]   = useState('')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 10

  const fetchExchanges = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filter) params.set('status', filter)
    if (search) params.set('search', search)
    api.get(`/orders/exchanges/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, filter, search])

  useEffect(() => { fetchExchanges() }, [fetchExchanges])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <DashboardLayout title="Échanges">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1) }}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                filter === f.value ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Recherche par téléphone, nom, produit"
          className="px-4 py-2 rounded-lg text-sm text-gray-200 border outline-none focus:border-violet-500 transition w-full sm:w-64"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-200">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">COMMANDE</th>
              <th className="px-4 py-3 font-medium">CLIENT</th>
              <th className="px-4 py-3 font-medium">ARTICLE</th>
              <th className="px-4 py-3 font-medium">VARIANTE DEMANDÉE</th>
              <th className="px-4 py-3 font-medium">MOTIF</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">DÉPOSÉE LE</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}><Spinner /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState icon={<ExchangeIcon />} title="Aucune demande d'échange" subtitle="Les demandes d'échange déposées par vos clients apparaîtront ici." />
              </td></tr>
            ) : data.results.map(e => (
              <tr key={e.id} onClick={() => navigate(`/dashboard/echanges/${e.id}`)}
                className="border-b hover:bg-white/2 transition cursor-pointer" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-violet-300 font-mono text-xs">{e.order_display}</td>
                <td className="px-4 py-3 text-gray-300 font-mono text-xs">{e.order_phone}</td>
                <td className="px-4 py-3 text-gray-200 font-medium max-w-48 truncate">{e.original_product}</td>
                <td className="px-4 py-3">
                  <span className={theme.badge.info}>{e.replacement_value}</span>
                </td>
                <td className="px-4 py-3 text-gray-400 max-w-48 truncate" title={e.reason}>{e.reason || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={STATUS_BADGE[e.status] || theme.badge.neutral}>{e.status_label}</span>
                    {e.days_open >= 2 && (
                      <span className={theme.badge.danger} title="Ouverte depuis plusieurs jours">
                        {e.days_open}j
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(e.created_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <p>{data.count} échange{data.count !== 1 ? 's' : ''}</p>
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
