import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import EmptyState from '../../components/EmptyState'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const REASON_OPTIONS = [
  { value: '',                   label: 'Tous les types' },
  { value: 'order_sale',         label: 'Vente (commande)' },
  { value: 'order_return',       label: 'Retour commande' },
  { value: 'order_cancelled',    label: 'Annulation commande' },
  { value: 'exchange_return',    label: 'Retour échange' },
  { value: 'exchange_issue',     label: 'Sortie échange' },
  { value: 'manual_adjustment',  label: 'Ajustement manuel' },
]

export default function StockMovementsPage() {
  const [data, setData] = useState({ results: [], count: 0 })
  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 25

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search) params.set('search', search)
    if (reason) params.set('reason', reason)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    api.get(`/products/stock/movements/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search, reason, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, reason, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const inputCls = 'px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title="Mouvement des stocks" subtitle="Registre de tous les mouvements de stock de votre boutique : ventes, retours de commande, annulations, échanges et ajustements manuels — y compris les modifications faites directement dans la fiche produit. Lecture seule : pour corriger une erreur, faites un nouvel ajustement plutôt que de modifier l'historique.">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un produit…"
          className={inputCls} style={{ ...bdrStyle, width: 220 }}
        />
        <div style={{ width: 200 }}>
          <Select value={reason} onChange={setReason} options={REASON_OPTIONS}
            className="px-3 py-2 rounded-lg border text-sm text-app-primary" style={{ background: 'transparent', borderColor: theme.dark.border }} />
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} style={bdrStyle} />
        <span className="self-center text-app-muted text-sm">→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} style={bdrStyle} />
        {(search || reason || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(''); setReason(''); setDateFrom(''); setDateTo('') }} className="text-xs px-3 py-2 text-app-muted-light hover:text-app-primary transition">
            Réinitialiser
          </button>
        )}
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{data.count} mouvement{data.count !== 1 ? 's' : ''}.</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-200">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">OPTION</th>
              <th className="px-4 py-3 font-medium">MOUVEMENT</th>
              <th className="px-4 py-3 font-medium">QTÉ</th>
              <th className="px-4 py-3 font-medium">ANCIEN STOCK</th>
              <th className="px-4 py-3 font-medium">NOUVEAU STOCK</th>
              <th className="px-4 py-3 font-medium">TYPE</th>
              <th className="px-4 py-3 font-medium">NOTE</th>
              <th className="px-4 py-3 font-medium">DATE</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={9}>
                <EmptyState title="Aucun mouvement" description="Aucun mouvement de stock ne correspond à ces filtres." />
              </td></tr>
            ) : data.results.map(m => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-primary font-medium">{m.product_name}</td>
                <td className="px-4 py-3 text-app-muted-light">
                  {m.option_value ? `${m.option_group ? m.option_group + ' — ' : ''}${m.option_value}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={m.quantity >= 0 ? theme.badge.success : theme.badge.danger}>
                    {m.quantity >= 0 ? 'Entrée' : 'Sortie'}
                  </span>
                </td>
                <td className={`px-4 py-3 font-semibold ${m.quantity >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {m.quantity >= 0 ? '+' : ''}{m.quantity}
                </td>
                <td className="px-4 py-3 text-app-muted-light">{m.stock_before ?? '—'}</td>
                <td className="px-4 py-3 text-app-primary">{m.stock_after ?? '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{m.reason_label}</td>
                <td className="px-4 py-3 text-app-muted-light max-w-40 truncate">{m.note || '—'}</td>
                <td className="px-4 py-3 text-app-muted text-xs">{new Date(m.created_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
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
