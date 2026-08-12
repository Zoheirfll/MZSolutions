import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, PieChart, Pie, Cell, Legend, Tooltip, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, PIE_COLORS, StatsToolbar, TrendBadge, downloadCsv } from './statsShared'

export default function OrdersStatsPage() {
  const navigate = useNavigate()
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, resolvedRange, ready } = usePeriod()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/orders/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv(api, `/orders/stats/orders/?${queryString()}&export=csv`, 'commandes-quotidien.csv')
    } finally { setExporting(false) }
  }

  const goToOrders = (extra = {}) => {
    const { from, to } = resolvedRange()
    const params = new URLSearchParams({ date_from: from, date_to: to, ...extra })
    navigate(`/dashboard/commandes?${params}`)
  }

  const dailyChart = (data?.daily || []).map(d => ({
    date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    count: d.count,
  }))

  return (
    <DashboardLayout title="Statistiques commandes" subtitle="Cette page trace un graphique montrant combien de commandes vous recevez chaque jour sur la période choisie, pour repérer vos tendances (jours forts, baisses...), ainsi qu'un camembert montrant la proportion de commandes dans chaque statut.">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <StatsToolbar onRefresh={fetchData} onExport={handleExport} exporting={exporting} exportDisabled={!data?.total} />
      </div>
      {loading || !data ? <Spinner /> : (
        <>
          <p className="text-sm mb-5 flex items-center gap-2" style={{ color: theme.dark.muted }}>
            {data.total} commande{data.total !== 1 ? 's' : ''} sur la période.
            <TrendBadge pct={data.total_delta_pct} />
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <p className="text-sm font-medium text-app-primary mb-4">Évolution quotidienne</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: theme.dark.muted }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.dark.muted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: theme.dark.sidebar, border: `1px solid ${theme.dark.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" name="Commandes" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <p className="text-sm font-medium text-app-primary mb-4">Répartition par statut <span className="font-normal text-xs" style={{ color: theme.dark.muted }}>(cliquer pour voir les commandes)</span></p>
              {data.by_status.length === 0 ? (
                <p className="text-sm text-app-muted py-16 text-center">Aucune commande sur cette période.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={data.by_status} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90}
                      onClick={(d) => goToOrders({ status: d.status })} className="cursor-pointer">
                      {data.by_status.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: theme.dark.sidebar, border: `1px solid ${theme.dark.border}`, borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
