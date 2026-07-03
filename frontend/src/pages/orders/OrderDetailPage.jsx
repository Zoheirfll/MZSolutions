import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'

const STATUS_CHOICES = [
  { value: 'pending',          label: 'En attente de confirmation' },
  { value: 'no_answer_1',      label: 'Non joignable — 1ère tentative' },
  { value: 'no_answer_2',      label: 'Non joignable — 2ème tentative' },
  { value: 'no_answer_3',      label: 'Non joignable — 3ème tentative' },
  { value: 'confirmed',        label: 'Confirmée' },
  { value: 'shipped',          label: 'Expédiée' },
  { value: 'delivered',        label: 'Livrée' },
  { value: 'returned',         label: 'Retournée' },
  { value: 'cancel_requested', label: "Demande d'annulation" },
  { value: 'cancelled',        label: 'Annulée' },
]

// Mapping statut → badge (aligné sur OrdersPage.jsx) :
// success (emerald) = confirmée/expédiée/livrée · warning (amber) = en attente / tentatives d'appel
// danger (red) = retournée/annulée/demande d'annulation · neutral = fallback
const STATUS_COLORS = {
  pending:          'bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/20',
  no_answer_1:      'bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/20',
  no_answer_2:      'bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/20',
  no_answer_3:      'bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/20',
  confirmed:        'bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/20',
  shipped:          'bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/20',
  delivered:        'bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/20',
  returned:         'bg-red-900/30 text-red-400 ring-1 ring-red-500/20',
  cancel_requested: 'bg-red-900/30 text-red-400 ring-1 ring-red-500/20',
  cancelled:        'bg-red-900/30 text-red-400 ring-1 ring-red-500/20',
}
const STATUS_FALLBACK = 'bg-gray-800 text-gray-400 ring-1 ring-white/10'

const STATUS_DOT = {
  pending: 'bg-amber-400', no_answer_1: 'bg-amber-400', no_answer_2: 'bg-amber-400', no_answer_3: 'bg-amber-400',
  confirmed: 'bg-emerald-400', shipped: 'bg-emerald-400', delivered: 'bg-emerald-400',
  returned: 'bg-red-400', cancel_requested: 'bg-red-400', cancelled: 'bg-red-400',
}

function Icon({ path, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  back:     'M19 12H5M12 19l-7-7 7-7',
  user:     'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  phone:    'M2.25 6.75c0 8.284 6.716 15 15 15h1.5a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a1.125 1.125 0 00-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97a1.125 1.125 0 00.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z',
  pin:      'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25a7.5 7.5 0 1115 0z',
  truck:    'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.83H14.25M16.5 18.75h-2.25m0-12h-3c-1.03 0-1.9.693-2.166 1.638m5.166-1.638V18.75m-5.166-12H3.375c-.621 0-1.126.504-1.125 1.125l.001 8.443c0 .823.673 1.494 1.497 1.494H6M16.5 6.75V4.5m0 2.25h4.5m-4.5 0v9.75m6-6.75v6.75',
  cash:     'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  package:  'M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5m0-9L3.75 7.5m8.25 4.5v9M3.75 7.5v9l8.25 4.5',
  note:     'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6 12l-3-3m0 0l-3 3m3-3v6M6.75 3.75h4.5a1.5 1.5 0 011.06.44l4.5 4.5a1.5 1.5 0 01.44 1.06V19.5a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5V5.25a1.5 1.5 0 011.5-1.5z',
  status:   'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  shipping: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.83H14.25M16.5 18.75h-2.25m0-12h-3c-1.03 0-1.9.693-2.166 1.638m5.166-1.638V18.75m-5.166-12H3.375c-.621 0-1.126.504-1.125 1.125l.001 8.443c0 .823.673 1.494 1.497 1.494H6M16.5 6.75V4.5m0 2.25h4.5m-4.5 0v9.75m6-6.75v6.75',
  team:     'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
}

function InfoTile({ icon, label, value, highlight }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
        <Icon path={icon} className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.dark.muted }}>{label}</p>
        <p className={`text-sm font-medium truncate ${highlight ? 'text-violet-300' : 'text-gray-200'}`}>{value}</p>
      </div>
    </div>
  )
}

