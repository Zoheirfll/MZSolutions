import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Toast from '../../components/Toast'
import api from '../../api/axios'
import { theme } from '../../theme'
import { usePeriod, PeriodFilter, Spinner, money, StatsPagination } from '../orders/stats/statsShared'

const TABS = [
  { key: 'indicators',      label: 'Indicateurs' },
  { key: 'orders',          label: 'Commandes' },
  { key: 'reconciliation',  label: 'Vérification de cohérence' },
]

function CostRow({ label, value, total }) {
  const pct = total ? (value / total * 100).toFixed(1) : '0.0'
  return (
    <div className="flex items-center justify-between border-b py-3" style={{ borderColor: theme.dark.borderRowHover }}>
      <span className="text-sm text-app-primary">{label}</span>
      <span className="text-sm text-app-muted-light">{money(value)} ({pct}%)</span>
    </div>
  )
}

// Page "Paiements" (façon RiseCart) — réconciliation COD : suit les
// commandes livrées payées à la livraison dont le transporteur n'a pas
// encore reversé l'argent (`state='ready'`) vs celles déjà pointées comme
// reversées (`state='collected'`). Composant partagé entre les deux routes.
export default function PaymentsPage({ state, title }) {
  const { period, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo, resolvedRange, ready } = usePeriod()
  // Les endpoints Paiements (finance/) attendent period_start/period_end
  // (comme ProfitabilitySummaryView), pas le contrat period=week de
  // statsShared — converti ici via resolvedRange() plutôt que queryString().
  const periodParams = useCallback(() => {
    const { from, to } = resolvedRange()
    return `period_start=${from}&period_end=${to}`
  }, [resolvedRange])
  const [tab, setTab] = useState('indicators')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState({ results: [], count: 0 })
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(new Set())
  const [marking, setMarking] = useState(false)
  const [reconciliation, setReconciliation] = useState({ results: [], count: 0 })
  const [reconLoading, setReconLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const perPage = 20

  const fetchSummary = useCallback(() => {
    setLoading(true)
    api.get(`/finance/payments/summary/?state=${state}&${periodParams()}`)
      .then(({ data }) => setSummary(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [periodParams, state])

  const fetchOrders = useCallback(() => {
    setOrdersLoading(true)
    api.get(`/finance/payments/orders/?state=${state}&page=${page}&per_page=${perPage}&${periodParams()}`)
      .then(({ data }) => setOrders(data))
      .catch(() => {})
      .finally(() => setOrdersLoading(false))
  }, [periodParams, state, page])

  const fetchReconciliation = useCallback(() => {
    if (state !== 'collected') return
    setReconLoading(true)
    api.get('/finance/payments/reconciliation/')
      .then(({ data }) => setReconciliation(data))
      .catch(() => {})
      .finally(() => setReconLoading(false))
  }, [state])

  useEffect(() => { if (ready) fetchSummary() }, [fetchSummary, ready])
  useEffect(() => { if (ready && tab === 'orders') fetchOrders() }, [fetchOrders, ready, tab])
  useEffect(() => { if (ready && tab === 'reconciliation') fetchReconciliation() }, [fetchReconciliation, ready, tab])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [periodParams])

  const toggleRow = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const markCollected = async () => {
    if (selected.size === 0) return
    setMarking(true)
    try {
      const { data } = await api.post('/finance/payments/mark-collected/', { order_ids: [...selected] })
      setToast({ type: 'success', message: `${data.updated} commande(s) marquée(s) comme récupérée(s).` })
      setSelected(new Set())
      fetchOrders()
      fetchSummary()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Échec du pointage.' })
    } finally { setMarking(false) }
  }

  const exportCsv = () => {
    const header = ['ID', 'Client', 'Téléphone', 'Suivi', 'Transporteur', 'Total', 'Récupéré le', 'Montant reçu']
    const lines = orders.results.map(o => [
      o.id, `${o.first_name} ${o.last_name}`.trim(), o.phone, o.carrier_tracking_number || '',
      o.carrier_label || '', o.total, o.payment_collected_at ? new Date(o.payment_collected_at).toLocaleDateString('fr-DZ') : '',
      o.payment_collected_amount ?? '',
    ])
    const csv = [header, ...lines].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state}-cod.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalCosts = summary ? summary.product_cost + summary.ads_cost + summary.delivery_cost + summary.other_cost : 0

  return (
    <DashboardLayout title={title} subtitle="Suivi des versements COD (paiement à la livraison) par le transporteur — quelles commandes livrées attendent encore leur reversement, lesquelles ont déjà été reçues, et les écarts éventuels entre montant attendu et montant réellement reçu.">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <PeriodFilter period={period} setPeriod={setPeriod} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <button onClick={exportCsv} className={theme.btn.outline + ' text-sm cursor-pointer'}>Exporter</button>
      </div>

      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit overflow-x-auto" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.filter(t => state === 'collected' || t.key !== 'reconciliation').map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 cursor-pointer
              ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'indicators' && (
        loading || !summary ? <Spinner /> : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Chiffre d\'affaires', value: money(summary.revenue) },
                { label: 'Bénéfice net', value: money(summary.net_profit) },
                { label: 'Bénéfice par commande', value: money(summary.profit_per_order) },
                { label: 'Marge bénéficiaire', value: `${summary.profit_margin_pct}%` },
              ].map(c => (
                <div key={c.label} className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                  <p className="text-xs mb-2" style={{ color: theme.dark.muted }}>{c.label.toUpperCase()}</p>
                  <p className="text-xl font-bold text-app-primary">{c.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <h2 className="text-sm font-semibold text-app-primary mb-2">{summary.orders_count} commande{summary.orders_count !== 1 ? 's' : ''} {state === 'ready' ? 'en attente de versement' : 'récupérée(s)'}</h2>
                <p className="text-xs" style={{ color: theme.dark.muted }}>Montant COD total : {money(summary.cod_amount)}</p>
              </div>
              <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <h2 className="text-sm font-semibold text-app-primary mb-1">Répartition des coûts</h2>
                <CostRow label="Coût du produit" value={summary.product_cost} total={totalCosts} />
                <CostRow label="Coût publicitaire" value={summary.ads_cost} total={totalCosts} />
                <CostRow label="Coût de livraison" value={summary.delivery_cost} total={totalCosts} />
                <CostRow label="Autres dépenses" value={summary.other_cost} total={totalCosts} />
              </div>
            </div>
          </div>
        )
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          {state === 'ready' && selected.size > 0 && (
            <div className="flex items-center gap-3">
              <span className={theme.badge.info}>{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
              <button onClick={markCollected} disabled={marking} className={theme.btn.primary + ' text-sm cursor-pointer disabled:opacity-50'}>
                {marking ? '…' : 'Marquer comme récupéré'}
              </button>
            </div>
          )}
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-180">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                  {state === 'ready' && <th className="px-4 py-3"></th>}
                  <th className="px-4 py-3 font-medium">CLIENT</th>
                  <th className="px-4 py-3 font-medium">SUIVI</th>
                  <th className="px-4 py-3 font-medium">TRANSPORTEUR</th>
                  <th className="px-4 py-3 font-medium">TOTAL</th>
                  {state === 'collected' && <><th className="px-4 py-3 font-medium">RÉCUPÉRÉ LE</th><th className="px-4 py-3 font-medium">MONTANT REÇU</th></>}
                </tr>
              </thead>
              <tbody>
                {ordersLoading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-app-muted">Chargement…</td></tr>
                ) : orders.results.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-app-muted">Aucune commande.</td></tr>
                ) : orders.results.map(o => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                    {state === 'ready' && (
                      <td className="px-4 py-3"><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleRow(o.id)} className="accent-violet-600" /></td>
                    )}
                    <td className="px-4 py-3 text-app-primary font-medium">{o.first_name} {o.last_name} <span className="text-app-muted-light font-normal">· {o.phone}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-violet-300">{o.carrier_tracking_number || '—'}</td>
                    <td className="px-4 py-3 text-app-muted-light">{o.carrier_label || '—'}</td>
                    <td className="px-4 py-3 text-app-primary font-semibold">{money(o.total)}</td>
                    {state === 'collected' && (
                      <>
                        <td className="px-4 py-3 text-app-muted text-xs">{o.payment_collected_at ? new Date(o.payment_collected_at).toLocaleDateString('fr-DZ') : '—'}</td>
                        <td className="px-4 py-3 text-app-primary">{money(o.payment_collected_amount)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <StatsPagination page={page} setPage={setPage} count={orders.count} perPage={perPage} />
        </div>
      )}

      {tab === 'reconciliation' && (
        reconLoading ? <Spinner /> : (
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-160">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">CLIENT</th>
                  <th className="px-4 py-3 font-medium">SUIVI</th>
                  <th className="px-4 py-3 font-medium">ATTENDU</th>
                  <th className="px-4 py-3 font-medium">REÇU</th>
                  <th className="px-4 py-3 font-medium">ÉCART</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.results.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-app-muted">Aucun écart détecté — tous les versements correspondent au montant attendu.</td></tr>
                ) : reconciliation.results.map(r => (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary font-medium">{r.first_name} {r.last_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-violet-300">{r.carrier_tracking_number || '—'}</td>
                    <td className="px-4 py-3 text-app-muted-light">{money(r.expected)}</td>
                    <td className="px-4 py-3 text-app-primary">{money(r.received)}</td>
                    <td className="px-4 py-3">
                      <span className={r.diff < 0 ? theme.badge.danger : theme.badge.success}>{r.diff > 0 ? '+' : ''}{money(r.diff)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </DashboardLayout>
  )
}
