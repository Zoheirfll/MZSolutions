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

const STATUS_COLORS = {
  pending:          'bg-amber-900/30 text-amber-400',
  no_answer_1:      'bg-blue-900/30 text-blue-400',
  no_answer_2:      'bg-orange-900/30 text-orange-400',
  no_answer_3:      'bg-red-900/30 text-red-400',
  confirmed:        'bg-violet-900/30 text-violet-300',
  shipped:          'bg-cyan-900/30 text-cyan-400',
  delivered:        'bg-emerald-900/30 text-emerald-400',
  returned:         'bg-orange-900/30 text-orange-400',
  cancel_requested: 'bg-yellow-900/30 text-yellow-400',
  cancelled:        'bg-red-900/30 text-red-400',
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isConfirmateur = user?.team_role === 'confirmateur'

  const [order,         setOrder]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [confirmateurs, setConfirmateurs] = useState([])

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
  }, [fetchOrder])

  const changeStatus = async () => {
    if (!newStatus || newStatus === order?.status) return
    setSavingStatus(true)
    try {
      await api.post(`/orders/${id}/status/`, { status: newStatus, note: statusNote })
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

  if (loading) return <DashboardLayout title="Commande"><p className="text-gray-500 py-8 text-center">Chargement…</p></DashboardLayout>
  if (!order)  return null

  return (
    <DashboardLayout title={`Commande #${order.id}`}>
      <div className="flex gap-5 items-start">

        {/* ── Colonne principale ── */}
        <div className="flex-1 space-y-5 min-w-0">

          {/* Infos client */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-200">Informations client</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || 'bg-gray-800 text-gray-400'}`}>
                {order.status_label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Nom', `${order.first_name} ${order.last_name}`],
                ['Téléphone', order.phone],
                ['Wilaya', order.wilaya],
                ['Commune', order.commune || '—'],
                ['Livraison', order.delivery_type || '—'],
                ['Paiement', order.payment_method_label || '—'],
                ['Total', `${Number(order.total).toLocaleString('fr-DZ')} DZD`],
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
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-gray-200 mb-3">Articles ({order.items?.length || 0})</h2>
            <table className="w-full text-sm">
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
            <div className="space-y-3">
              {order.history?.map(h => (
                <div key={h.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-violet-600" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${STATUS_COLORS[h.status]?.split(' ')[1] || 'text-gray-300'}`}>{h.status_label}</span>
                      <span className="text-xs" style={{ color: theme.dark.muted }}>{new Date(h.changed_at).toLocaleString('fr-DZ')}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>par {h.changed_by_name}{h.note ? ` · ${h.note}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Colonne droite ── */}
        <div className="w-64 shrink-0 space-y-4 sticky top-4">

          {/* Changer statut */}
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Changer le statut</h3>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
              {STATUS_CHOICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <textarea value={statusNote} onChange={e => setStatusNote(e.target.value)} rows={2} className={`${inputCls} resize-none mb-2`} style={bdrStyle} placeholder="Note (optionnel)" />
            <button onClick={changeStatus} disabled={savingStatus || newStatus === order.status} className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#7c3aed' }}>
              {savingStatus ? '…' : 'Appliquer'}
            </button>
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
                <button onClick={saveAssignment} disabled={savingAssign || !newConfirmateur} className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#7c3aed' }}>
                  {savingAssign ? '…' : 'Assigner'}
                </button>
              </>
            )}
          </div>

          {/* Actions rapides */}
          <div className="rounded-xl border p-4 space-y-2" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <button onClick={() => navigate('/dashboard/commandes')} className="w-full py-2 text-sm text-gray-400 hover:text-gray-200 transition text-left">
              ← Retour à la liste
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
