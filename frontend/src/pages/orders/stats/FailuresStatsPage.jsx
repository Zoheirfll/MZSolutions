import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, StatsToolbar, TrendBadge, StatsPagination, downloadCsv } from './statsShared'

export default function FailuresStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [exporting, setExporting] = useState(false)
  const perPage = 20

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/failures/?${queryString()}&page=${page}&per_page=${perPage}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString, page])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])
  useEffect(() => { setPage(1) }, [queryString])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv(api, `/orders/stats/failures/?${queryString()}&export=csv`, 'echecs.csv')
    } finally { setExporting(false) }
  }

  return (
    <DashboardLayout title="Statistique des échecs" subtitle="Cette page vous montre, sous forme de graphique, quelles sont les raisons qui reviennent le plus souvent quand vos confirmateurs n'arrivent pas à valider une commande par téléphone. Cela vous aide à comprendre pourquoi vous perdez des ventes : trop de clients injoignables ? Trop d'annulations pour cause de délai ? Choisissez la période à analyser en haut de page.">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <StatsToolbar onRefresh={fetchData} onExport={handleExport} exporting={exporting} exportDisabled={!data?.total} />
      </div>
      {loading || !data ? <Spinner /> : (
        <>
          <p className="text-sm mb-5 flex items-center gap-2" style={{ color: theme.dark.muted }}>
            {data.total} tentative{data.total !== 1 ? 's' : ''} d'appel en échec sur la période.
            <TrendBadge pct={data.total_delta_pct} />
          </p>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-140">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">RAISON</th>
                  <th className="px-4 py-3 font-medium">NOMBRE</th>
                  <th className="px-4 py-3 font-medium">PART</th>
                </tr>
              </thead>
              <tbody>
                {data.by_reason.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-app-muted">Aucun échec sur cette période.</td></tr>
                ) : data.by_reason.map(r => (
                  <tr key={r.reason_id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary">{r.label}</td>
                    <td className="px-4 py-3 text-app-primary">{r.count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full max-w-32" style={{ background: theme.dark.border }}>
                          <div className="h-full rounded-full bg-red-500" style={{ width: `${r.percentage}%` }} />
                        </div>
                        <span className="text-app-muted-light text-xs">{r.percentage}%</span>
                      </div>
                    </td>
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
