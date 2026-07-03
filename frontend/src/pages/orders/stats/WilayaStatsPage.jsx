import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, money } from './statsShared'

export default function WilayaStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/wilayas/?${queryString()}`)
      .then(({ data }) => setResults(data.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  return (
    <DashboardLayout title="Statistiques par wilaya">
      <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      {loading ? <Spinner /> : (
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
          <table className="w-full text-sm min-w-140">
            <thead style={{ background: theme.dark.sidebar }}>
              <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                <th className="px-4 py-3 font-medium">WILAYA</th>
                <th className="px-4 py-3 font-medium">COMMANDES</th>
                <th className="px-4 py-3 font-medium">CONFIRMÉES</th>
                <th className="px-4 py-3 font-medium">REVENU</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">Aucune commande sur cette période.</td></tr>
              ) : results.map(r => (
                <tr key={r.wilaya} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                  <td className="px-4 py-3 text-gray-200">{r.wilaya}</td>
                  <td className="px-4 py-3 text-gray-300">{r.orders_count}</td>
                  <td className="px-4 py-3">
                    <span className={theme.badge.success}>{r.confirmed_count}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-200">{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}
