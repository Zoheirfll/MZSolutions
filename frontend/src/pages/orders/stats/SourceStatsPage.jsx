import { useEffect, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, money, PIE_COLORS, StatsToolbar, TrendBadge, downloadCsv } from './statsShared'

export default function SourceStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/sources/?${queryString()}`)
      .then(({ data }) => setResults(data.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv(api, `/orders/stats/sources/?${queryString()}&export=csv`, 'sources.csv')
    } finally { setExporting(false) }
  }

  return (
    <DashboardLayout title="Statistiques des sources" subtitle="Cette page compare vos différents canaux de vente : les commandes passées directement sur votre boutique en ligne, celles que vous avez saisies vous-même manuellement, et celles apportées par vos dropshippers. MZSolutions détecte automatiquement la source de chaque commande, vous n'avez rien à indiquer vous-même. Utile pour savoir quel canal vous rapporte le plus.">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <StatsToolbar onRefresh={fetchData} onExport={handleExport} exporting={exporting} exportDisabled={results.length === 0} />
      </div>
      {loading ? <Spinner /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <p className="text-sm font-medium text-app-primary mb-4">Répartition des commandes par source</p>
            {results.length === 0 ? (
              <p className="text-sm text-app-muted py-16 text-center">Aucune commande sur cette période.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={results} dataKey="orders_count" nameKey="source" cx="50%" cy="50%" outerRadius={90}>
                    {results.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: theme.dark.sidebar, border: `1px solid ${theme.dark.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">SOURCE</th>
                  <th className="px-4 py-3 font-medium">COMMANDES</th>
                  <th className="px-4 py-3 font-medium">CONFIRMÉES</th>
                  <th className="px-4 py-3 font-medium">REVENU</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-app-muted">—</td></tr>
                ) : results.map(r => (
                  <tr key={r.source} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary">{r.source}</td>
                    <td className="px-4 py-3 text-app-primary">
                      <div className="flex items-center gap-2">
                        {r.orders_count}
                        <TrendBadge pct={r.orders_count_delta_pct} />
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={theme.badge.success}>{r.confirmed_count}</span></td>
                    <td className="px-4 py-3 text-app-primary">{money(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
