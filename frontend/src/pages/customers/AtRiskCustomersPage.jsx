import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

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

export default function AtRiskCustomersPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState(3)
  const [periodDays, setPeriodDays] = useState(90)
  const [savingSettings, setSavingSettings] = useState(false)
  const [togglingPhone, setTogglingPhone] = useState(null)

  const inputCls = 'w-24 px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  const fetchClients = useCallback(() => {
    setLoading(true)
    api.get('/orders/clients/?risk_only=1&per_page=200')
      .then(({ data }) => setClients(data.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const fetchSettings = useCallback(() => {
    api.get('/stores/me/settings/').then(({ data }) => {
      setThreshold(data.risk_threshold_orders)
      setPeriodDays(data.risk_period_days)
    }).catch(() => {})
  }, [])

  useEffect(() => { fetchClients(); fetchSettings() }, [fetchClients, fetchSettings])

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

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{clients.length} client{clients.length !== 1 ? 's' : ''} à risque</p>

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
            ) : clients.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState icon={<AlertIcon />} title="Aucun client à risque" subtitle="Personne ne dépasse le seuil configuré pour l'instant." />
              </td></tr>
            ) : clients.map(c => (
              <tr key={c.phone} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{c.first_name} {c.last_name}</td>
                <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-3 text-gray-400">{c.orders_count}</td>
                <td className="px-4 py-3">
                  <span className={theme.badge.danger}>{c.risky_count}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={c.manual_risk ? theme.badge.warning : theme.badge.neutral}>
                    {c.manual_risk ? 'Manuel' : 'Automatique'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleManualRisk(c.phone)}
                    disabled={togglingPhone === c.phone}
                    className={theme.btn.outline + ' text-xs disabled:opacity-50'}
                  >
                    {togglingPhone === c.phone ? '…' : c.manual_risk ? 'Retirer le flag manuel' : 'Marquer manuellement'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
