import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const PER_PAGE_OPTIONS = [10, 25, 50]

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function XIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function ChevronLeftIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function ActionModal({ order, action, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const isConfirm = action === 'confirm'

  const submit = async () => {
    setSaving(true)
    try {
      if (isConfirm) {
        await api.post(`/orders/${order.id}/status/`, { status: 'cancelled', note })
      } else {
        await api.post(`/orders/${order.id}/reject-cancellation/`, { note })
      }
      onDone()
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-100 mb-1">
          {isConfirm ? "Confirmer l'annulation" : "Rejeter la demande d'annulation"}
        </h2>
        <p className="text-sm mb-4" style={{ color: theme.dark.muted }}>
          Commande #{order.id} — {order.first_name} {order.last_name}
          {!isConfirm && ' — la commande reviendra à son statut précédent.'}
        </p>
        {order.cancellation_note && (
          <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: theme.dark.sidebar, color: theme.dark.mutedLight }}>
            Motif de la demande : {order.cancellation_note}
          </p>
        )}
        <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Note (optionnel)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition resize-none"
          style={{ borderColor: theme.dark.border }}
          placeholder={isConfirm ? "Ex: remboursement effectué…" : "Ex: client injoignable pour confirmer sa demande…"}
        />
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition">Annuler</button>
          <button onClick={submit} disabled={saving} className={isConfirm ? theme.btn.danger : theme.btn.primary}>
            {saving ? '…' : isConfirm ? "Confirmer l'annulation" : 'Rejeter la demande'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CancellationsPage({ mode }) {
  const navigate   = useNavigate()
  const isRequests = mode === 'requests'

  const [data,    setData]    = useState({ results: [], count: 0 })
  const [search,  setSearch]  = useState('')
  const [page,    setPage]    = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [loading, setLoading] = useState(true)
  const [action,  setAction]  = useState(null) // { order, action: 'confirm'|'reject' }

  const statusFilter = isRequests ? 'cancel_requested' : 'cancelled'

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage, status: statusFilter })
    if (search) params.set('search', search)
    api.get(`/orders/?${params}`)
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, statusFilter, search])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { setPage(1) }, [search])

  const orders     = data.results || []
  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const colCount   = isRequests ? 9 : 8

  return (
    <DashboardLayout title={isRequests ? "Demande d'annulation" : 'Annulation confirmée'}>

      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Recherche nom, téléphone…"
          className="px-3 py-2 rounded-lg border text-sm text-gray-200 outline-none focus:border-violet-500 transition w-full sm:w-64"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto mb-4" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">NUMÉRO DE TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">EMPLACEMENT</th>
              <th className="px-4 py-3 font-medium">COMMUNE</th>
              <th className="px-4 py-3 font-medium">PRIX TOTAL</th>
              <th className="px-4 py-3 font-medium">MOTIF</th>
              <th className="px-4 py-3 font-medium">DATE</th>
              {isRequests && <th className="px-4 py-3 font-medium">ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="py-16">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={colCount}>
                <div className={theme.emptyState}>
                  <svg className="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>Aucune commande trouvée</p>
                </div>
              </td></tr>
            ) : orders.map(o => (
              <tr
                key={o.id}
                onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
                className="border-b hover:bg-white/2 transition cursor-pointer"
                style={{ borderColor: theme.dark.border + '44' }}
              >
                <td className="px-4 py-3 text-gray-500">#{o.id}</td>
                <td className="px-4 py-3 text-gray-200 font-medium">{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 text-gray-300">{o.phone}</td>
                <td className="px-4 py-3 text-gray-300">{o.wilaya}</td>
                <td className="px-4 py-3 text-gray-400">{o.commune || '—'}</td>
                <td className="px-4 py-3 text-gray-200 font-semibold">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 text-gray-400 max-w-48 truncate" title={o.cancellation_note}>{o.cancellation_note || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(o.created_at).toLocaleDateString('fr-DZ')}
                </td>
                {isRequests && (
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAction({ order: o, action: 'confirm' })}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-red-400 border border-red-800 hover:bg-red-900/20 transition"
                      >
                        <CheckIcon /> Confirmer
                      </button>
                      <button
                        onClick={() => setAction({ order: o, action: 'reject' })}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-emerald-400 border border-emerald-800 hover:bg-emerald-900/20 transition"
                      >
                        <XIcon /> Rejeter
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm" style={{ color: theme.dark.muted }}>
        <p>{data.count} commande{data.count !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            Lignes par page :
            <Select value={perPage} onChange={v => { setPerPage(Number(v)); setPage(1) }}
              options={PER_PAGE_OPTIONS.map(n => ({ value: n, label: n }))}
              className="px-2 py-1 rounded-lg border text-gray-300 text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }} />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-white/5 flex items-center justify-center">
              <ChevronLeftIcon />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className={`px-2.5 py-1 rounded text-xs transition ${page === n ? 'bg-violet-600 text-white' : ''}`}
                style={page === n ? undefined : { color: theme.dark.muted }}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-white/5 flex items-center justify-center">
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>

      {action && (
        <ActionModal
          order={action.order}
          action={action.action}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); fetchOrders() }}
        />
      )}
    </DashboardLayout>
  )
}
