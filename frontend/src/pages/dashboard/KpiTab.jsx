import { useEffect, useState, useCallback } from 'react'
import { Spinner } from '../orders/stats/statsShared'
import api from '../../api/axios'
import { theme } from '../../theme'

const COLUMNS = [
  { key: 'orders',    label: 'Commandes' },
  { key: 'confirmed', label: 'Confirmé' },
  { key: 'shipped',   label: 'Expédié' },
  { key: 'delivered', label: 'Livré' },
  { key: 'paid',      label: 'Payé' },
  { key: 'returned',  label: 'Retour' },
]

function KpiTable({ rows, nameKey }) {
  const totals = COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: rows.reduce((s, r) => s + r[c.key], 0) }), {})
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs" style={{ color: theme.dark.muted }}>
              <th className="px-4 py-3 font-medium">{nameKey === 'source' ? 'PLATEFORME SOURCE' : 'WILAYA'}</th>
              {COLUMNS.map(c => <th key={c.key} className="px-4 py-3 font-medium text-right">{c.label.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center" style={{ color: theme.dark.muted }}>Aucune donnée sur cette période.</td></tr>
            ) : rows.map(r => (
              <tr key={r[nameKey]} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary font-medium">{r[nameKey]}</td>
                {COLUMNS.map(c => <td key={c.key} className="px-4 py-3 text-right text-app-muted-light">{r[c.key]}</td>)}
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t" style={{ borderColor: theme.dark.border, background: theme.dark.sidebar }}>
                <td className="px-4 py-3 font-semibold text-app-primary">Total</td>
                {COLUMNS.map(c => <td key={c.key} className="px-4 py-3 text-right font-semibold text-app-primary">{totals[c.key]}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function KpiTab({ queryString }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/dashboard/kpi/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm" style={{ color: theme.dark.muted }}>Impossible de charger les statistiques.</p>

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-app-primary mb-3">Top 5 des sources en termes de commandes</p>
        <KpiTable rows={data.top_sources} nameKey="source" />
      </div>
      <div>
        <p className="text-sm font-semibold text-app-primary mb-3">Top 5 des wilayas en termes de ventes</p>
        <KpiTable rows={data.top_wilayas} nameKey="wilaya" />
      </div>
    </div>
  )
}
