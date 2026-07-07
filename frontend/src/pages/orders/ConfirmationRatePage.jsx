import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, PieChart, Pie, Cell, Legend, Tooltip, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'
import { usePeriod, PeriodFilter, Spinner, PIE_COLORS } from './stats/statsShared'

function rateBadge(rate) {
  if (rate >= 70) return theme.badge.success
  if (rate >= 40) return theme.badge.warning
  return theme.badge.danger
}

function rateColor(rate) {
  if (rate >= 70) return '#34d399'
  if (rate >= 40) return '#fbbf24'
  return '#f87171'
}

function TrendDelta({ current, previous }) {
  if (previous === null || previous === undefined) return null
  const delta = Math.round((current - previous) * 10) / 10
  if (delta === 0) return <span className="text-xs" style={{ color: theme.dark.muted }}>= vs période précédente ({previous}%)</span>
  const up = delta > 0
  return (
    <span className={`text-xs font-medium inline-flex items-center gap-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"
        style={{ transform: up ? 'none' : 'rotate(180deg)' }}>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
      {up ? '+' : ''}{delta}% vs période précédente ({previous}%)
    </span>
  )
}

export default function ConfirmationRatePage() {
  const navigate = useNavigate()
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready } = usePeriod()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/confirmation/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { if (ready) fetchData() }, [fetchData, ready])

  const globalRate = data?.confirmation_rate ?? 0

  const dailyChart = (data?.daily || []).map(d => ({
    date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    rate: d.rate,
    processed: d.processed,
    confirmed: d.confirmed,
  }))

  return (
    <DashboardLayout title="Taux de confirmation">
      <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />

      {loading ? <Spinner /> : !data ? (
        <p className="text-gray-500 text-center py-16">Erreur de chargement.</p>
      ) : (
        <div className="space-y-5">

          {/* KPI global */}
          <div className="rounded-xl border p-6 sm:p-8 flex flex-col lg:flex-row items-center gap-8 lg:gap-10" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            {/* Cercle taux */}
            <div className="flex flex-col items-center shrink-0">
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke={theme.dark.border} strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="50"
                    fill="none"
                    stroke={rateColor(globalRate)}
                    strokeWidth="10"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - globalRate / 100)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white">{globalRate}%</span>
                </div>
              </div>
              <p className="text-sm mt-2 font-medium" style={{ color: rateColor(globalRate) }}>Taux global</p>
              <TrendDelta current={globalRate} previous={data.previous_rate} />
            </div>

            {/* Chiffres */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-6">
              {[
                { label: 'Commandes traitées', value: data.total_processed, color: 'text-gray-200' },
                { label: 'Confirmées', value: data.total_confirmed, color: 'text-emerald-400' },
                { label: 'Non joignable', value: data.no_answer_total, color: 'text-amber-400' },
                { label: 'Retournées', value: data.returned_total, color: 'text-red-400' },
                { label: 'Annulées', value: data.cancelled_total, color: 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Période */}
            <div className="text-right shrink-0">
              <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>Période</p>
              <p className="text-sm text-gray-300">{data.date_from}</p>
              <p className="text-xs" style={{ color: theme.dark.muted }}>→</p>
              <p className="text-sm text-gray-300">{data.date_to}</p>
            </div>
          </div>

          {/* Tendance + répartition */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <p className="text-sm font-medium text-gray-300 mb-4">Évolution du taux de confirmation</p>
              {dailyChart.length === 0 ? (
                <p className="text-sm text-gray-500 py-16 text-center">Aucune commande traitée sur cette période.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={dailyChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: theme.dark.muted }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: theme.dark.muted }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip
                      contentStyle={{ background: theme.dark.sidebar, border: `1px solid ${theme.dark.border}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(value, name) => name === 'rate' ? [`${value}%`, 'Taux'] : [value, name === 'processed' ? 'Traitées' : 'Confirmées']}
                    />
                    <Area type="monotone" dataKey="rate" name="rate" stroke="#7c3aed" strokeWidth={2} fill="url(#rateGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <p className="text-sm font-medium text-gray-300 mb-4">Répartition des commandes traitées</p>
              {(data.by_status || []).length === 0 ? (
                <p className="text-sm text-gray-500 py-16 text-center">Aucune commande traitée sur cette période.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={data.by_status} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={85}>
                      {data.by_status.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: theme.dark.sidebar, border: `1px solid ${theme.dark.border}`, borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Classement confirmateurs */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
            <div className="px-5 py-3.5 border-b" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
              <h2 className="text-sm font-semibold text-gray-200">Classement par confirmateur</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-160">
                <thead style={{ background: theme.dark.sidebar }}>
                  <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                    <th className="px-5 py-3 font-medium">RANG</th>
                    <th className="px-5 py-3 font-medium">NOM</th>
                    <th className="px-5 py-3 font-medium text-center">TRAITÉES</th>
                    <th className="px-5 py-3 font-medium text-center">CONFIRMÉES</th>
                    <th className="px-5 py-3 font-medium text-center">NON JOIGNABLE</th>
                    <th className="px-5 py-3 font-medium text-center">RETOURNÉES</th>
                    <th className="px-5 py-3 font-medium text-center">ANNULÉES</th>
                    <th className="px-5 py-3 font-medium text-center">TAUX</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_confirmateur.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-500">
                        Aucune commande assignée sur cette période.
                      </td>
                    </tr>
                  ) : data.by_confirmateur.map((c, i) => (
                    <tr
                      key={c.confirmateur_id}
                      className="border-b hover:bg-white/2 transition cursor-pointer"
                      style={{ borderColor: theme.dark.border + '44' }}
                      onClick={() => navigate(`/dashboard/commandes?confirmateur=${c.confirmateur_id}`)}
                    >
                      <td className="px-5 py-3.5">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400' :
                          i === 1 ? 'bg-gray-500/20 text-gray-300' :
                          i === 2 ? 'bg-orange-800/20 text-orange-400' :
                          'bg-transparent text-gray-500'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-200 font-medium">{c.confirmateur_name}</td>
                      <td className="px-5 py-3.5 text-center text-gray-300">{c.processed}</td>
                      <td className="px-5 py-3.5 text-center text-emerald-400 font-medium">{c.confirmed}</td>
                      <td className="px-5 py-3.5 text-center text-amber-400">{c.no_answer}</td>
                      <td className="px-5 py-3.5 text-center text-red-400">{c.returned}</td>
                      <td className="px-5 py-3.5 text-center text-red-400">{c.cancelled}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={rateBadge(c.rate)}>
                          {c.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
