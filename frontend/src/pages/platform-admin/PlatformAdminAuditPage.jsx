import { useEffect, useState, useCallback } from 'react'
import api from '../../api/axios'
import { theme } from '../../theme'

export default function PlatformAdminAuditPage() {
  const [logs, setLogs]       = useState([])
  const [count, setCount]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const perPage = 25

  const load = useCallback(() => {
    setLoading(true)
    api.get('/platform-admin/audit-logs/', { params: { search: search || undefined, page, per_page: perPage } })
      .then(({ data }) => { setLogs(data.results); setCount(data.count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search])

  const totalPages = Math.max(1, Math.ceil(count / perPage))

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-app-primary">Journal d'audit</h1>
        <p className="text-sm text-app-muted mt-1">Toutes les actions journalisées, à travers toutes les boutiques — y compris celles faites en mode « Gérer cette boutique ».</p>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher (acteur, boutique, description)…"
        className={theme.inputDark + ' max-w-md'}
      />

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
        <table className="w-full text-sm min-w-200">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Boutique</th>
              <th className="px-4 py-3">Acteur</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-app-muted">Chargement…</td></tr>}
            {!loading && logs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-app-muted">Aucune entrée.</td></tr>}
            {!loading && logs.map(l => (
              <tr key={l.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                <td className="px-4 py-3 text-app-muted-light whitespace-nowrap">{new Date(l.created_at).toLocaleString('fr-DZ')}</td>
                <td className="px-4 py-3 text-app-primary font-medium">{l.store_name || '—'}</td>
                <td className="px-4 py-3 text-app-muted">{l.actor_name} <span className="text-xs text-app-muted-light">({l.actor_role})</span></td>
                <td className="px-4 py-3 text-app-muted-light">{l.action}</td>
                <td className="px-4 py-3 text-app-muted max-w-80 truncate" title={l.description}>{l.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm" style={{ color: theme.dark.muted }}>
        <p>{count} entrée{count > 1 ? 's' : ''}</p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1 rounded text-xs disabled:opacity-30 hover:bg-violet-500/5">Précédent</button>
          <span className="px-2 text-xs">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2.5 py-1 rounded text-xs disabled:opacity-30 hover:bg-violet-500/5">Suivant</button>
        </div>
      </div>
    </div>
  )
}
