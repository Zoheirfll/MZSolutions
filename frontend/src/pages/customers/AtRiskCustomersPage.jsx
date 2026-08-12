import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import ClientOrdersModal from '../../components/ClientOrdersModal'
import BlockPhoneModal from '../../components/BlockPhoneModal'
import api from '../../api/axios'
import { theme } from '../../theme'

const PER_PAGE_OPTIONS = [10, 25, 50]

function AlertIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
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

function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
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

export default function AtRiskCustomersPage() {
  const [data, setData]       = useState({ results: [], count: 0 })
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState(3)
  const [periodDays, setPeriodDays] = useState(90)
  const [savingSettings, setSavingSettings] = useState(false)
  const [togglingPhone, setTogglingPhone] = useState(null)
  const [historyClient, setHistoryClient] = useState(null)
  const [blockingClient, setBlockingClient] = useState(null)

  const inputCls = 'w-24 px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ risk_only: 1, page, per_page: perPage })
    if (search) params.set('search', search)
    api.get(`/orders/clients/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, search])

  const fetchSettings = useCallback(() => {
    api.get('/stores/me/settings/').then(({ data }) => {
      setThreshold(data.risk_threshold_orders)
      setPeriodDays(data.risk_period_days)
    }).catch(() => {})
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])
  useEffect(() => { fetchSettings() }, [fetchSettings])

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      await api.put('/stores/me/settings/', { risk_threshold_orders: threshold, risk_period_days: periodDays })
      fetchClients()
    } catch {} finally {
      setSavingSettings(false)
    }
  }

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
    <DashboardLayout title="Clients à risque">
      {/* Réglages du seuil */}
      <div className="rounded-xl border p-5 mb-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Seuil de détection automatique</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nb. commandes annulées/retournées</label>
            <input type="number" min="1" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className={inputCls} style={bdrStyle} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Sur une période de (jours)</label>
            <input type="number" min="1" value={periodDays} onChange={e => setPeriodDays(Number(e.target.value))} className={inputCls} style={bdrStyle} />
          </div>
          <button onClick={saveSettings} disabled={savingSettings} className={theme.btn.primary + ' disabled:opacity-60'}>
            {savingSettings ? '…' : 'Enregistrer'}
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: theme.dark.muted }}>
          Un client est marqué à risque automatiquement s'il atteint ce nombre de commandes annulées/retournées sur la période indiquée. Vous pouvez aussi marquer/démarquer un client manuellement ci-dessous, indépendamment de ce calcul.
        </p>
      </div>

      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Recherche par nom ou téléphone"
          className="px-4 py-2 rounded-lg text-sm text-gray-200 border outline-none focus:border-violet-500 transition w-full sm:w-72"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
        <p className="text-sm" style={{ color: theme.dark.muted }}>{data.count} client{data.count !== 1 ? 's' : ''} à risque</p>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">NOM COMPLET</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">COMMANDES</th>
              <th className="px-4 py-3 font-medium">ANNULÉES/RETOURNÉES</th>
              <th className="px-4 py-3 font-medium">ORIGINE</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><Spinner /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState icon={<AlertIcon />} title="Aucun client à risque" subtitle="Personne ne dépasse le seuil configuré pour l'instant." />
              </td></tr>
            ) : data.results.map(c => (
              <tr key={c.phone} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{c.first_name} {c.last_name}</td>
                <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-3 text-gray-400">{c.orders_count}</td>
                <td className="px-4 py-3">
                  <span className={theme.badge.danger}>{c.risky_count}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={c.manual_risk ? theme.badge.warning : theme.badge.neutral}>
                      {c.manual_risk ? 'Manuel' : 'Automatique'}
                    </span>
                    {c.is_blacklisted && <span className={theme.badge.danger}>Bloqué</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 flex-wrap">
                    <button onClick={() => setHistoryClient(c)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition cursor-pointer" title="Historique des commandes">
                      <HistoryIcon />
                    </button>
                    <button
                      onClick={() => toggleManualRisk(c.phone)}
                      disabled={togglingPhone === c.phone}
                      className={theme.btn.outline + ' text-xs disabled:opacity-50'}
                    >
                      {togglingPhone === c.phone ? '…' : c.manual_risk ? 'Retirer le flag' : 'Marquer manuellement'}
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