function SectionCard({ icon, title, right, children }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
              <Icon path={icon} className="w-3.5 h-3.5" />
            </div>
          )}
          <h2 className="font-semibold text-gray-200 text-sm">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isConfirmateur = user?.team_role === 'confirmateur'

  const [order,         setOrder]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [confirmateurs, setConfirmateurs] = useState([])
  const [carrierAccounts, setCarrierAccounts] = useState([])
  const [selectedCarrierId, setSelectedCarrierId] = useState('')
  const [carrierWarning, setCarrierWarning] = useState('')

  // Changer statut
  const [newStatus,  setNewStatus]  = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)

  // Assignation
  const [newConfirmateur, setNewConfirmateur] = useState('')
  const [savingAssign, setSavingAssign] = useState(false)

  const fetchOrder = useCallback(() => {
    setLoading(true)
    api.get(`/orders/${id}/`)
      .then(({ data }) => { setOrder(data); setNewStatus(data.status) })
      .catch(() => navigate('/dashboard/commandes'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  useEffect(() => {
    fetchOrder()
    api.get('/team/members/?role=confirmateur').then(({ data }) => setConfirmateurs(data)).catch(() => {})
    api.get('/stores/me/carriers/').then(({ data }) => setCarrierAccounts(data.filter(a => a.is_active))).catch(() => {})
  }, [fetchOrder])

  const changeStatus = async () => {
    if (!newStatus || newStatus === order?.status) return
    setSavingStatus(true)
    setCarrierWarning('')
    try {
      const payload = { status: newStatus, note: statusNote }
      if (newStatus === 'confirmed' && selectedCarrierId) payload.carrier_id = selectedCarrierId
      const { data } = await api.post(`/orders/${id}/status/`, payload)
      if (data.carrier_warning) setCarrierWarning(data.carrier_warning)
      setStatusNote('')
      fetchOrder()
    } catch {} finally { setSavingStatus(false) }
  }

  const saveAssignment = async () => {
    if (!newConfirmateur) return
    setSavingAssign(true)
    try {
      await api.put(`/orders/${id}/assignment/`, { confirmateur: newConfirmateur })
      fetchOrder()
      setNewConfirmateur('')
    } catch {} finally { setSavingAssign(false) }
  }

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  if (loading) return (
    <DashboardLayout title="Commande">
      <div className="flex items-center justify-center gap-2 text-gray-500 py-24">
        <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Chargement…
      </div>
    </DashboardLayout>
  )
  if (!order)  return null

  const initials = `${order.first_name?.[0] ?? ''}${order.last_name?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <DashboardLayout title={`Commande #${order.id}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <button onClick={() => navigate('/dashboard/commandes')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition">
          <Icon path={ICONS.back} className="w-4 h-4" />
          Retour aux commandes
        </button>
        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status] || STATUS_FALLBACK}`}>
          {order.status_label}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">

        {/* ── Colonne principale ── */}
        <div className="flex-1 w-full space-y-5 min-w-0">

          {/* Infos client */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ background: '#7c3aed' }}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-100 truncate">{order.first_name} {order.last_name}</p>
                <p className="text-xs" style={{ color: theme.dark.muted }}>Commande #{order.id} · {new Date(order.created_at).toLocaleDateString('fr-DZ')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4">
              <InfoTile icon={ICONS.phone} label="Téléphone" value={order.phone} />
              <InfoTile icon={ICONS.pin} label="Wilaya / Commune" value={`${order.wilaya}${order.commune ? ' · ' + order.commune : ''}`} />
              <InfoTile icon={ICONS.truck} label="Livraison" value={order.delivery_type || '—'} />
              <InfoTile icon={ICONS.cash} label="Paiement" value={order.payment_method_label || '—'} />
              {order.carrier_tracking_number && (
                <InfoTile icon={ICONS.shipping} label="Transporteur" value={`${order.carrier_label} — ${order.carrier_tracking_number}`} highlight />
              )}
            </div>

            {order.note && (
              <div className="mt-4 pt-4 border-t flex items-start gap-2.5" style={{ borderColor: theme.dark.border }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
                  <Icon path={ICONS.note} className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.dark.muted }}>Note</p>
                  <p className="text-sm text-gray-300">{order.note}</p>
                </div>
              </div>
            )}
          </div>

          {/* Articles */}
          <SectionCard icon={ICONS.package} title={`Articles (${order.items?.length || 0})`}>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-105">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide border-b text-left" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                    <th className="pb-2.5 px-1 font-medium">Produit</th>
                    <th className="pb-2.5 px-1 font-medium text-right">Prix</th>
                    <th className="pb-2.5 px-1 font-medium text-center">Qté</th>
                    <th className="pb-2.5 px-1 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map(item => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                      <td className="py-3 px-1 text-gray-200 font-medium">{item.product_name}</td>
                      <td className="py-3 px-1 text-right text-gray-400">{Number(item.price).toLocaleString('fr-DZ')} DZD</td>
                      <td className="py-3 px-1 text-center">
                        <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-md text-xs font-semibold bg-white/5 text-gray-300">
                          {item.quantity}
                        </span>
                      </td>
                      <td className="py-3 px-1 text-right text-gray-100 font-semibold">{(item.price * item.quantity).toLocaleString('fr-DZ')} DZD</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-4 border-t flex flex-col items-end gap-1.5 text-sm" style={{ borderColor: theme.dark.border }}>
              <div className="flex justify-between w-full max-w-56">
                <span style={{ color: theme.dark.muted }}>Sous-total</span>
                <span className="text-gray-300">{Number(order.subtotal).toLocaleString('fr-DZ')} DZD</span>
              </div>
              <div className="flex justify-between w-full max-w-56">
                <span style={{ color: theme.dark.muted }}>Livraison</span>
                <span className="text-gray-300">{Number(order.shipping_cost).toLocaleString('fr-DZ')} DZD</span>
              </div>
              <div className="flex justify-between w-full max-w-56 pt-1.5 mt-1 border-t" style={{ borderColor: theme.dark.border }}>
                <span className="text-gray-200 font-medium">Total</span>
                <span className="text-white font-bold text-base">{Number(order.total).toLocaleString('fr-DZ')} DZD</span>
              </div>
            </div>
          </SectionCard>

          {/* Historique statuts */}
          <SectionCard icon={ICONS.status} title="Historique des statuts">
            {!order.history?.length ? (
              <p className="text-sm text-center py-6" style={{ color: theme.dark.muted }}>Aucun historique</p>
            ) : (
              <div className="relative space-y-5 pl-1">
                <div className="absolute left-1.75 top-2 bottom-2 w-px" style={{ background: theme.dark.border }} />
                {order.history.map(h => (
                  <div key={h.id} className="relative flex items-start gap-3 pl-6">
                    <div className={`absolute left-0 top-1 w-3.5 h-3.5 rounded-full ring-4 ${STATUS_DOT[h.status] || 'bg-gray-500'}`}
                      style={{ boxShadow: `0 0 0 4px ${theme.dark.card}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className={`text-sm font-medium ${STATUS_COLORS[h.status]?.split(' ')[1] || 'text-gray-300'}`}>{h.status_label}</span>
                        <span className="text-xs" style={{ color: theme.dark.muted }}>{new Date(h.changed_at).toLocaleString('fr-DZ')}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>par {h.changed_by_name}{h.note ? ` · ${h.note}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Colonne droite ── */}
        <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-4">

          {/* Changer statut */}
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
                <Icon path={ICONS.status} className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-semibold text-gray-200">Changer le statut</h3>
            </div>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
              {STATUS_CHOICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {newStatus === 'confirmed' && carrierAccounts.length > 1 && (
              <select value={selectedCarrierId} onChange={e => setSelectedCarrierId(e.target.value)} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
                <option value="">Transporteur par défaut de la boutique</option>
                {carrierAccounts.map(a => <option key={a.id} value={a.id}>{a.carrier_label}</option>)}
              </select>
            )}
            <textarea value={statusNote} onChange={e => setStatusNote(e.target.value)} rows={2} className={`${inputCls} resize-none mb-3`} style={bdrStyle} placeholder="Note (optionnel)" />
            <button onClick={changeStatus} disabled={savingStatus || newStatus === order.status} className={theme.btn.primary + ' w-full'}>
              {savingStatus ? '…' : 'Appliquer'}
            </button>
            {carrierWarning && (
              <p className="mt-2.5 text-xs text-amber-400 flex items-start gap-1.5">
                <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {carrierWarning}
              </p>
            )}
          </div>

          {/* Assignation — visible pour tous, modifiable uniquement par owner/admin */}
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
                <Icon path={ICONS.team} className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-semibold text-gray-200">Confirmateur assigné</h3>
            </div>
            <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: theme.dark.sidebar }}>
              <p className="text-sm text-violet-300 font-medium">
                {order.assignment?.confirmateur_name || <span style={{ color: theme.dark.muted }}>Non assigné</span>}
              </p>
            </div>
            {!isConfirmateur && (
              <>
                <select value={newConfirmateur} onChange={e => setNewConfirmateur(e.target.value)} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
                  <option value="">Choisir un confirmateur</option>
                  {confirmateurs.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
                <button onClick={saveAssignment} disabled={savingAssign || !newConfirmateur} className={theme.btn.primary + ' w-full'}>
                  {savingAssign ? '…' : 'Assigner'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
