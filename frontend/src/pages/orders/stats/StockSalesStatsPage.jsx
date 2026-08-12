import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, StatsToolbar, TrendBadge, StatsPagination, downloadCsv } from './statsShared'

export default function StockSalesStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [data, setData]       = useState({ results: [], count: 0, excluded_movements: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [exporting, setExporting] = useState(false)
  const perPage = 20

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/stock-sales/?${queryString()}&page=${page}&per_page=${perPage}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString, page])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])
  useEffect(() => { setPage(1) }, [queryString])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv(api, `/orders/stats/stock-sales/?${queryString()}&export=csv`, 'vente-stock.csv')
    } finally { setExporting(false) }
  }

  const results = data.results || []
  const totalUnits = results.reduce((s, r) => s + r.units_sold, 0)

  return (
    <DashboardLayout title="Statistique vente de stock">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <StatsToolbar onRefresh={fetchData} onExport={handleExport} exporting={exporting} exportDisabled={results.length === 0} />
      </div>
      {loading ? <Spinner /> : (
        <>
          <p className="text-sm mb-2" style={{ color: theme.dark.muted }}>{totalUnits} unité{totalUnits !== 1 ? 's' : ''} vendue{totalUnits !== 1 ? 's' : ''} sur la période (page courante).</p>
          {data.excluded_movements > 0 && (
            <p className="text-xs mb-5 text-amber-400">
              {data.excluded_movements} mouvement{data.excluded_movements !== 1 ? 's' : ''} de vente exclu{data.excluded_movements !== 1 ? 's' : ''} des totaux — produit supprimé depuis, non attribuable.
            </p>
          )}
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
                    <td className="px-4 py-3 text-gray-300">
                      <div className="flex items-center gap-2">
                        {r.units_sold}
                        <TrendBadge pct={r.units_sold_delta_pct} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{r.movements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <StatsPagination page={page} setPage={setPage} count={data.count} perPage={perPage} />
        </>
      )}
    </DashboardLayout>
  )
}
