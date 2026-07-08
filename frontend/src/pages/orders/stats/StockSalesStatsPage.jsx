import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner } from './statsShared'

export default function StockSalesStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/stock-sales/?${queryString()}`)
      .then(({ data }) => setResults(data.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  const totalUnits = results.reduce((s, r) => s + r.units_sold, 0)

  return (
    <DashboardLayout title="Statistique vente de stock">
      <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      {loading ? <Spinner /> : (
        <>
          <p className="text-sm mb-5" style={{ color: theme.dark.muted }}>{totalUnits} unité{totalUnits !== 1 ? 's' : ''} vendue{totalUnits !== 1 ? 's' : ''} sur la période.</p>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-140">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">PRODUIT</th>
                  <th className="px-4 py-3 font-medium">UNITÉS VENDUES</th>
                  <th className="px-4 py-3 font-medium">MOUVEMENTS</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-500">Aucune vente sur cette période.</td></tr>
                ) : results.map(r => (
                  <tr key={r.product_id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-gray-200">{r.product_name}</td>
                    <td className="px-4 py-3 text-gray-300">{r.units_sold}</td>
                    <td className="px-4 py-3 text-gray-500">{r.movements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
