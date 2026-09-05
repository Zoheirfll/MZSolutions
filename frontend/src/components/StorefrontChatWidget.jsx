import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { renderMarkdown } from '../lib/markdown'
import { sendPublicChatMessage, getPublicChatHistory } from '../api/publicChatApi'

function sessionKey(slug) {
  return `mz_chat_session_${slug}`
}

function getOrCreateSessionId(slug) {
  try {
    const existing = localStorage.getItem(sessionKey(slug))
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(sessionKey(slug), id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export default function StorefrontChatWidget({ slug }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const sessionIdRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open && !sessionIdRef.current) {
      sessionIdRef.current = getOrCreateSessionId(slug)
      getPublicChatHistory({ slug, sessionId: sessionIdRef.current })
        .then(data => setMessages(data.messages))
        .catch(() => {})
    }
  }, [open, slug])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, sending])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    if (!sessionIdRef.current) sessionIdRef.current = getOrCreateSessionId(slug)
    setMessages(m => [...m, { role: 'user', content: text }])
    setInput('')
    setSending(true)
    setError('')
    try {
      const data = await sendPublicChatMessage({ slug, sessionId: sessionIdRef.current, message: text })
      setMessages(m => [...m, { role: 'assistant', content: data.reply }])
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

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-80 sm:w-96 h-[28rem] rounded-xl border shadow-xl flex flex-col overflow-hidden"
          style={{ background: 'var(--sf-body-bg)', borderColor: 'var(--sf-footer-border)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--sf-footer-border)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>Besoin d'aide ?</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" style={{ color: 'var(--sf-text-muted)' }}>
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.length === 0 && (
              <p style={{ color: 'var(--sf-text-muted)' }}>Posez-nous une question sur nos produits, la livraison, ou le statut de votre commande.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`rounded-2xl px-3 py-2 max-w-[85%] ${m.role === 'user' ? 'ml-auto text-white' : ''}`}
                style={m.role === 'user' ? { background: 'var(--sf-primary)' } : { background: 'var(--sf-header-bg)', color: 'var(--sf-text)' }}>
                {m.role === 'user'
                  ? <p className="whitespace-pre-wrap">{m.content}</p>
                  : <div className="sf-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />}
              </div>
            ))}
            {sending && <p style={{ color: 'var(--sf-text-muted)' }}>…</p>}
            <div ref={bottomRef} />
          </div>
          {error && <p className="text-xs text-red-500 px-3 pb-1">{error}</p>}
          <div className="flex gap-2 p-2.5 border-t" style={{ borderColor: 'var(--sf-footer-border)' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Posez une question…"
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--sf-footer-border)', color: 'var(--sf-text)', background: 'transparent' }} />
            <button type="button" onClick={handleSend} disabled={sending || !input.trim()} aria-label="Envoyer"
              className="rounded-lg px-3 py-2 text-white disabled:opacity-40" style={{ background: 'var(--sf-primary)' }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Assistant boutique"
        className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white"
        style={{ background: 'var(--sf-primary)' }}>
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </div>
  )
}
