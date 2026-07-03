import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../../components/DashboardLayout'
import StatCard from '../../../components/StatCard'
import api from '../../../api/axios'
import { usePeriod, PeriodFilter, Spinner, money } from './statsShared'

export default function GlobalStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/global/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  return (
    <DashboardLayout title="Statistiques globales">
      <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      {loading || !data ? <Spinner /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCard label="Commandes" value={data.total_orders} color="violet" />
          <StatCard label="Taux de confirmation" value={`${data.confirmation_rate}%`} color="blue" />
          <StatCard label="Livrées" value={data.delivered_count} color="green" />
          <StatCard label="Retournées" value={data.returned_count} color="red" />
          <StatCard label="Annulées" value={data.cancelled_count} color="red" />
          <StatCard label="Chiffre d'affaires" value={money(data.revenue)} color="green" />
          <StatCard label="Panier moyen" value={money(data.avg_basket)} color="cyan" />
        </div>
      )}
    </DashboardLayout>
  )
}
