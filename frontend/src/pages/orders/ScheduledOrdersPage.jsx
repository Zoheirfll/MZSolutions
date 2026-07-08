import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function EditDateModal({ order, onClose, onSaved }) {
  const [value, setValue] = useState(order.scheduled_at ? order.scheduled_at.slice(0, 16) : '')
  const [saving, setSaving] = useState(false)
  const minValue = new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)

  const handleSave = async () => {
    if (!value) return
    setSaving(true)
    try {
      await api.put(`/orders/${order.id}/`, { scheduled_at: new Date(value).toISOString() })
      onSaved()
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Modifier la date d'envoi</h2>
        <input
          type="datetime-local"
          value={value}
          min={minValue}
          onChange={e => setValue(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]"
          style={{ borderColor: theme.dark.border }}
        />
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition">Fermer</button>
          <button onClick={handleSave} disabled={saving || !value} className={theme.btn.primary}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ScheduledOrdersPage() {
  const navigate = useNavigate()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [busyId,  setBusyId]  = useState(null)

  const fetchOrders = useCallback(() => {
    setLoading(true)
    api.get('/orders/?status=scheduled&per_page=100&ordering=scheduled_at&ordering_dir=asc')
      .then(({ data }) => setOrders(data.results || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const handleSendNow = async (order) => {
    if (!confirm(`Envoyer maintenant la commande #${order.id} ?`)) return
    setBusyId(order.id)
    try {
      await api.post(`/orders/${order.id}/status/`, { status: 'pending' })
      fetchOrders()
    } catch {} finally { setBusyId(null) }
  }

  const handleCancel = async (order) => {
    if (!confirm(`Annuler la programmation de la commande #${order.id} ? Elle sera supprimée.`)) return
    setBusyId(order.id)
    try {
      await api.delete(`/orders/${order.id}/`)
      fetchOrders()
    } catch {} finally { setBusyId(null) }
  }

  return (
    <DashboardLayout title="Commandes programmées">
      <p className="text-sm mb-5" style={{ color: theme.dark.muted }}>
        Ces commandes ont été préparées à l'avance et s'activeront automatiquement à la date prévue (stock, quota et assignation appliqués à ce moment-là).
      </p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">WILAYA</th>
              <th className="px-4 py-3 font-medium">TOTAL</th>
              <th className="px-4 py-3 font-medium">ENVOI PRÉVU</th>
              <th className="px-4 py-3 font-medium w-56">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-16">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={7}>
                <div className={theme.emptyState}>
                  <svg className="w-12 h-12 mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M3 10h18M8 2v4M16 2v4" />
                  </svg>
                  <p>Aucune commande programmée</p>
                </div>
              </td></tr>
            ) : orders.map(o => (
              <tr key={o.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-500 cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${o.id}`)}>#{o.id}</td>
                <td className="px-4 py-3 text-gray-200 font-medium cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${o.id}`)}>{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 text-gray-300">{o.phone}</td>
                <td className="px-4 py-3 text-gray-300">{o.wilaya}</td>
                <td className="px-4 py-3 text-gray-200 font-semibold">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                  {o.scheduled_at ? new Date(o.scheduled_at).toLocaleString('fr-DZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleSendNow(o)} disabled={busyId === o.id} className={theme.btn.primary + ' px-2.5! py-1! text-xs'}>
                      Envoyer maintenant
                    </button>
                    <button onClick={() => setEditing(o)} disabled={busyId === o.id} className={theme.btn.secondary + ' px-2.5! py-1! text-xs'}>
                      Modifier
                    </button>
                    <button onClick={() => handleCancel(o)} disabled={busyId === o.id} className={theme.btn.danger + ' px-2.5! py-1! text-xs'}>
                      Annuler
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditDateModal
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchOrders() }}
        />
      )}
    </DashboardLayout>
  )
}
