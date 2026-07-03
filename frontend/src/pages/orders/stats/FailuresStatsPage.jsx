import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { usePeriod, PeriodFilter, Spinner } from './statsShared'

export default function FailuresStatsPage() {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/failures/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  return (
    <DashboardLayout title="Statistique des échecs">
      <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      {loading || !data ? <Spinner /> : (
        <>
          <p className="text-sm mb-5" style={{ color: theme.dark.muted }}>{data.total} tentative{data.total !== 1 ? 's' : ''} d'appel en échec sur la période.</p>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-140">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">RAISON</th>
                  <th className="px-4 py-3 font-medium">NOMBRE</th>
                  <th className="px-4 py-3 font-medium">PART</th>
                </tr>
              </thead>
              <tbody>
                {data.by_reason.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-500">Aucun échec sur cette période.</td></tr>
                ) : data.by_reason.map(r => (
                  <tr key={r.reason_id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                    <td className="px-4 py-3 text-gray-200">{r.label}</td>
                    <td className="px-4 py-3 text-gray-300">{r.count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full max-w-32" style={{ background: theme.dark.border }}>
                          <div className="h-full rounded-full bg-red-500" style={{ width: `${r.percentage}%` }} />
                        </div>
                        <span className="text-gray-400 text-xs">{r.percentage}%</span>
                      </div>
                    </td>
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
