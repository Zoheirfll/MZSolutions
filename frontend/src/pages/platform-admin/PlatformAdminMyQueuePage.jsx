import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import StatCard from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import { tt } from '../../i18n'
import { useTranslation } from 'react-i18next'

function InboxIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></svg>
}
function PackageIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12l8.73-5.04M12 22.08V12" /></svg>
}
function RefreshCwIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
}

const STATUS_OPTIONS = [
  { value: '',                 label: tt('Tous les statuts') },
  { value: 'pending',          label: tt('En attente de confirmation') },
  { value: 'no_answer_1',      label: tt('Non joignable — 1ère tentative') },
  { value: 'no_answer_2',      label: tt('Non joignable — 2ème tentative') },
  { value: 'no_answer_3',      label: tt('Non joignable — 3ème tentative') },
  { value: 'confirmed',        label: tt('Confirmée') },
  { value: 'shipped',          label: tt('Expédiée') },
  { value: 'delivered',        label: tt('Livrée') },
  { value: 'returned',         label: tt('Retournée') },
  { value: 'cancelled',        label: tt('Annulée') },
]

const CHANGE_STATUS_OPTIONS = STATUS_OPTIONS.filter(o => o.value)

// Résultat d'un appel raté : la commande repart en « attente d'assignation » puis vers un autre
// confirmateur (délai réglé côté admin). Remplace les statuts 1ère/2ème/3ème tentative.
const CALL_OUTCOMES = [
  { value: 'no_answer',   label: tt('Ne répond pas') },
  { value: 'unreachable', label: tt('Injoignable') },
  { value: 'busy',        label: tt('Occupé') },
  { value: 'callback',    label: tt('Rappeler plus tard') },
]

