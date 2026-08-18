import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import EmptyState from '../components/EmptyState'
import Select from '../components/Select'
import api from '../api/axios'
import { theme } from '../theme'

const ROLE_LABELS = {
  owner: 'Propriétaire',
  admin: 'Admin',
  confirmateur: 'Confirmateur',
  dropshipper: 'Dropshipper',
}

function ActorBadge({ role }) {
  const cls = role === 'owner' || role === 'admin' ? theme.badge.info : theme.badge.warning
  return <span className={cls}>{ROLE_LABELS[role] || role || '—'}</span>
}

export default function AuditPage() {
  const [data, setData] = useState({ results: [], count: 0 })
  const [meta, setMeta] = useState({ actions: [], actors: [] })
  const [search, setSearch] = useState('')
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 25

  useEffect(() => {
    api.get('/audit/meta/').then(({ data }) => setMeta(data)).catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search) params.set('search', search)
    if (actor) params.set('actor', actor)
    if (action) params.set('action', action)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    api.get(`/audit/logs/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search, actor, action, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, actor, action, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const inputCls = 'px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const actorOptions = [{ value: '', label: 'Tous les membres' }, ...meta.actors.map(a => ({ value: String(a.id), label: `${a.name} (${ROLE_LABELS[a.role] || a.role})` }))]
  const actionOptions = [{ value: '', label: 'Toutes les actions' }, ...meta.actions.map(a => ({ value: a.key, label: a.label }))]

  return (
    <DashboardLayout
      title="Audit"
      subtitle="Journal de toutes les actions effectuées par l'équipe (admins et confirmateurs) : changements de statut de commande, notes/commentaires, appels, échanges, disponibilité en ligne, gestion d'équipe, liste noire, clients à risque... Lecture seule, jamais modifiable."
    >
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher (acteur, description, cible)…"
          className={inputCls} style={{ ...bdrStyle, width: 260 }}
        />
        <div style={{ width: 220 }}>
          <Select value={actor} onChange={setActor} options={actorOptions}
            className="px-3 py-2 rounded-lg border text-sm text-app-primary" style={{ background: 'transparent', borderColor: theme.dark.border }} />
        </div>
        <div style={{ width: 260 }}>
          <Select value={action} onChange={setAction} options={actionOptions}
            className="px-3 py-2 rounded-lg border text-sm text-app-primary" style={{ background: 'transparent', borderColor: theme.dark.border }} />
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} style={bdrStyle} />
        <span className="self-center text-app-muted text-sm">→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} style={bdrStyle} />
        {(search || actor || action || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(''); setActor(''); setAction(''); setDateFrom(''); setDateTo('') }} className="text-xs px-3 py-2 text-app-muted-light hover:text-app-primary transition">
            Réinitialiser
          </button>
        )}
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{data.count} action{data.count !== 1 ? 's' : ''}.</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-220">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">DATE</th>
              <th className="px-4 py-3 font-medium">ACTEUR</th>
              <th className="px-4 py-3 font-medium">RÔLE</th>
              <th className="px-4 py-3 font-medium">CIBLE</th>
              <th className="px-4 py-3 font-medium">DESCRIPTION</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={5}>
                <EmptyState title="Aucune action" description="Aucune action ne correspond à ces filtres." />
              </td></tr>
            ) : data.results.map(entry => (
              <tr key={entry.id} className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-muted text-xs whitespace-nowrap">{new Date(entry.created_at).toLocaleString('fr-DZ')}</td>
                <td className="px-4 py-3 text-app-primary font-medium whitespace-nowrap">{entry.actor_name || '—'}</td>
                <td className="px-4 py-3"><ActorBadge role={entry.actor_role} /></td>
                <td className="px-4 py-3 text-app-muted-light whitespace-nowrap">{entry.target_repr || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{entry.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > perPage && (
        <div className="flex items-center justify-end gap-2 mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">← Précédent</button>
          <span className={theme.badge.info}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">Suivant →</button>
        </div>
      )}
    </DashboardLayout>
  )
}
