import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Ouverte' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'resolved',    label: 'Résolue' },
]

const STATUS_BADGE = {
  open:        theme.badge.danger,
  in_progress: theme.badge.warning,
  resolved:    theme.badge.success,
}

const STATUS_DOT = {
  open:        'bg-red-500',
  in_progress: 'bg-amber-500',
  resolved:    'bg-emerald-500',
}

function BackIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

export default function ComplaintDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [newStatus, setNewStatus] = useState('')
  const [note, setNote]           = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [newMessage, setNewMessage]     = useState('')
  const [savingMessage, setSavingMessage] = useState(false)

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border, background: theme.dark.sidebar }

  const fetchComplaint = useCallback(() => {
    setLoading(true)
    api.get(`/orders/complaints/${id}/`)
      .then(({ data }) => { setComplaint(data); setNewStatus(data.status) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchComplaint() }, [fetchComplaint])

  const changeStatus = async () => {
    setSavingStatus(true)
    try {
      const { data } = await api.post(`/orders/complaints/${id}/status/`, { status: newStatus, note })
      setComplaint(data)
      setNote('')
    } catch {} finally {
      setSavingStatus(false)
    }
  }

  const addMessage = async () => {
    if (!newMessage.trim()) return
    setSavingMessage(true)
    try {
      const { data } = await api.post(`/orders/complaints/${id}/messages/`, { message: newMessage })
      setComplaint(data)
      setNewMessage('')
    } catch {} finally {
      setSavingMessage(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Réclamation">
        <p className="text-center text-gray-500 py-12">Chargement…</p>
      </DashboardLayout>
    )
  }

  if (!complaint) {
    return (
      <DashboardLayout title="Réclamation">
        <p className="text-center text-gray-500 py-12">Réclamation introuvable.</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title={`Réclamation #${complaint.id}`}>
      <button onClick={() => navigate('/dashboard/reclamations')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition mb-5">
        <BackIcon /> Retour aux réclamations
      </button>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Colonne principale */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <p className="text-xs" style={{ color: theme.dark.muted }}>
                  Commande <Link to={`/dashboard/commandes/${complaint.order}`} className="text-violet-300 hover:text-violet-200">{complaint.order_display}</Link> · {complaint.order_phone}
                </p>
                <h2 className="text-lg font-semibold text-gray-100 mt-1">{complaint.subject}</h2>
              </div>
              <span className={STATUS_BADGE[complaint.status] || theme.badge.neutral}>{complaint.status_label}</span>
            </div>
            <p className="text-sm text-gray-300 whitespace-pre-line">{complaint.description}</p>
            <p className="text-xs mt-2" style={{ color: theme.dark.muted }}>Déposée le {new Date(complaint.created_at).toLocaleString('fr-DZ')}</p>
          </div>

          {/* Historique des échanges */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Historique des échanges</h3>
            {complaint.messages.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: theme.dark.muted }}>Aucun message</p>
            ) : (
              <div className="relative space-y-5 pl-1">
                <div className="absolute left-1.75 top-2 bottom-2 w-px" style={{ background: theme.dark.border }} />
                {complaint.messages.map(m => (
                  <div key={m.id} className="relative flex items-start gap-3 pl-6">
                    <div className={`absolute left-0 top-1 w-3.5 h-3.5 rounded-full ring-4 ${STATUS_DOT[m.status] || 'bg-gray-500'}`}
                      style={{ boxShadow: `0 0 0 4px ${theme.dark.card}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="text-sm font-medium text-gray-200">{m.author_name}{m.status_label ? ` — ${m.status_label}` : ''}</span>
                        <span className="text-xs" style={{ color: theme.dark.muted }}>{new Date(m.created_at).toLocaleString('fr-DZ')}</span>
                      </div>
                      {m.message && <p className="text-xs mt-0.5 text-gray-400">{m.message}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 pt-4 border-t" style={{ borderColor: theme.dark.border }}>
              <label className="block text-xs mb-1.5" style={{ color: theme.dark.muted }}>Ajouter un message (sans changer le statut)</label>
              <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} rows={2} className={`${inputCls} resize-none`} style={bdrStyle} placeholder="Répondre au client…" />
              <button onClick={addMessage} disabled={savingMessage || !newMessage.trim()} className={theme.btn.outline + ' mt-2 text-sm disabled:opacity-50'}>
                {savingMessage ? '…' : 'Ajouter le message'}
              </button>
            </div>
          </div>
        </div>

        {/* Colonne droite */}
        <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-4">
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Changer le statut</h3>
            <Select value={newStatus} onChange={setNewStatus} options={STATUS_OPTIONS} className={inputCls + ' mb-2'} style={bdrStyle} />
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none mb-3`} style={bdrStyle} placeholder="Note (optionnel)" />
            <button onClick={changeStatus} disabled={savingStatus || newStatus === complaint.status} className={theme.btn.primary + ' w-full disabled:opacity-50'}>
              {savingStatus ? '…' : 'Appliquer'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
