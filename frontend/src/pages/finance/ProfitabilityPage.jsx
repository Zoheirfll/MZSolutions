import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import StatCard from '../../components/StatCard'
import api from '../../api/axios'
import { theme } from '../../theme'

const GROUP_OPTIONS = [
  { value: 'product', label: 'Par produit' },
  { value: 'wilaya',  label: 'Par wilaya' },
  { value: 'source',  label: 'Par source' },
]

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

export default function ProfitabilityPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [groupBy,  setGroupBy]  = useState('product')
  const [summary,  setSummary]  = useState(null)
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)

  const fetchAll = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateFrom) params.set('period_start', dateFrom)
    if (dateTo)   params.set('period_end', dateTo)
    const summaryParams = params.toString()
    const rowsParams = new URLSearchParams(summaryParams)
    rowsParams.set('group_by', groupBy)

    Promise.all([
      api.get(`/finance/profitability/summary/?${summaryParams}`),
      api.get(`/finance/profitability/?${rowsParams.toString()}`),
    ]).then(([s, r]) => {
      setSummary(s.data)
      setRows(r.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [dateFrom, dateTo, groupBy])

  useEffect(() => { fetchAll() }, [fetchAll])

  const inputCls = 'px-3 py-1.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title="Rentabilité">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} style={bdrStyle} />
        <span className="text-gray-500 text-sm">→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} style={bdrStyle} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-gray-500 hover:text-gray-300 transition cursor-pointer">Réinitialiser</button>
        )}
      </div>

      {loading || !summary ? (
        <p className="text-gray-500 text-sm py-10 text-center">Chargement…</p>
      ) : (
        <>
          <p className="text-xs mb-3" style={{ color: theme.dark.muted }}>
            Basé sur {summary.orders_count} commande{summary.orders_count !== 1 ? 's' : ''} livrée{summary.orders_count !== 1 ? 's' : ''} sur la période sélectionnée.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <StatCard label="Revenus" value={money(summary.revenue)} color="blue" />
            <StatCard label="Coût produit" value={money(summary.product_cost)} color="orange" />
            <StatCard label="Commission dropshipper" value={money(summary.commission)} color="cyan" />
            <StatCard label="Coût opérationnel" value={money(summary.operational_cost)} color="orange" />
            <StatCard label="Coût marketing" value={money(summary.marketing_cost)} color="orange" />
            <StatCard label="Profit net" value={money(summary.net_profit)} color={summary.net_profit >= 0 ? 'green' : 'red'} />
          </div>

          <div className="flex items-center gap-2 mb-4">
            {GROUP_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setGroupBy(o.value)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${groupBy === o.value ? 'text-white bg-violet-600' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                style={groupBy === o.value ? undefined : { border: `1px solid ${theme.dark.border}` }}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs mb-3" style={{ color: theme.dark.muted }}>
            Ne comprend que les coûts directement attribuables (produit + commission) — les coûts opérationnels/marketing ne sont pas ventilés ici, voir le résumé global ci-dessus.
          </p>

          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-180">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">{GROUP_OPTIONS.find(o => o.value === groupBy).label.replace('Par ', '').toUpperCase()}</th>
                  <th className="px-4 py-3 font-medium">COMMANDES</th>
                  <th className="px-4 py-3 font-medium">REVENUS</th>
                  <th className="px-4 py-3 font-medium">COÛT PRODUIT</th>
                  <th className="px-4 py-3 font-medium">COMMISSION</th>
                  <th className="px-4 py-3 font-medium">PROFIT</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">Aucune commande livrée sur cette période.</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                    <td className="px-4 py-3 text-gray-200">{r.label}</td>
                    <td className="px-4 py-3 text-gray-400">{r.orders_count}</td>
                    <td className="px-4 py-3 text-gray-300">{money(r.revenue)}</td>
                    <td className="px-4 py-3 text-gray-400">{money(r.product_cost)}</td>
                    <td className="px-4 py-3 text-gray-400">{money(r.commission)}</td>
                    <td className="px-4 py-3">
                      <span className={r.profit >= 0 ? theme.badge.success : theme.badge.danger}>{money(r.profit)}</span>
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
