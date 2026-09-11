import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Send, Sparkles, User, MessageSquare, Trash2 } from 'lucide-react'
import DashboardLayout from '../../components/DashboardLayout'
import ConfirmDialog from '../../components/ConfirmDialog'
import { theme } from '../../theme'
import { renderMarkdown } from '../../lib/markdown'
import { listConversations, getConversation, sendChatMessage, deleteConversation, confirmPendingAction, rejectPendingAction } from '../../api/aiApi'

const SUGGESTIONS = [
  'Quel est mon stock bas ?',
  'Combien de commandes ce mois-ci ?',
  'Quels clients sont à risque ?',
  'Quelle est ma rentabilité récente ?',
]

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce"
          style={{ color: 'var(--text-muted)', animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}

function Avatar({ role }) {
  const isUser = role === 'user'
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-violet-600 text-white' : 'bg-app-card-alt text-app-primary'}`}>
      {isUser ? <User size={14} /> : <Sparkles size={14} />}
    </div>
  )
}

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar role={role} />
      <div className={`text-sm rounded-2xl px-3.5 py-2.5 max-w-[75%] ${isUser ? 'bg-violet-600 text-white rounded-tr-sm' : 'bg-app-card-alt text-app-primary rounded-tl-sm'}`}>
        {isUser
          ? <p className="whitespace-pre-wrap">{content}</p>
          : <div className="ai-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />}
      </div>
    </div>
  )
}

