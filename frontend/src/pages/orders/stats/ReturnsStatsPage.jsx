import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'
import StatCard from '../../../components/StatCard'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner } from './statsShared'

export default function ReturnsStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/returns/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  const dailyChart = (data?.daily || []).map(d => ({
    date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    count: d.count,
  }))

  return (
    <DashboardLayout title="Statistique retours">
      <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      {loading || !data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Commandes" value={data.total_orders} color="violet" />
            <StatCard label="Retournées" value={data.returned_count} color="red" />
            <StatCard label="Demandes d'annulation" value={data.cancel_requested_count} color="orange" />
            <StatCard label="Taux de retour" value={`${data.return_rate}%`} color="red" />
          </div>
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <p className="text-sm font-medium text-gray-300 mb-4">Évolution des retours</p>
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
