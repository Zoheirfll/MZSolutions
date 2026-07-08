import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const PER_PAGE_OPTIONS = [10, 25, 50]

function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-8 0" />
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

export default function ClientsPage() {
  const [data, setData]       = useState({ results: [], count: 0, page: 1, per_page: 10 })
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [loading, setLoading] = useState(true)

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search) params.set('search', search)
    api.get(`/orders/clients/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, search])

  useEffect(() => { fetchClients() }, [fetchClients])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <DashboardLayout title="Clients">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Recherche par nom ou téléphone"
          className="px-4 py-2 rounded-lg text-sm text-gray-200 border outline-none focus:border-violet-500 transition w-full sm:w-72"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
        <p className="text-sm" style={{ color: theme.dark.muted }}>{data.count} client{data.count !== 1 ? 's' : ''}</p>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">NOM COMPLET</th>
              <th className="px-4 py-3 font-medium">EMAIL</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">COMMANDES</th>
              <th className="px-4 py-3 font-medium">WILAYA</th>
              <th className="px-4 py-3 font-medium">COMMUNE</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">CRÉÉ LE</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><Spinner /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={8}>
                <EmptyState icon={<UsersIcon />} title="Aucun client" subtitle="Les clients apparaissent ici après leur première commande." />
              </td></tr>
            ) : data.results.map(c => (
              <tr key={c.phone} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{c.first_name} {c.last_name}</td>
                <td className="px-4 py-3 text-gray-400">{c.email || '—'}</td>
                <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-3">
                  <span className={theme.badge.info}>{c.orders_count}</span>
                </td>
                <td className="px-4 py-3 text-gray-400">{c.wilaya || '—'}</td>
                <td className="px-4 py-3 text-gray-400">{c.commune || '—'}</td>
                <td className="px-4 py-3">
                  {c.is_risky
                    ? <span className={theme.badge.danger}>À risque{c.manual_risk ? ' (manuel)' : ''}</span>
                    : <span className={theme.badge.neutral}>Normal</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <div className="flex items-center gap-2 text-xs">
            Lignes par page :
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