function PendingActionCard({ action, onResolved }) {
  const [busy, setBusy] = useState(false)
  const [resolvedStatus, setResolvedStatus] = useState(action.status === 'pending' ? null : action.status)

  const handle = async (fn, status) => {
    setBusy(true)
    try {
      await fn(action.id)
      setResolvedStatus(status)
      onResolved?.(action.id, status)
    } catch {
      // best-effort — l'utilisateur peut réessayer, aucun crash de l'UI
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2.5">
      <Avatar role="assistant" />
      <div className="rounded-2xl rounded-tl-sm border border-app bg-app-card-alt px-3.5 py-3 max-w-[75%] text-sm">
        <p className="font-medium text-app-primary mb-2">{action.summary}</p>
        {action.payload?.length > 0 && (
          <ul className="space-y-1 mb-3 text-xs text-app-muted-light">
            {action.payload.slice(0, 10).map((item, i) => (
              <li key={i}>{item.name} — {JSON.stringify(item.before)} → {JSON.stringify(item.after)}</li>
            ))}
          </ul>
        )}
        {resolvedStatus === 'confirmed' && <p className="text-xs font-medium text-emerald-500">Confirmé</p>}
        {resolvedStatus === 'rejected' && <p className="text-xs font-medium text-app-muted">Rejeté</p>}
        {!resolvedStatus && (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => handle(confirmPendingAction, 'confirmed')}
              className={theme.btn.primary + ' text-xs px-3 py-1.5 disabled:opacity-40'}>
              Confirmer
            </button>
            <button type="button" disabled={busy} onClick={() => handle(rejectPendingAction, 'rejected')}
              className="text-xs px-3 py-1.5 rounded-lg border border-app text-app-muted-light hover:text-app-primary transition disabled:opacity-40">
              Rejeter
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AIAssistantPage() {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [conversationSearch, setConversationSearch] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const refreshConversations = useCallback(() => {
    listConversations().then(setConversations).catch(() => {})
  }, [])

  useEffect(() => { refreshConversations() }, [refreshConversations])

  useEffect(() => {
    if (activeId) {
      getConversation(activeId).then(c => setMessages(c.messages)).catch(() => {})
    }
  }, [activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const handleSend = async (textOverride) => {
    const text = (textOverride ?? input).trim()
    if (!text || sending) return
    setMessages(m => [...m, { role: 'user', content: text }])
    setInput('')
    setSending(true)
    setError('')
    try {
      const data = await sendChatMessage({ conversationId: activeId, message: text })
      setActiveId(data.conversation_id)
      setMessages(m => [...m, { role: 'assistant', content: data.reply, pending_action: data.pending_action || null }])
      refreshConversations()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Assistant IA indisponible')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const newConversation = () => { setActiveId(null); setMessages([]); setError('') }

  const handleDelete = (e, id) => {
    e.stopPropagation()
    setConfirmDelete({
      message: 'Supprimer cette conversation ?',
      onConfirm: async () => {
        setConfirmDelete(null)
        try {
          await deleteConversation(id)
          setConversations(list => list.filter(c => c.id !== id))
          if (activeId === id) newConversation()
        } catch {
          // best-effort — pas de blocage de l'UI si la suppression échoue
        }
      },
    })
  }

  const visibleMessages = messages.filter(m => m.role !== 'tool')
  const filteredConversations = conversations.filter(c =>
    (c.title || `Conversation #${c.id}`).toLowerCase().includes(conversationSearch.trim().toLowerCase())
  )

  return (
    <DashboardLayout title="Assistant IA" subtitle="Posez une question sur votre boutique — commandes, stock, clients à risque, rentabilité.">
      <div className="flex gap-4 h-[75vh]">
        {/* Conversations */}
        <div className="w-64 shrink-0 flex flex-col rounded-xl border border-app bg-app-card overflow-hidden">
          <div className="p-2 border-b border-app">
            <button type="button" onClick={newConversation}
              className={theme.btn.primary + ' w-full text-sm flex items-center justify-center gap-1.5'}>
              <Plus size={15} /> Nouvelle conversation
            </button>
          </div>
          <div className="px-2 pb-2 border-b border-app">
            <input
              value={conversationSearch} onChange={e => setConversationSearch(e.target.value)}
              placeholder="Rechercher une conversation…"
              className="w-full px-2.5 py-1.5 rounded-lg text-xs text-app-primary bg-app-card-alt outline-none focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 && (
              <p className="text-xs text-app-muted px-3 py-4 text-center">Aucune conversation pour l'instant.</p>
            )}
            {filteredConversations.map(c => (
              <div key={c.id} className="group relative">
                <button type="button" onClick={() => setActiveId(c.id)}
                  className={`w-full text-left pl-3 pr-8 py-2.5 text-sm truncate flex items-center gap-2 border-l-2 transition ${
                    activeId === c.id ? 'bg-app-card-alt border-violet-600 text-app-primary' : 'border-transparent text-app-muted-light hover:bg-app-card-alt'
                  }`}>
                  <MessageSquare size={13} className="shrink-0" />
                  <span className="truncate">{c.title || `Conversation #${c.id}`}</span>
                </button>
                <button type="button" onClick={e => handleDelete(e, c.id)} aria-label="Supprimer la conversation"
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-app-muted hover:text-red-400 transition p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Fil de discussion */}
        <div className="flex-1 flex flex-col rounded-xl border border-app bg-app-card overflow-hidden">
          <div data-testid="chat-messages" className="flex-1 overflow-y-auto p-4 space-y-4">
            {visibleMessages.length === 0 && !sending && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 rounded-full bg-violet-600/15 text-violet-500 flex items-center justify-center mb-3">
                  <Sparkles size={22} />
                </div>
                <p className="text-sm font-medium text-app-primary mb-1">Comment puis-je vous aider ?</p>
                <p className="text-xs text-app-muted mb-4">Posez une question sur vos données, ou essayez l'une de ces suggestions.</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {SUGGESTIONS.map(s => (
                    <button key={s} type="button" onClick={() => handleSend(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-app text-app-muted-light hover:text-app-primary hover:border-violet-600 transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {visibleMessages.map((m, i) => (
              m.pending_action
                ? <PendingActionCard key={i} action={m.pending_action} />
                : <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {sending && (
              <div className="flex gap-2.5">
                <Avatar role="assistant" />
                <div className="bg-app-card-alt rounded-2xl rounded-tl-sm"><TypingDots /></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {error && <p className="text-xs text-red-400 px-4 pb-1">{error}</p>}
          <div className="flex gap-2 p-3 border-t border-app items-end">
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown} rows={1}
              placeholder="Posez une question sur votre boutique… (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)"
              className="flex-1 rounded-lg border border-app bg-transparent px-3 py-2.5 text-sm text-app-primary outline-none focus:border-violet-500 resize-none max-h-40 transition" />
            <button type="button" onClick={() => handleSend()} disabled={sending || !input.trim()}
              className={theme.btn.primary + ' text-sm px-3 py-2.5 disabled:opacity-40 shrink-0'}
              aria-label="Envoyer">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog open={confirmDelete} onCancel={() => setConfirmDelete(null)} />
    </DashboardLayout>
  )
}