export default function PlatformAdminMyQueuePage() {
  const { t } = useTranslation('dashboard')
  const { user, logout, refresh } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [toast, setToast]     = useState(null)
  const [editing, setEditing] = useState(null) // order id en cours d'édition
  const [newStatus, setNewStatus] = useState('')
  const [note, setNote]       = useState('')
  const [calling, setCalling] = useState(null) // order id dont on déclare le résultat d'appel
  const [callOutcome, setCallOutcome] = useState('no_answer')
  const [callbackAt, setCallbackAt] = useState('')
  const [callNote, setCallNote] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [entering, setEntering] = useState(null)

  const loadDashboard = useCallback(() => {
    api.get('/platform-admin/my-dashboard/')
      .then(({ data }) => setDashboard(data))
      .catch(() => {})
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const handleEnter = async (assignmentId) => {
    setEntering(assignmentId)
    try {
      await api.post(`/platform-admin/assignments/${assignmentId}/enter/`)
      await refresh()
      navigate('/dashboard')
    } catch {
      setToast({ type: 'error', message: t('Impossible d\'accéder à cette boutique.') })
      setEntering(null)
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    api.get('/platform-admin/my-queue/', { params: { status: statusFilter || undefined, per_page: 50 } })
      .then(({ data }) => setOrders(data.results))
      .catch(() => setToast({ type: 'error', message: t('Erreur de chargement de votre file.') }))
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
      setToast({ type: 'success', message: t('Statut mis à jour.') })
      setEditing(null)
      load()
      loadDashboard()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Échec de la mise à jour.') })
    }
  }

  const startCall = (order) => {
    setCalling(order.id); setEditing(null)
    setCallOutcome('no_answer'); setCallbackAt(''); setCallNote('')
  }

  const submitCall = async (orderId) => {
    try {
      await api.post(`/platform-admin/my-queue/${orderId}/call/`, {
        outcome: callOutcome, note: callNote,
        callback_at: callOutcome === 'callback' && callbackAt ? new Date(callbackAt).toISOString() : undefined,
      })
      setToast({ type: 'success', message: t('Résultat enregistré — la commande repart en attente d\'assignation.') })
      setCalling(null)
      load()
      loadDashboard()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Échec de l\'enregistrement.') })
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
        <p className="text-lg font-bold text-app-primary">{t('MZSolutions')}{' '}<span className="text-violet-500">{t('· Ma file de confirmation')}</span></p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-app-muted">{user?.email}</span>
          <button onClick={logout} className={theme.btn.ghost}>{t('Déconnexion')}</button>
        </div>
      </header>

      <main className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-app-primary">{t('Vue d\'ensemble')}</h1>
          <p className="text-sm text-app-muted mt-1">{t('Toutes vos boutiques, en un coup d\'œil — pas besoin d\'entrer dans chacune pour savoir ce qu\'il y a à traiter.')}</p>
        </div>

        {dashboard && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label={t('Commandes à traiter')} value={dashboard.totals.pending_orders} icon={PackageIcon} color="violet" />
            <StatCard label={t('Réclamations ouvertes')} value={dashboard.totals.open_complaints} icon={InboxIcon} color="orange" />
            <StatCard label={t('Échanges ouverts')} value={dashboard.totals.open_exchanges} icon={RefreshCwIcon} color="cyan" />
          </div>
        )}

        {dashboard && dashboard.stores.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <th className="px-4 py-3">{t('Boutique')}</th>
                  <th className="px-4 py-3">{t('Commandes à traiter')}</th>
                  <th className="px-4 py-3">{t('Réclamations ouvertes')}</th>
                  <th className="px-4 py-3">{t('Échanges ouverts')}</th>
                  <th className="px-4 py-3">{t('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.stores.map(s => (
                  <tr key={s.assignment_id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="px-4 py-3 text-app-primary font-medium">{s.store_name}</td>
                    <td className="px-4 py-3">
                      {s.pending_orders > 0
                        ? <span className={theme.badge.info}>{s.pending_orders}</span>
                        : <span className="text-app-muted">0</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.open_complaints === null
                        ? <span className="text-app-muted text-xs" title={t('Permission non accordée')}>—</span>
                        : s.open_complaints > 0 ? <span className={theme.badge.warning}>{s.open_complaints}</span> : <span className="text-app-muted">0</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.open_exchanges === null
                        ? <span className="text-app-muted text-xs" title={t('Permission non accordée')}>—</span>
                        : s.open_exchanges > 0 ? <span className={theme.badge.cyan}>{s.open_exchanges}</span> : <span className="text-app-muted">0</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleEnter(s.assignment_id)} disabled={entering === s.assignment_id}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-500 transition disabled:opacity-50 cursor-pointer">
                        {entering === s.assignment_id ? t('Entrée…') : t('Gérer')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-app-primary">{t('Mes commandes à traiter')}</h2>
          <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} className={theme.inputDark + ' w-64'} />
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-semibold uppercase tracking-wide text-app-muted-light border-b" style={{ borderColor: 'var(--border-color)' }}>
                <th className="px-4 py-3">{t('Boutique')}</th>
                <th className="px-4 py-3">{t('Client')}</th>
                <th className="px-4 py-3">{t('Téléphone')}</th>
                <th className="px-4 py-3">{t('Wilaya')}</th>
                <th className="px-4 py-3">{t('Statut')}</th>
                <th className="px-4 py-3">{t('Total')}</th>
                <th className="px-4 py-3">{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-app-muted">{t('Chargement…')}</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-app-muted">{t('Aucune commande à traiter pour l\'instant.')}</td></tr>}
              {!loading && orders.map(o => (
                <>
                  <tr key={o.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="px-4 py-3 text-app-muted">{o.store_name}</td>
                    <td className="px-4 py-3 text-app-primary">{o.first_name} {o.last_name}</td>
                    <td className="px-4 py-3 text-app-muted">{o.phone}</td>
                    <td className="px-4 py-3 text-app-muted">{o.wilaya}</td>
                    <td className="px-4 py-3 text-app-muted">{o.status_label}</td>
                    <td className="px-4 py-3 text-app-muted">{t('{{total}} DA', { total: o.total })}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {o.flow_state === 'assigned' && calling !== o.id && (
                          <button onClick={() => startCall(o)} className="text-amber-400 hover:text-amber-300 text-xs font-medium">{t('Appel sans réponse')}</button>
                        )}
                        {editing === o.id ? (
                          <button onClick={() => setEditing(null)} className="text-xs text-app-muted-light hover:text-app-primary">{t('Annuler')}</button>
                        ) : (
                          <button onClick={() => startEdit(o)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{t('Changer le statut')}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {calling === o.id && (
                    <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <td colSpan={7} className="px-4 py-4" style={{ background: 'var(--bg-card-alt)' }}>
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="flex flex-col gap-1">
                            <label className={theme.labelDark}>{t('Résultat de l\'appel')}</label>
                            <Select value={callOutcome} onChange={setCallOutcome} options={CALL_OUTCOMES} className={theme.inputDark + ' w-56'} />
                          </div>
                          {callOutcome === 'callback' && (
                            <div className="flex flex-col gap-1">
                              <label className={theme.labelDark}>{t('Rappeler le')}</label>
                              <input type="datetime-local" value={callbackAt} onChange={e => setCallbackAt(e.target.value)} className={theme.inputDark} />
                            </div>
                          )}
                          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <label className={theme.labelDark}>{t('Note (optionnel)')}</label>
                            <input value={callNote} onChange={e => setCallNote(e.target.value)} maxLength={300} className={theme.inputDark} />
                          </div>
                          <button onClick={() => submitCall(o.id)} className={theme.btn.primary}>{t('Valider')}</button>
                          <button onClick={() => setCalling(null)} className="text-xs text-app-muted-light hover:text-app-primary">{t('Annuler')}</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {editing === o.id && (
                    <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <td colSpan={7} className="px-4 py-4" style={{ background: 'var(--bg-card-alt)' }}>
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="flex flex-col gap-1">
                            <label className={theme.labelDark}>{t('Nouveau statut')}</label>
                            <Select value={newStatus} onChange={setNewStatus} options={CHANGE_STATUS_OPTIONS} className={theme.inputDark + ' w-56'} />
                          </div>
                          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <label className={theme.labelDark}>{t('Note (optionnel)')}</label>
                            <input value={note} onChange={e => setNote(e.target.value)} className={theme.inputDark} />
                          </div>
                          <button onClick={() => submitStatus(o.id)} className={theme.btn.primary}>{t('Valider')}</button>
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
