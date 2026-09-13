import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'

const STATUS_OPTIONS = [
  { value: '',                 label: 'Tous les statuts' },
  { value: 'pending',          label: 'En attente de confirmation' },
  { value: 'no_answer_1',      label: 'Non joignable — 1ère tentative' },
  { value: 'no_answer_2',      label: 'Non joignable — 2ème tentative' },
  { value: 'no_answer_3',      label: 'Non joignable — 3ème tentative' },
  { value: 'confirmed',        label: 'Confirmée' },
  { value: 'shipped',          label: 'Expédiée' },
  { value: 'delivered',        label: 'Livrée' },
  { value: 'returned',         label: 'Retournée' },
  { value: 'cancelled',        label: 'Annulée' },
]

const CHANGE_STATUS_OPTIONS = STATUS_OPTIONS.filter(o => o.value)

export default function PlatformAdminMyQueuePage() {
  const { user, logout, refresh } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [toast, setToast]     = useState(null)
  const [editing, setEditing] = useState(null) // order id en cours d'édition
  const [newStatus, setNewStatus] = useState('')
  const [note, setNote]       = useState('')
  const [myStores, setMyStores] = useState([])
  const [entering, setEntering] = useState(null)

  useEffect(() => {
    api.get('/platform-admin/my-assignments/')
      .then(({ data }) => setMyStores(data))
      .catch(() => {})
  }, [])

  const handleEnter = async (assignment) => {
    setEntering(assignment.id)
    try {
      await api.post(`/platform-admin/assignments/${assignment.id}/enter/`)
      await refresh()
      navigate('/dashboard')
    } catch {
      setToast({ type: 'error', message: "Impossible d'accéder à cette boutique." })
      setEntering(null)
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    api.get('/platform-admin/my-queue/', { params: { status: statusFilter || undefined, per_page: 50 } })
      .then(({ data }) => setOrders(data.results))
      .catch(() => setToast({ type: 'error', message: 'Erreur de chargement de votre file.' }))
      .finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const startEdit = (order) => {
    setEditing(order.id)
    setNewStatus(order.status)
    setNote('')
  }

  const submitStatus = async (orderId) => {
    try {
      await api.post(`/platform-admin/my-queue/${orderId}/status/`, { status: newStatus, note })
      setToast({ type: 'success', message: 'Statut mis à jour.' })
      setEditing(null)
      load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Échec de la mise à jour.' })
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
        <p className="text-lg font-bold text-app-primary">MZSolutions <span className="text-violet-500">· Ma file de confirmation</span></p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-app-muted">{user?.email}</span>
          <button onClick={logout} className={theme.btn.ghost}>Déconnexion</button>
        </div>
      </header>

      <main className="p-6 max-w-6xl mx-auto flex flex-col gap-5">
        {myStores.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-app-muted-light">Mes boutiques</p>
            <div className="flex flex-wrap gap-2">
              {myStores.map(a => (
                <button key={a.id} onClick={() => handleEnter(a)} disabled={entering === a.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ring-1 ring-inset ring-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/15 transition cursor-pointer disabled:opacity-50">
                  {entering === a.id ? 'Entrée…' : `Gérer ${a.store_name}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-app-primary">Mes commandes à traiter</h1>
          <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} className={theme.inputDark + ' w-64'} />
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
                <th className="px-4 py-3">Boutique</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Wilaya</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-app-muted">Chargement…</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-app-muted">Aucune commande à traiter pour l'instant.</td></tr>}
              {!loading && orders.map(o => (
                <>
                  <tr key={o.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="px-4 py-3 text-app-muted">{o.store_name}</td>
                    <td className="px-4 py-3 text-app-primary">{o.first_name} {o.last_name}</td>
                    <td className="px-4 py-3 text-app-muted">{o.phone}</td>
                    <td className="px-4 py-3 text-app-muted">{o.wilaya}</td>
                    <td className="px-4 py-3 text-app-muted">{o.status_label}</td>
                    <td className="px-4 py-3 text-app-muted">{o.total} DA</td>
                    <td className="px-4 py-3">
                      {editing === o.id ? (
                        <button onClick={() => setEditing(null)} className="text-xs text-app-muted-light hover:text-app-primary">Annuler</button>
                      ) : (
                        <button onClick={() => startEdit(o)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">Changer le statut</button>
                      )}
                    </td>
                  </tr>
                  {editing === o.id && (
                    <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <td colSpan={7} className="px-4 py-4" style={{ background: 'var(--bg-card-alt)' }}>
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="flex flex-col gap-1">
                            <label className={theme.labelDark}>Nouveau statut</label>
                            <Select value={newStatus} onChange={setNewStatus} options={CHANGE_STATUS_OPTIONS} className={theme.inputDark + ' w-56'} />
                          </div>
                          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <label className={theme.labelDark}>Note (optionnel)</label>
                            <input value={note} onChange={e => setNote(e.target.value)} className={theme.inputDark} />
                          </div>
                          <button onClick={() => submitStatus(o.id)} className={theme.btn.primary}>Valider</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <Toast toast={toast} onClose={() => setToast(null)} />
      </main>
    </div>
  )
}
