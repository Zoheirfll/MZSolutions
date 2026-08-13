import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, money, StatsToolbar, TrendBadge, StatsPagination, downloadCsv } from './statsShared'

export default function WilayaStatsPage() {
  const navigate = useNavigate()
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, resolvedRange, ready } = usePeriod()
  const [data, setData]       = useState({ results: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [exporting, setExporting] = useState(false)
  const perPage = 20

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/wilayas/?${queryString()}&page=${page}&per_page=${perPage}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString, page])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])
  useEffect(() => { setPage(1) }, [queryString])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv(api, `/orders/stats/wilayas/?${queryString()}&export=csv`, 'wilayas.csv')
    } finally { setExporting(false) }
  }

  const goToWilayaOrders = (wilaya) => {
    if (wilaya === '—') return
    const { from, to } = resolvedRange()
    navigate(`/dashboard/commandes?wilaya=${encodeURIComponent(wilaya)}&date_from=${from}&date_to=${to}`)
  }

  const results = data.results || []

  return (
    <DashboardLayout title="Statistiques par wilaya" subtitle="Cette page classe vos ventes par wilaya de livraison : combien de commandes viennent de chaque wilaya, leur taux de confirmation et le revenu généré. Cela vous aide à repérer vos zones géographiques les plus rentables, ou celles où le taux de confirmation est faible (peut-être à cause de délais de livraison trop longs).">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <StatsToolbar onRefresh={fetchData} onExport={handleExport} exporting={exporting} exportDisabled={results.length === 0} />
      </div>
      {loading ? <Spinner /> : (
        <>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-140">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">WILAYA</th>
                  <th className="px-4 py-3 font-medium">COMMANDES</th>
                  <th className="px-4 py-3 font-medium">CONFIRMÉES</th>
                  <th className="px-4 py-3 font-medium">REVENU</th>
                  <th className="px-4 py-3 font-medium">MEILLEUR PRODUIT</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-app-muted">Aucune commande sur cette période.</td></tr>
                ) : results.map(r => (
                  <tr key={r.wilaya} onClick={() => goToWilayaOrders(r.wilaya)}
                    className="border-b hover:bg-violet-500/5 transition cursor-pointer" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary">{r.wilaya}</td>
                    <td className="px-4 py-3 text-app-primary">
                      <div className="flex items-center gap-2">
                        {r.orders_count}
                        <TrendBadge pct={r.orders_count_delta_pct} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={theme.badge.success}>{r.confirmed_count}</span>
                    </td>
                    <td className="px-4 py-3 text-app-primary">{money(r.revenue)}</td>
                    <td className="px-4 py-3 text-app-muted-light max-w-40 truncate" title={r.best_product}>{r.best_product}</td>
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
