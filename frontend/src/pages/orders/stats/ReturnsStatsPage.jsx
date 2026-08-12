import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'
import StatCard from '../../../components/StatCard'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, StatsToolbar, downloadCsv } from './statsShared'

function pctSub(pct) {
  if (pct === null || pct === undefined) return null
  return `${pct >= 0 ? '+' : ''}${pct}% vs préc.`
}

export default function ReturnsStatsPage() {
  const navigate = useNavigate()
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, resolvedRange, ready } = usePeriod()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/returns/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv(api, `/orders/stats/returns/?${queryString()}&export=csv`, 'retours-quotidien.csv')
    } finally { setExporting(false) }
  }

  const goToReturnedOrders = () => {
    const { from, to } = resolvedRange()
    navigate(`/dashboard/commandes?status=returned&date_from=${from}&date_to=${to}`)
  }

  const dailyChart = (data?.daily || []).map(d => ({
    date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    count: d.count,
  }))

  return (
    <DashboardLayout title="Statistique retours" subtitle="Cette page mesure combien de commandes vous reviennent en retour, et quel pourcentage cela représente par rapport à toutes vos commandes traitées. Un taux de retour élevé peut signaler un souci de qualité produit, de description trompeuse ou de mauvaise gestion des livraisons — surveillez son évolution jour par jour ici.">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <StatsToolbar onRefresh={fetchData} onExport={handleExport} exporting={exporting} exportDisabled={!data?.total_orders} />
      </div>
      {loading || !data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Commandes" value={data.total_orders} color="violet" />
            <button onClick={goToReturnedOrders} className="text-left cursor-pointer">
              <StatCard label="Retournées" value={data.returned_count} color="red" />
            </button>
            <StatCard label="Demandes d'annulation" value={data.cancel_requested_count} color="orange" />
            <StatCard label="Taux de retour" value={`${data.return_rate}%`} color="red" sub={pctSub(data.return_rate_delta_pct)} />
          </div>
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <p className="text-sm font-medium text-app-primary mb-4">Évolution des retours</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: theme.dark.muted }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.dark.muted }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: theme.dark.sidebar, border: `1px solid ${theme.dark.border}`, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="Retours" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
