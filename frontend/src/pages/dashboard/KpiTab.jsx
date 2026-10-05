import { useEffect, useState, useCallback } from 'react'
import { Spinner } from '../orders/stats/statsShared'
import api from '../../api/axios'
import { theme } from '../../theme'
import AISummaryCard from '../../components/AISummaryCard'
import { tt } from '../../i18n'
import { useTranslation } from 'react-i18next'

const COLUMNS = [
  { key: 'orders',    label: tt('Commandes') },
  { key: 'confirmed', label: tt('Confirmé') },
  { key: 'shipped',   label: tt('Expédié') },
  { key: 'delivered', label: tt('Livré') },
  { key: 'paid',      label: tt('Payé') },
  { key: 'returned',  label: tt('Retour') },
]

function KpiTable({ rows, nameKey }) {
  const { t, t: tr } = useTranslation('dashboard')
  const totals = COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: rows.reduce((s, r) => s + r[c.key], 0) }), {})
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-start text-xs" style={{ color: theme.dark.muted }}>
              <th className="px-4 py-3 font-medium">{nameKey === 'source' ? t('PLATEFORME SOURCE') : tr('WILAYA')}</th>
              {COLUMNS.map(c => <th key={c.key} className="px-4 py-3 font-medium text-end">{c.label.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center" style={{ color: theme.dark.muted }}>{t('Aucune donnée sur cette période.')}</td></tr>
            ) : rows.map(r => (
              <tr key={r[nameKey]} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary font-medium">{r[nameKey]}</td>
                {COLUMNS.map(c => <td key={c.key} className="px-4 py-3 text-end text-app-muted-light">{r[c.key]}</td>)}
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t" style={{ borderColor: theme.dark.border, background: theme.dark.sidebar }}>
                <td className="px-4 py-3 font-semibold text-app-primary">{t('Total')}</td>
                {COLUMNS.map(c => <td key={c.key} className="px-4 py-3 text-end font-semibold text-app-primary">{totals[c.key]}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function KpiTab({ queryString }) {
  const { t } = useTranslation('dashboard')
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
  if (!data) return <p className="text-sm" style={{ color: theme.dark.muted }}>{t('Impossible de charger les statistiques.')}</p>

  return (
    <div className="space-y-6">
      <AISummaryCard tab="kpi" queryString={queryString} />
      <div>
        <p className="text-sm font-semibold text-app-primary mb-3">{t('Top 5 des sources en termes de commandes')}</p>
        <KpiTable rows={data.top_sources} nameKey="source" />
      </div>
      <div>
        <p className="text-sm font-semibold text-app-primary mb-3">{t('Top 5 des wilayas en termes de ventes')}</p>
        <KpiTable rows={data.top_wilayas} nameKey="wilaya" />
      </div>
    </div>
  )
}
