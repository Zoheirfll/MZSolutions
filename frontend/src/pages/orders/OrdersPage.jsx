import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'
import { WILAYAS } from '../../data/wilayas'

const STATUS_OPTIONS = [
  { value: '',            label: 'Tous les statuts' },
  { value: 'pending',     label: 'En attente de confirmation' },
  { value: 'no_answer_1', label: 'Non joignable — 1ère tentative' },
  { value: 'no_answer_2', label: 'Non joignable — 2ème tentative' },
  { value: 'no_answer_3', label: 'Non joignable — 3ème tentative' },
  { value: 'confirmed',   label: 'Confirmée' },
  { value: 'shipped',     label: 'Expédiée' },
  { value: 'delivered',   label: 'Livrée' },
  { value: 'returned',    label: 'Retournée' },
  { value: 'cancelled',   label: 'Annulée' },
]

// Mapping statut → badge (variantes sombres alignées sur theme.badge) :
// success (emerald) = confirmée/expédiée/livrée · warning (amber) = en attente / tentatives d'appel
// danger (red) = retournée/annulée · neutral = fallback
const STATUS_COLORS = {
  pending:          'bg-amber-900/30 text-amber-400',
  no_answer_1:      'bg-amber-900/30 text-amber-400',
  no_answer_2:      'bg-amber-900/30 text-amber-400',
  no_answer_3:      'bg-amber-900/30 text-amber-400',
  confirmed:        'bg-emerald-900/30 text-emerald-400',
  shipped:          'bg-emerald-900/30 text-emerald-400',
  delivered:        'bg-emerald-900/30 text-emerald-400',
  returned:         'bg-red-900/30 text-red-400',
  cancel_requested: 'bg-red-900/30 text-red-400',
  cancelled:        'bg-red-900/30 text-red-400',
}
const STATUS_FALLBACK = 'bg-gray-800 text-gray-400'

const PER_PAGE_OPTIONS = [10, 25, 50]

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function HistoryIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 3" />
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

