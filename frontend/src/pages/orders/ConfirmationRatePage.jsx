import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const PERIODS = [
  { value: 'day',   label: "Aujourd'hui" },
  { value: 'week',  label: '7 derniers jours' },
  { value: 'month', label: '30 derniers jours' },
  { value: 'custom', label: 'Personnalisé' },
]

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

export default function ConfirmationRatePage() {
  const [period,    setPeriod]   = useState('week')
  const [dateFrom,  setDateFrom] = useState('')
  const [dateTo,    setDateTo]   = useState('')
  const [data,      setData]     = useState(null)
  const [loading,   setLoading]  = useState(true)

  const fetch = useCallback(() => {
    setLoading(true)
    let url = `/orders/stats/confirmation/?period=${period}`
    if (period === 'custom' && dateFrom && dateTo) {
      url += `&date_from=${dateFrom}&date_to=${dateTo}`
    }
    api.get(url)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [period, dateFrom, dateTo])

  useEffect(() => {
    if (period !== 'custom' || (dateFrom && dateTo)) fetch()
  }, [fetch, period, dateFrom, dateTo])

  const globalRate = data?.confirmation_rate ?? 0

  return (
    <DashboardLayout title="Taux de confirmation">

      {/* Filtres */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              period === p.value
                ? 'text-white bg-violet-600'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            style={period === p.value ? undefined : { border: `1px solid ${theme.dark.border}` }}
          >
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500"
              style={{ borderColor: theme.dark.border }}
            />
            <span className="text-gray-500 text-sm">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500"
              style={{ borderColor: theme.dark.border }}
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-gray-500 py-16">
          <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Chargement…
        </div>
      ) : !data ? (
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
            </div>

            {/* Chiffres */}
            <div className="flex-1 grid grid-cols-3 gap-6">
              {[
                { label: 'Commandes traitées', value: data.total_processed, color: 'text-gray-200' },
                { label: 'Confirmées', value: data.total_confirmed, color: 'text-emerald-400' },
                { label: 'Non confirmées', value: data.total_processed - data.total_confirmed, color: 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={`text-3xl font-bold ${color}`}>{value}</p>
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

          {/* Classement confirmateurs */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
            <div className="px-5 py-3.5 border-b" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
              <h2 className="text-sm font-semibold text-gray-200">Classement par confirmateur</h2>
            </div>
            <table className="w-full text-sm">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                  <th className="px-5 py-3 font-medium">RANG</th>
                  <th className="px-5 py-3 font-medium">NOM</th>
                  <th className="px-5 py-3 font-medium text-center">TRAITÉES</th>
                  <th className="px-5 py-3 font-medium text-center">CONFIRMÉES</th>
                  <th className="px-5 py-3 font-medium text-center">TAUX</th>
                </tr>
              </thead>
              <tbody>
                {data.by_confirmateur.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-500">
                      Aucune commande assignée sur cette période.
                    </td>
                  </tr>
                ) : data.by_confirmateur.map((c, i) => (
                  <tr key={c.confirmateur_id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
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
      )}
    </DashboardLayout>
  )
}
