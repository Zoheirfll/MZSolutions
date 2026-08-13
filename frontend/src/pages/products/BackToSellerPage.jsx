import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import EmptyState from '../../components/EmptyState'
import api from '../../api/axios'
import { theme } from '../../theme'

const INCOMING_REASONS = 'order_return,order_cancelled,exchange_return'

export default function BackToSellerPage() {
  const [data, setData] = useState({ results: [], count: 0 })
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 25

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage, reason: INCOMING_REASONS })
    if (search) params.set('search', search)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    api.get(`/products/stock/movements/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const inputCls = 'px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title="Retour au vendeur" subtitle="Marchandise remise en stock : retours de commande validés, annulations et retours d'échange. Même registre que « Mouvement des stocks », filtré sur les entrées uniquement.">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un produit…"
          className={inputCls} style={{ ...bdrStyle, width: 220 }}
        />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} style={bdrStyle} />
        <span className="self-center text-app-muted text-sm">→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} style={bdrStyle} />
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{data.count} retour{data.count !== 1 ? 's' : ''} en stock.</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-200">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">OPTION</th>
              <th className="px-4 py-3 font-medium">QUANTITÉ</th>
              <th className="px-4 py-3 font-medium">STOCK PRÉCÉDENT</th>
              <th className="px-4 py-3 font-medium">NOUVEAU STOCK</th>
              <th className="px-4 py-3 font-medium">ORIGINE</th>
              <th className="px-4 py-3 font-medium">DATE</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState title="Aucun retour" description="Aucune marchandise remise en stock pour ces filtres." />
              </td></tr>
            ) : data.results.map(m => {
              const line = m.lines?.[0]
              return (
                <tr key={m.id} className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                  <td className="px-4 py-3 text-app-primary font-medium">{m.product_name}</td>
                  <td className="px-4 py-3 text-app-muted-light">
                    {line?.option_value ? `${line.option_group ? line.option_group + ' — ' : ''}${line.option_value}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-400">+{m.total_changes}</td>
                  <td className="px-4 py-3 text-app-muted-light">{m.stock_before ?? '—'}</td>
                  <td className="px-4 py-3 text-app-primary">{m.stock_after ?? '—'}</td>
                  <td className="px-4 py-3"><span className={theme.badge.info}>{m.reason_label}</span></td>
                  <td className="px-4 py-3 text-app-muted text-xs">{new Date(m.created_at).toLocaleString('fr-DZ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {data.count > perPage && (
        <div className="flex items-center justify-end gap-2 mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">← Précédent</button>
          <span className={theme.badge.info}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">Suivant →</button>
        </div>
      )}
    </DashboardLayout>
  )
}