function QuickEditModal({ order, onClose, onSaved }) {
  const [status,  setStatus]  = useState('')
  const [note,    setNote]    = useState(order.note || '')
  const [wilaya,  setWilaya]  = useState(order.wilaya || '')
  const [commune, setCommune] = useState(order.commune || '')
  const [saving,  setSaving]  = useState(false)

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border, background: theme.dark.sidebar }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (wilaya !== order.wilaya || commune !== order.commune || note !== order.note) {
        await api.put(`/orders/${order.id}/`, { wilaya, commune, note })
      }
      if (status && status !== order.status) {
        await api.post(`/orders/${order.id}/status/`, { status, note })
      }
      onSaved()
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border p-5 sm:p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-5">État de la commande</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Statut actuel</label>
            <p className="text-sm text-gray-200 font-medium py-2">{order.status_label}</p>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Sélectionner un nouveau statut</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls} style={bdrStyle}>
              <option value="">— Choisir —</option>
              {STATUS_OPTIONS.filter(s => s.value).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Commentaire interne</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} style={bdrStyle} placeholder="Note libre…" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Wilaya</label>
            <select value={wilaya} onChange={e => setWilaya(e.target.value)} className={inputCls} style={bdrStyle}>
              <option value="">Choisissez une Wilaya</option>
              {WILAYAS.map(w => <option key={w.id} value={w.name}>{w.id} — {w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Commune</label>
            <input value={commune} onChange={e => setCommune(e.target.value)} className={inputCls} style={bdrStyle} placeholder="Commune" />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition">Fermer</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
            {saving ? '…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryModal({ orderId, onClose }) {
  const [order,   setOrder]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/orders/${orderId}/`).then(({ data }) => setOrder(data)).finally(() => setLoading(false))
  }, [orderId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border p-5 sm:p-6 max-h-[85vh] overflow-y-auto"
        style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-5">Historique de la commande N° {orderId}</h2>

        {loading ? (
          <p className="text-center text-gray-500 py-8">Chargement…</p>
        ) : (
          <>
            {order?.note && (
              <p className="text-center text-sm text-violet-300 font-medium mb-5">Note : {order.note}</p>
            )}
            {!order?.history?.length ? (
              <p className="text-center text-gray-500 py-4">Aucun historique</p>
            ) : (
              <div className="space-y-4 border-l pl-4" style={{ borderColor: theme.dark.border }}>
                {order.history.map(h => (
                  <div key={h.id}>
                    <p className="text-xs" style={{ color: theme.dark.muted }}>{new Date(h.changed_at).toLocaleString('fr-DZ')}</p>
                    <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[h.status] || STATUS_FALLBACK}`}>
                      {h.status_label}
                    </span>
                    {h.note && <p className="text-xs text-gray-400 mt-1">{h.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition">Fermer</button>
        </div>
      </div>
    </div>
  )
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const [data,     setData]     = useState({ results: [], count: 0 })
  const [statusF,  setStatusF]  = useState('')
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(1)
  const [perPage,  setPerPage]  = useState(10)
  const [selected, setSelected] = useState(new Set())
  const [loading,  setLoading]  = useState(true)
  const [quickEdit, setQuickEdit] = useState(null)
  const [historyId, setHistoryId] = useState(null)

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (statusF) params.set('status', statusF)
    if (search)  params.set('search', search)
    api.get(`/orders/?${params}`)
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, statusF, search])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [statusF, search])

  const orders     = data.results || []
  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const allIds     = orders.map(o => o.id)
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id))

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(allIds))
  const toggleRow = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleDelete = async id => {
    if (!confirm('Supprimer cette commande ?')) return
    await api.delete(`/orders/${id}/`)
    fetchOrders()
  }

  return (
    <DashboardLayout title="Commandes">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <select
            value={statusF}
            onChange={e => setStatusF(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm text-gray-200 outline-none w-full sm:w-auto"
            style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 200 }}
          >
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Recherche nom, téléphone…"
            className="px-3 py-2 rounded-lg border text-sm text-gray-200 outline-none focus:border-violet-500 transition w-full sm:w-55"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchOrders} className="w-9 h-9 rounded-lg border flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-white/5 transition" style={{ borderColor: theme.dark.border }} title="Actualiser">
            <RefreshIcon />
          </button>
          <button
            onClick={() => navigate('/dashboard/commandes/nouvelle')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-violet-600 hover:bg-violet-500 transition"
            title="Nouvelle commande"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-225">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-violet-600" /></th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">NUMÉRO DE TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">EMPLACEMENT</th>
              <th className="px-4 py-3 font-medium">PRIX TOTAL</th>
              <th className="px-4 py-3 font-medium">SUIVI</th>
              <th className="px-4 py-3 font-medium">COMMUNE</th>
              <th className="px-4 py-3 font-medium">NOTE</th>
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="py-16">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={10}>
                <div className={theme.emptyState}>
                  <svg className="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="7" width="18" height="14" rx="2" />
                    <path d="M8 7V5a4 4 0 018 0v2" />
                  </svg>
                  <p>Aucune commande trouvée</p>
                </div>
              </td></tr>
            ) : orders.map(o => (
              <tr
                key={o.id}
                className="border-b hover:bg-white/2 transition cursor-pointer"
                style={{ borderColor: theme.dark.border + '44' }}
                onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
              >
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleRow(o.id)} className="accent-violet-600" />
                </td>
                <td className="px-4 py-3 text-gray-500">#{o.id}</td>
                <td className="px-4 py-3 text-gray-200 font-medium">{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 text-gray-300">{o.phone}</td>
                <td className="px-4 py-3 text-gray-300">{o.wilaya}</td>
                <td className="px-4 py-3 text-gray-200 font-semibold">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setQuickEdit(o)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium hover:opacity-80 transition ${STATUS_COLORS[o.status] || STATUS_FALLBACK}`}
                  >
                    {o.status_label}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-400">{o.commune || '—'}</td>
                <td className="px-4 py-3 text-gray-400 max-w-40 truncate" title={o.note}>{o.note || '—'}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setHistoryId(o.id)} className="text-gray-400 hover:text-violet-400 transition" title="Historique">
                    <HistoryIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 text-sm" style={{ color: theme.dark.muted }}>
        <p>{selected.size} de {data.count} sélectionné</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            Lignes par page :
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="px-2 py-1 rounded-lg border text-gray-300 text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-white/5 flex items-center justify-center">
              <ChevronLeftIcon />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className="px-2.5 py-1 rounded text-xs"
                style={{ background: page === n ? '#7c3aed' : 'transparent', color: page === n ? '#fff' : theme.dark.muted }}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-white/5 flex items-center justify-center">
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>

      {quickEdit && (
        <QuickEditModal
          order={quickEdit}
          onClose={() => setQuickEdit(null)}
          onSaved={() => { setQuickEdit(null); fetchOrders() }}
        />
      )}

      {historyId && (
        <HistoryModal orderId={historyId} onClose={() => setHistoryId(null)} />
      )}
    </DashboardLayout>
  )
}
