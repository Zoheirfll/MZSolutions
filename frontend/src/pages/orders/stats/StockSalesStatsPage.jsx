import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner, StatsToolbar, TrendBadge, StatsPagination, downloadCsv } from './statsShared'
import { useTranslation } from 'react-i18next'
import { sfx } from '../../../i18n'

export default function StockSalesStatsPage() {
  const { t } = useTranslation('dashboard')
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
    <DashboardLayout title={t('Statistique vente de stock')} subtitle={t('Cette page vous montre combien d\'unités de chaque produit ont réellement été vendues sur la période choisie, produit par produit — pratique pour savoir quels articles se vendent le mieux et lesquels réapprovisionner en priorité.')}>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <StatsToolbar onRefresh={fetchData} onExport={handleExport} exporting={exporting} exportDisabled={results.length === 0} />
      </div>
      {loading ? <Spinner /> : (
        <>
          <p className="text-sm mb-2" style={{ color: theme.dark.muted }}>{t('{{totalUnits}} unité', { totalUnits })}{totalUnits !== 1 ? sfx('s') : ''}{' '}{t('vendue')}{totalUnits !== 1 ? sfx('s') : ''}{' '}{t('sur la période (page courante).')}</p>
          {data.excluded_movements > 0 && (
            <p className="text-xs mb-5 text-amber-400">{t('{{excluded_movements}} mouvement', { excluded_movements: data.excluded_movements })}{data.excluded_movements !== 1 ? sfx('s') : ''}{' '}{t('de vente exclu')}{data.excluded_movements !== 1 ? sfx('s') : ''}{' '}{t('des totaux — produit supprimé depuis, non attribuable.')}</p>
          )}
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-140">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-start text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">{t('PRODUIT')}</th>
                  <th className="px-4 py-3 font-medium">{t('UNITÉS VENDUES')}</th>
                  <th className="px-4 py-3 font-medium">{t('MOUVEMENTS')}</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-app-muted">{t('Aucune vente sur cette période.')}</td></tr>
                ) : results.map(r => (
                  <tr key={r.product_id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary">{r.product_name}</td>
                    <td className="px-4 py-3 text-app-primary">
                      <div className="flex items-center gap-2">
                        {r.units_sold}
                        <TrendBadge pct={r.units_sold_delta_pct} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-app-muted">{r.movements}</td>
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
