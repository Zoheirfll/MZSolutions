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

const STATUS_DOT = {
  pending: 'bg-amber-400', no_answer_1: 'bg-amber-400', no_answer_2: 'bg-amber-400', no_answer_3: 'bg-amber-400',
  confirmed: 'bg-emerald-400', shipped: 'bg-emerald-400', delivered: 'bg-emerald-400',
  returned: 'bg-red-400', cancel_requested: 'bg-red-400', cancelled: 'bg-red-400',
}

function BackIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
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

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  if (loading) return (
    <DashboardLayout title="Commande">
      <div className="flex items-center justify-center gap-2 text-gray-500 py-16">
        <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Chargement…
      </div>
    </DashboardLayout>
  )
  if (!order)  return null

  return (
    <DashboardLayout title={`Commande #${order.id}`}>
      <div className="flex flex-col lg:flex-row gap-5 items-start">

        {/* ── Colonne principale ── */}
        <div className="flex-1 w-full space-y-5 min-w-0">

          {/* Infos client */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-200">Informations client</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || STATUS_FALLBACK}`}>
                {order.status_label}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                ['Nom', `${order.first_name} ${order.last_name}`],
                ['Téléphone', order.phone],
                ['Wilaya', order.wilaya],
                ['Commune', order.commune || '—'],
                ['Livraison', order.delivery_type || '—'],
                ['Paiement', order.payment_method_label || '—'],
                ['Total', `${Number(order.total).toLocaleString('fr-DZ')} DZD`],
                ...(order.carrier_tracking_number
                  ? [['Transporteur', `${order.carrier_label} — ${order.carrier_tracking_number}`]]
                  : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs mb-0.5" style={{ color: theme.dark.muted }}>{label}</p>
                  <p className="text-gray-200 font-medium">{value}</p>
                </div>
              ))}
            </div>
            {order.note && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: theme.dark.border }}>
                <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>Note</p>
                <p className="text-sm text-gray-300">{order.note}</p>
              </div>
            )}
          </div>

          {/* Articles */}
          <div className="rounded-xl border p-5 overflow-x-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-gray-200 mb-3">Articles ({order.items?.length || 0})</h2>
            <table className="w-full text-sm min-w-105">
              <thead>
                <tr className="text-xs border-b text-left" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                  <th className="pb-2 font-medium">PRODUIT</th>
                  <th className="pb-2 font-medium text-right">PRIX</th>
                  <th className="pb-2 font-medium text-center">QTÉ</th>
                  <th className="pb-2 font-medium text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map(item => (
                  <tr key={item.id} className="border-b" style={{ borderColor: theme.dark.border + '44' }}>
                    <td className="py-2.5 text-gray-200">{item.product_name}</td>
                    <td className="py-2.5 text-right text-gray-300">{Number(item.price).toLocaleString('fr-DZ')}</td>
                    <td className="py-2.5 text-center text-gray-300">{item.quantity}</td>
                    <td className="py-2.5 text-right text-gray-200 font-medium">{(item.price * item.quantity).toLocaleString('fr-DZ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 pt-3 border-t flex justify-end gap-8 text-sm" style={{ borderColor: theme.dark.border }}>
              <div className="text-right">
                <p style={{ color: theme.dark.muted }}>Sous-total</p>
                <p className="text-gray-200">{Number(order.subtotal).toLocaleString('fr-DZ')} DZD</p>
              </div>
              <div className="text-right">
                <p style={{ color: theme.dark.muted }}>Livraison</p>
                <p className="text-gray-200">{Number(order.shipping_cost).toLocaleString('fr-DZ')} DZD</p>
              </div>
              <div className="text-right">
                <p style={{ color: theme.dark.muted }}>Total</p>
                <p className="text-white font-bold text-base">{Number(order.total).toLocaleString('fr-DZ')} DZD</p>
              </div>
            </div>
          </div>

          {/* Historique statuts */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-gray-200 mb-4">Historique des statuts</h2>
            {!order.history?.length ? (
              <p className="text-sm text-center py-4" style={{ color: theme.dark.muted }}>Aucun historique</p>
            ) : (
              <div className="space-y-3">
                {order.history.map(h => (
                  <div key={h.id} className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${STATUS_DOT[h.status] || 'bg-gray-500'}`} />
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
          </div>
        </div>

        {/* ── Colonne droite ── */}
        <div className="w-full lg:w-64 shrink-0 space-y-4 lg:sticky lg:top-4">

          {/* Changer statut */}
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Changer le statut</h3>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
              {STATUS_CHOICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {newStatus === 'confirmed' && carrierAccounts.length > 1 && (
              <select value={selectedCarrierId} onChange={e => setSelectedCarrierId(e.target.value)} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
                <option value="">Transporteur par défaut de la boutique</option>
                {carrierAccounts.map(a => <option key={a.id} value={a.id}>{a.carrier_label}</option>)}
              </select>
            )}
            <textarea value={statusNote} onChange={e => setStatusNote(e.target.value)} rows={2} className={`${inputCls} resize-none mb-2`} style={bdrStyle} placeholder="Note (optionnel)" />
            <button onClick={changeStatus} disabled={savingStatus || newStatus === order.status} className="w-full py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40">
              {savingStatus ? '…' : 'Appliquer'}
            </button>
            {carrierWarning && (
              <p className="mt-2 text-xs text-amber-400">{carrierWarning}</p>
            )}
          </div>

          {/* Assignation — visible pour tous, modifiable uniquement par owner/admin */}
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Confirmateur assigné</h3>
            <p className="text-sm text-violet-300 mb-3 font-medium">
              {order.assignment?.confirmateur_name || <span style={{ color: theme.dark.muted }}>Non assigné</span>}
            </p>
            {!isConfirmateur && (
              <>
                <select value={newConfirmateur} onChange={e => setNewConfirmateur(e.target.value)} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
                  <option value="">Choisir un confirmateur</option>
                  {confirmateurs.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
                <button onClick={saveAssignment} disabled={savingAssign || !newConfirmateur} className="w-full py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40">
                  {savingAssign ? '…' : 'Assigner'}
                </button>
              </>
            )}
          </div>

          {/* Actions rapides */}
          <div className="rounded-xl border p-4 space-y-2" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <button onClick={() => navigate('/dashboard/commandes')} className="w-full py-2 text-sm text-gray-400 hover:text-gray-200 transition flex items-center gap-2">
              <BackIcon />
              Retour à la liste
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
