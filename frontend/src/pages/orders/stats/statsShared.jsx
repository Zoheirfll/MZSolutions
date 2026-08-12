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

  // Bornes de dates résolues (ISO) quel que soit le type de période — pour le
  // drill-down vers OrdersPage, qui filtre par date_from/date_to réels, pas
  // par mot-clé "period=week". Mêmes règles que orders/utils.py::parse_period.
  const resolvedRange = useCallback(() => {
    const toIso = (d) => d.toISOString().slice(0, 10)
    const today = new Date()
    if (period === 'day') return { from: toIso(today), to: toIso(today) }
    if (period === 'month') {
      const from = new Date(today); from.setDate(from.getDate() - 30)
      return { from: toIso(from), to: toIso(today) }
    }
    if (period === 'custom' && dateFrom && dateTo) return { from: dateFrom, to: dateTo }
    const from = new Date(today); from.setDate(from.getDate() - 7)
    return { from: toIso(from), to: toIso(today) }
  }, [period, dateFrom, dateTo])

  return { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, queryString, resolvedRange, ready }
}

export function PeriodFilter({ period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo }) {
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => setPeriod(p.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            period === p.value ? 'text-white bg-violet-600' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
          }`}
          style={period === p.value ? undefined : { border: `1px solid ${theme.dark.border}` }}
        >
          {p.label}
        </button>
      ))}
      {period === 'custom' && (
        <div className="flex items-center gap-2 ml-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 [color-scheme:dark]"
            style={{ borderColor: theme.dark.border }} />
          <span className="text-app-muted text-sm">→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 [color-scheme:dark]"
            style={{ borderColor: theme.dark.border }} />
        </div>
      )}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 text-app-muted py-16">
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

// Badge de tendance vs période précédente, réutilisé sur toutes les pages de
// stats (pattern initialement propre à ConfirmationRatePage). `pct` = delta
// déjà calculé côté serveur (`_pct_delta`, `null` si non comparable).
export function TrendBadge({ pct }) {
  if (pct === null || pct === undefined) return null
  const positive = pct >= 0
  return (
    <span className={`text-xs font-medium ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? '+' : ''}{pct}% vs préc.
    </span>
  )
}

function DownloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 2v6h-6M3 22v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0020.49 15" />
    </svg>
  )
}

// Barre d'actions commune (bouton Actualiser + Exporter en CSV), placée à
// droite du PeriodFilter sur chaque page de stats.
export function StatsToolbar({ onRefresh, onExport, exporting, exportDisabled }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onRefresh}
        className="px-3 py-1.5 rounded-lg text-sm font-medium border text-app-primary hover:bg-violet-500/5 transition cursor-pointer flex items-center gap-1.5"
        style={{ borderColor: theme.dark.border }}>
        <RefreshIcon /> Actualiser
      </button>
      {onExport && (
        <button onClick={onExport} disabled={exporting || exportDisabled}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border text-app-primary hover:bg-violet-500/5 disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
          style={{ borderColor: theme.dark.border }}>
          <DownloadIcon /> {exporting ? 'Export…' : 'Exporter en CSV'}
        </button>
      )}
    </div>
  )
}

// Télécharge le CSV généré par le backend (`?export=csv`, même filtres que la
// page) via un fetch authentifié (le lien direct <a href> n'inclurait pas le
// header Authorization).
export async function downloadCsv(api, url, filename) {
  const { data } = await api.get(url, { responseType: 'blob' })
  const blobUrl = window.URL.createObjectURL(new Blob([data]))
  const link = document.createElement('a')
  link.href = blobUrl
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(blobUrl)
}

// Pagination simple, réutilisée sur les pages stats listant produits/wilayas/
// raisons d'échec/ventes de stock (bornées côté serveur depuis cette passe).
export function StatsPagination({ page, setPage, count, perPage }) {
  const totalPages = Math.max(1, Math.ceil(count / perPage))
  if (count <= perPage) return null
  return (
    <div className="flex items-center justify-end gap-2 mt-3 text-sm" style={{ color: theme.dark.muted }}>
      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">← Précédent</button>
      <span className={theme.badge.info}>{page}/{totalPages}</span>
      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">Suivant →</button>
    </div>
  )
}
