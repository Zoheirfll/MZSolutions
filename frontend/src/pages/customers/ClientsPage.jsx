import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import ClientOrdersModal from '../../components/ClientOrdersModal'
import BlockPhoneModal from '../../components/BlockPhoneModal'
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

function HistoryIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function AlertTriangleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" {...props}>
      <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
}

function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
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

export default function ClientsPage() {
  const [data, setData]       = useState({ results: [], count: 0, page: 1, per_page: 10 })
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [historyClient, setHistoryClient] = useState(null)
  const [blockingClient, setBlockingClient] = useState(null)
  const [togglingPhone, setTogglingPhone] = useState(null)

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

  const toggleManualRisk = async (phone) => {
    setTogglingPhone(phone)
    try {
      await api.post(`/orders/clients/${encodeURIComponent(phone)}/risk/`, {})
      fetchClients()
    } catch {} finally {
      setTogglingPhone(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <DashboardLayout title="Clients">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Recherche par nom ou téléphone"
          className="px-4 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition w-full sm:w-72"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
        <p className="text-sm" style={{ color: theme.dark.muted }}>{data.count} client{data.count !== 1 ? 's' : ''}</p>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-200">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">NOM COMPLET</th>
              <th className="px-4 py-3 font-medium">EMAIL</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">COMMANDES</th>
              <th className="px-4 py-3 font-medium">WILAYA</th>
              <th className="px-4 py-3 font-medium">COMMUNE</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">CRÉÉ LE</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9}><Spinner /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={9}>
                <EmptyState icon={<UsersIcon />} title="Aucun client" subtitle="Les clients apparaissent ici après leur première commande." />
              </td></tr>
            ) : data.results.map(c => (
              <tr key={c.phone} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary font-medium">{c.first_name} {c.last_name}</td>
                <td className="px-4 py-3 text-app-muted-light">{c.email || '—'}</td>
                <td className="px-4 py-3 text-app-primary font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-3">
                  <span className={theme.badge.info}>{c.orders_count}</span>
                </td>
                <td className="px-4 py-3 text-app-muted-light">{c.wilaya || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{c.commune || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.is_risky
                      ? <span className={theme.badge.danger}>À risque{c.manual_risk ? ' (manuel)' : ''}</span>
                      : <span className={theme.badge.neutral}>Normal</span>}
                    {c.is_blacklisted && <span className={theme.badge.danger}>Bloqué</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-app-muted text-xs">{new Date(c.created_at).toLocaleDateString('fr-DZ')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setHistoryClient(c)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition cursor-pointer" title="Historique des commandes">
                      <HistoryIcon />
                    </button>
                    <button
                      onClick={() => toggleManualRisk(c.phone)}
                      disabled={togglingPhone === c.phone}
                      className="p-1.5 rounded text-amber-400 hover:bg-amber-500/20 transition cursor-pointer disabled:opacity-50"
                      title={c.manual_risk ? 'Retirer le flag de risque' : 'Marquer à risque'}
                    >
                      <AlertTriangleIcon />
                    </button>
                    {!c.is_blacklisted && (
                      <button onClick={() => setBlockingClient(c)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Bloquer ce numéro">
                        <ShieldIcon />
                      </button>
                    )}
                  </div>
                </td>
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
              className="px-2 py-1 rounded-lg border text-app-primary text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">← Précédent</button>
            <span className={theme.badge.info}>{page}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">Suivant →</button>
          </div>
        </div>
      )}

      {historyClient && (
        <ClientOrdersModal
          phone={historyClient.phone}
          name={`${historyClient.first_name} ${historyClient.last_name}`}
          onClose={() => setHistoryClient(null)}
        />
      )}

      {blockingClient && (
        <BlockPhoneModal
          initialPhone={blockingClient.phone}
          onClose={() => setBlockingClient(null)}
          onSaved={() => { setBlockingClient(null); fetchClients() }}
        />
      )}
    </DashboardLayout>
  )
}
