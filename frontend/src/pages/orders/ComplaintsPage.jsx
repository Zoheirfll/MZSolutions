import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const FILTERS = [
  { label: 'Toutes',    value: '' },
  { label: 'Ouvertes',  value: 'open' },
  { label: 'En cours',  value: 'in_progress' },
  { label: 'Résolues',  value: 'resolved' },
]

const STATUS_BADGE = {
  open:        theme.badge.danger,
  in_progress: theme.badge.warning,
  resolved:    theme.badge.success,
}

const PER_PAGE_OPTIONS = [10, 25, 50]

function AlertIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
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

export default function ComplaintsPage() {
  const navigate = useNavigate()
  const [data, setData]       = useState({ results: [], count: 0, page: 1, per_page: 10 })
  const [filter, setFilter]   = useState('')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [loading, setLoading] = useState(true)

  const fetchComplaints = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (filter) params.set('status', filter)
    if (search) params.set('search', search)
    api.get(`/orders/complaints/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, filter, search])

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <DashboardLayout title="Réclamations">
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
          placeholder="Recherche par téléphone, nom, sujet"
          className="px-4 py-2 rounded-lg text-sm text-gray-200 border outline-none focus:border-violet-500 transition w-full sm:w-64"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">COMMANDE</th>
              <th className="px-4 py-3 font-medium">CLIENT</th>
              <th className="px-4 py-3 font-medium">SUJET</th>
              <th className="px-4 py-3 font-medium">MESSAGES</th>
              <th className="px-4 py-3 font-medium">CONFIRMATEUR</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">DÉPOSÉE LE</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}><Spinner /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState icon={<AlertIcon />} title="Aucune réclamation" subtitle="Les réclamations déposées par vos clients apparaîtront ici." />
              </td></tr>
            ) : data.results.map(c => (
              <tr key={c.id} onClick={() => navigate(`/dashboard/reclamations/${c.id}`)}
                className="border-b hover:bg-white/2 transition cursor-pointer" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-violet-300 font-mono text-xs">{c.order_display}</td>
                <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.order_phone}</td>
                <td className="px-4 py-3 text-gray-200 font-medium max-w-56 truncate">{c.subject}</td>
                <td className="px-4 py-3">
                  <span className={theme.badge.info}>{c.messages_count}</span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{c.confirmateur_name || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={STATUS_BADGE[c.status] || theme.badge.neutral}>{c.status_label}</span>
                    {c.days_open >= 2 && (
                      <span className={theme.badge.danger} title="Ouverte depuis plusieurs jours">
                        {c.days_open}j
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.created_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <p>{data.count} réclamation{data.count !== 1 ? 's' : ''}</p>
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
