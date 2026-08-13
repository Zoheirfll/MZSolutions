import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../../components/DashboardLayout'
import StatCard from '../../../components/StatCard'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, money, StatsToolbar, downloadCsv } from './statsShared'

function pctSub(pct) {
  if (pct === null || pct === undefined) return null
  return `${pct >= 0 ? '+' : ''}${pct}% vs préc.`
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}j ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function DeliveryRateDonut({ rate }) {
  const r = 50
  const circumference = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke={theme.dark.border} strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" stroke="#10b981" strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - rate / 100)}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">{rate}%</span>
        </div>
      </div>
      <p className="text-xs mt-2" style={{ color: theme.dark.muted }}>Taux de livraison</p>
    </div>
  )
}

export default function GlobalStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/global/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv(api, `/orders/stats/global/?${queryString()}&export=csv`, 'statistiques-globales.csv')
    } finally { setExporting(false) }
  }

  return (
    <DashboardLayout title="Statistiques globales" subtitle="Cette page vous donne les chiffres clés de votre activité sur la période choisie, en un seul coup d'œil : combien de commandes, quel pourcentage confirmé, combien livrées/retournées/annulées, votre chiffre d'affaires total et le montant moyen d'une commande.">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <StatsToolbar onRefresh={fetchData} onExport={handleExport} exporting={exporting} exportDisabled={!data?.daily?.length} />
      </div>
      {loading || !data ? <Spinner /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatCard label="Commandes" value={data.total_orders} color="violet" sub={pctSub(data.total_orders_delta_pct)} />
            <StatCard label="Taux de confirmation" value={`${data.confirmation_rate}%`} color="blue" sub={pctSub(data.confirmation_rate_delta_pct)} />
            <StatCard label="Livrées" value={data.delivered_count} color="green" />
            <StatCard label="Retournées" value={data.returned_count} color="red" />
            <StatCard label="Annulées" value={data.cancelled_count} color="red" />
            <StatCard label="Chiffre d'affaires" value={money(data.revenue)} color="green" sub={pctSub(data.revenue_delta_pct)} />
            <StatCard label="Panier moyen" value={money(data.avg_basket)} color="cyan" />
          </div>

          {/* Taux de livraison + délais moyens entre statuts */}
          <div className="rounded-xl border p-5 flex flex-col sm:flex-row items-center gap-8" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <DeliveryRateDonut rate={data.delivery_rate ?? 0} />
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
              {[
                { label: 'Confirmation → Expédition', value: data.avg_delays?.confirmation_to_shipped_seconds },
                { label: 'Expédition → Livraison',     value: data.avg_delays?.shipped_to_delivered_seconds },
                { label: 'Expédition → Retour',        value: data.avg_delays?.shipped_to_returned_seconds },
              ].map(d => (
                <div key={d.label} className="text-center rounded-lg p-3" style={{ background: theme.dark.cardAlt }}>
                  <p className="text-lg font-bold text-app-primary">{formatDuration(d.value)}</p>
                  <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{d.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tableau quotidien avec pourcentages */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
            <div className="px-5 py-3.5 border-b" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
              <h2 className="text-sm font-semibold text-app-primary">Évolution quotidienne</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-160">
                <thead style={{ background: theme.dark.sidebar }}>
                  <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                    <th className="px-4 py-2.5 font-medium">DATE</th>
                    <th className="px-4 py-2.5 font-medium text-center">COMMANDES</th>
                    <th className="px-4 py-2.5 font-medium text-center">CONFIRMÉ</th>
                    <th className="px-4 py-2.5 font-medium text-center">EXPÉDIÉ</th>
                    <th className="px-4 py-2.5 font-medium text-center">LIVRÉ</th>
                    <th className="px-4 py-2.5 font-medium text-center">PAYÉ</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.daily || []).length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-app-muted">Aucune commande sur cette période.</td></tr>
                  ) : data.daily.map(d => (
                    <tr key={d.date} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
                      <td className="px-4 py-2.5 text-app-primary">{new Date(d.date).toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-2.5 text-center text-app-primary font-medium">{d.orders}</td>
                      <td className="px-4 py-2.5 text-center text-app-muted-light">{d.confirmed}/{d.orders} <span className="text-emerald-400">{d.confirmed_pct}%</span></td>
                      <td className="px-4 py-2.5 text-center text-app-muted-light">{d.shipped}/{d.orders} <span className="text-blue-400">{d.shipped_pct}%</span></td>
                      <td className="px-4 py-2.5 text-center text-app-muted-light">{d.delivered}/{d.orders} <span className="text-emerald-400">{d.delivered_pct}%</span></td>
                      <td className="px-4 py-2.5 text-center text-app-muted-light">{d.paid}/{d.orders} <span className="text-violet-400">{d.paid_pct}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
