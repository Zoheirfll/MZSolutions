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

const CHANNEL_FILTERS = [
  { value: '',           label: 'Tous les canaux' },
  { value: 'complaint',  label: 'Réclamations' },
  { value: 'exchange',   label: 'Échanges' },
  { value: 'messenger',  label: 'Messenger' },
  { value: 'whatsapp',   label: 'WhatsApp' },
]

function PaperclipIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3 3 0 014.24 4.24l-9.19 9.19a1 1 0 01-1.42-1.42l8.49-8.48" />
    </svg>
  )
}

export default function InboxPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [list, setList] = useState({ results: [], count: 0 })
  const [listLoading, setListLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [conv, setConv] = useState(null)
  const [convLoading, setConvLoading] = useState(false)
  const [order, setOrder] = useState(null)

  const [newStatus, setNewStatus] = useState('')
  const [note, setNote] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [savingMessage, setSavingMessage] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const [confirmateurs, setConfirmateurs] = useState([])
  const [assigning, setAssigning] = useState(false)

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border, background: theme.dark.sidebar }

  const fetchList = useCallback(() => {
    setListLoading(true)
    const params = new URLSearchParams({ per_page: 50 })
    if (search) params.set('search', search)
    if (channel) params.set('channel', channel)
    if (statusFilter) params.set('status', statusFilter)
    api.get(`/inbox/conversations/?${params}`)
      .then(({ data }) => setList(data))
      .catch(() => {})
      .finally(() => setListLoading(false))
  }, [search, channel, statusFilter])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => {
    api.get('/team/members/?role=confirmateur').then(({ data }) => setConfirmateurs(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

  const fetchConv = useCallback(() => {
    if (!id) { setConv(null); setOrder(null); return }
    setConvLoading(true)
    api.get(`/inbox/conversations/${id}/`)
      .then(({ data }) => {
        setConv(data)
        setNewStatus(data.status)
        if (data.order) {
          api.get(`/orders/${data.order}/`).then(({ data: o }) => setOrder(o)).catch(() => setOrder(null))
        } else {
          setOrder(null)
        }
      })
      .catch(() => setConv(null))
      .finally(() => { setConvLoading(false); fetchList() })
  }, [id])

  useEffect(() => { fetchConv() }, [fetchConv])

  const changeStatus = async () => {
    setSavingStatus(true)
    try {
      const fd = new FormData()
      fd.append('status', newStatus)
      fd.append('note', note)
      if (attachment) fd.append('attachment', attachment)
      const { data } = await api.post(`/inbox/conversations/${id}/status/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setConv(data)
      setNote('')
      setAttachment(null)
      fetchList()
    } catch {} finally { setSavingStatus(false) }
  }

  const addMessage = async () => {
    if (!newMessage.trim() && !attachment) return
    setSavingMessage(true)
    try {
      const fd = new FormData()
      fd.append('message', newMessage)
      if (attachment) fd.append('attachment', attachment)
      const { data } = await api.post(`/inbox/conversations/${id}/messages/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setConv(data)
      setNewMessage('')
      setAttachment(null)
      fetchList()
    } catch {} finally { setSavingMessage(false) }
  }

  const reassign = async (confirmateurId) => {
    setAssigning(true)
    try {
      const { data } = await api.put(`/inbox/conversations/${id}/assignment/`, { confirmateur: confirmateurId })
      setConv(c => ({ ...c, assigned_to_name: data.assigned_to_name }))
      fetchList()
    } catch {} finally { setAssigning(false) }
  }

  return (
    <DashboardLayout title="Boîte de réception" subtitle="Tout ce qui vient de vos clients arrive ici : réclamations, échanges, et bientôt Messenger/WhatsApp. Un seul endroit pour tout suivre, avec le contexte de la commande à côté de chaque conversation.">
      <div className="flex gap-4 items-stretch" style={{ height: 'calc(100vh - 220px)', minHeight: 500 }}>
        {/* Colonne 1 — liste des conversations */}
        <div className="w-72 shrink-0 flex flex-col rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border, background: theme.dark.card }}>
          <div className="p-3 border-b space-y-2" style={{ borderColor: theme.dark.border }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition"
              style={{ borderColor: theme.dark.border }}
            />
            <Select value={channel} onChange={setChannel} options={CHANNEL_FILTERS}
              className="px-3 py-1.5 rounded-lg border text-xs text-app-primary" style={{ background: 'transparent', borderColor: theme.dark.border }} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <p className="text-center text-xs py-6" style={{ color: theme.dark.muted }}>Chargement…</p>
            ) : list.results.length === 0 ? (
              <p className="text-center text-xs py-6 px-3" style={{ color: theme.dark.muted }}>Aucune conversation.</p>
            ) : list.results.map(c => (
              <button
                key={c.id}
                onClick={() => navigate(`/dashboard/boite-reception/${c.id}`)}
                className={`w-full text-left px-3 py-3 border-b transition cursor-pointer ${String(c.id) === id ? 'bg-violet-500/10' : 'hover:bg-white/5'}`}
                style={{ borderColor: theme.dark.borderRowHover }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-app-primary truncate">{c.customer_name || c.subject || `#${c.id}`}</span>
                  {c.unread_count > 0 && <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />}
                </div>
                <p className="text-xs truncate" style={{ color: theme.dark.muted }}>{c.subject || c.channel_label}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={STATUS_BADGE[c.status] || theme.badge.neutral}>{c.status_label}</span>
                  <span className="text-[10px]" style={{ color: theme.dark.muted }}>{c.channel_label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Colonne 2 — fil de discussion */}
        <div className="flex-1 min-w-0 flex flex-col rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border, background: theme.dark.card }}>
          {!id ? (
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: theme.dark.muted }}>
              Sélectionnez une conversation.
            </div>
          ) : convLoading || !conv ? (
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: theme.dark.muted }}>Chargement…</div>
          ) : (
            <>
              <div className="p-4 border-b flex items-center justify-between gap-2 flex-wrap" style={{ borderColor: theme.dark.border }}>
                <div>
                  <p className="text-sm font-semibold text-app-primary">{conv.subject || conv.channel_label}</p>
                  <p className="text-xs" style={{ color: theme.dark.muted }}>{conv.customer_name} · {conv.customer_phone}</p>
                </div>
                <span className={STATUS_BADGE[conv.status] || theme.badge.neutral}>{conv.status_label}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {conv.messages.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: theme.dark.muted }}>Aucun message.</p>
                ) : conv.messages.map(m => (
                  <div key={m.id} className={`flex ${m.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${m.direction === 'inbound' ? '' : 'bg-violet-600/15'}`}
                      style={m.direction === 'inbound' ? { background: theme.dark.sidebar } : undefined}>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-xs font-medium text-app-primary">{m.author_name}{m.status_label ? ` — ${m.status_label}` : ''}</span>
                        <span className="text-[10px]" style={{ color: theme.dark.muted }}>{new Date(m.created_at).toLocaleString('fr-DZ')}</span>
                      </div>
                      {m.body && <p className="text-sm text-app-primary whitespace-pre-line">{m.body}</p>}
                      {m.attachment_url && (
                        <a href={m.attachment_url} target="_blank" rel="noreferrer" className="inline-block mt-2">
                          <img src={m.attachment_url} alt="Pièce jointe" className="w-24 h-24 object-cover rounded-lg border" style={{ borderColor: theme.dark.border }} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t space-y-2" style={{ borderColor: theme.dark.border }}>
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} rows={2} className={`${inputCls} resize-none`} style={bdrStyle} placeholder="Répondre au client…" />
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer transition hover:text-app-primary" style={{ color: theme.dark.muted }}>
                    <PaperclipIcon />
                    {attachment ? attachment.name : 'Joindre une photo'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => setAttachment(e.target.files?.[0] || null)} />
                  </label>
                  <button onClick={addMessage} disabled={savingMessage || (!newMessage.trim() && !attachment)} className={theme.btn.primary + ' text-sm disabled:opacity-50'}>
                    {savingMessage ? '…' : 'Envoyer'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Colonne 3 — contexte commande + assignation + statut */}
        {id && conv && (
          <div className="w-72 shrink-0 space-y-4 overflow-y-auto">
            {order && (
              <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <h3 className="text-sm font-semibold text-app-primary mb-3">
                  <Link to={`/dashboard/commandes/${order.id}`} className="text-violet-300 hover:text-violet-200">Commande #{order.id}</Link>
                </h3>
                <div className="space-y-1.5 text-xs" style={{ color: theme.dark.muted }}>
                  <p>Statut : <span className="text-app-primary">{order.status_label}</span></p>
                  <p>Total : <span className="text-app-primary">{Number(order.total).toLocaleString('fr-DZ')} DZD</span></p>
                  {order.carrier_tracking_number && <p>Suivi : <span className="text-app-primary font-mono">{order.carrier_tracking_number}</span></p>}
                  <p>Wilaya : <span className="text-app-primary">{order.wilaya}</span></p>
                </div>
              </div>
            )}

            <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <h3 className="text-sm font-semibold text-app-primary mb-3">Assignation</h3>
              <p className="text-sm text-app-primary mb-3">{conv.assigned_to_name || 'Non assignée'}</p>
              <Select
                value="" onChange={reassign}
                options={confirmateurs.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name}` }))}
                placeholder={assigning ? 'Réassignation…' : 'Réassigner à…'}
                disabled={assigning || confirmateurs.length === 0}
                className={inputCls} style={bdrStyle}
              />
            </div>

            <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <h3 className="text-sm font-semibold text-app-primary mb-3">Changer le statut</h3>
              <Select value={newStatus} onChange={setNewStatus} options={STATUS_OPTIONS} className={inputCls + ' mb-2'} style={bdrStyle} />
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none mb-2`} style={bdrStyle} placeholder="Note (optionnel)" />
              <button onClick={changeStatus} disabled={savingStatus || newStatus === conv.status} className={theme.btn.primary + ' w-full disabled:opacity-50 text-sm'}>
                {savingStatus ? '…' : 'Appliquer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
