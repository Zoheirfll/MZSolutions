import { useState, useCallback } from 'react'
import { theme } from '../../../theme'

export const PERIODS = [
  { value: 'day',   label: "Aujourd'hui" },
  { value: 'week',  label: '7 derniers jours' },
  { value: 'month', label: '30 derniers jours' },
  { value: 'custom', label: 'Personnalisé' },
]

export function usePeriod(initial = 'week') {
  const [period, setPeriod]     = useState(initial)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  // Mémoïsé sur (period, dateFrom, dateTo) — une référence instable ici
  // (recréée à chaque rendu) casse les useCallback qui en dépendent dans
  // les pages appelantes et provoque une boucle de fetch infinie (spinner
  // bloqué sur "Chargement…", bug rencontré au premier test de l'Epic 8.1).
  const queryString = useCallback(() => {
    const params = new URLSearchParams({ period })
    if (period === 'custom' && dateFrom && dateTo) {
      params.set('date_from', dateFrom)
      params.set('date_to', dateTo)
    }
    return params.toString()
  }, [period, dateFrom, dateTo])

  const ready = period !== 'custom' || (dateFrom && dateTo)

  return { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, ready }
}

export function PeriodFilter({ period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo }) {
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => setPeriod(p.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            period === p.value ? 'text-white bg-violet-600' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
          }`}
          style={period === p.value ? undefined : { border: `1px solid ${theme.dark.border}` }}
        >
          {p.label}
        </button>
      ))}
      {period === 'custom' && (
        <div className="flex items-center gap-2 ml-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 [color-scheme:dark]"
            style={{ borderColor: theme.dark.border }} />
          <span className="text-gray-500 text-sm">→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 [color-scheme:dark]"
            style={{ borderColor: theme.dark.border }} />
        </div>
      )}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 text-gray-500 py-16">
      <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Chargement…
    </div>
  )
}

export const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

export const PIE_COLORS = ['#7c3aed', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16']
