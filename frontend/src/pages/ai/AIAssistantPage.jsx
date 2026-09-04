import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { theme } from '../../theme'
import { listConversations, getConversation, sendChatMessage } from '../../api/aiApi'

export default function AIAssistantPage() {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    listConversations().then(setConversations).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeId) {
      getConversation(activeId).then(c => setMessages(c.messages)).catch(() => {})
    }
  }, [activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    const userText = input
    setMessages(m => [...m, { role: 'user', content: userText }])
    setInput('')
    setSending(true)
    setError('')
    try {
      const data = await sendChatMessage({ conversationId: activeId, message: userText })
      setActiveId(data.conversation_id)
      setMessages(m => [...m, { role: 'assistant', content: data.reply }])
      listConversations().then(setConversations).catch(() => {})
    } catch (e) {
      setError(e?.response?.data?.detail || 'Assistant IA indisponible')
    } finally {
      setSending(false)
    }
  }

  return (
    <DashboardLayout title="Assistant IA" subtitle="Posez une question sur votre boutique — commandes, stock, clients à risque, rentabilité.">
      <div className="flex gap-4 h-[70vh]">
        <div className="w-64 shrink-0 rounded-lg border border-app bg-app-card overflow-y-auto">
          <button type="button" onClick={() => { setActiveId(null); setMessages([]) }}
            className="w-full text-left px-3 py-2 text-sm text-app-primary border-b border-app">
            + Nouvelle conversation
          </button>
          {conversations.map(c => (
            <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
              className={`w-full text-left px-3 py-2 text-sm truncate ${activeId === c.id ? 'bg-app-card-alt' : ''}`}>
              {c.title || `Conversation #${c.id}`}
            </button>
          ))}
        </div>
        <div className="flex-1 flex flex-col rounded-lg border border-app bg-app-card">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.filter(m => m.role !== 'tool').map((m, i) => (
              <div key={i} className={`text-sm rounded-lg px-3 py-2 max-w-[80%] ${m.role === 'user' ? 'ml-auto bg-violet-600 text-white' : 'bg-app-card-alt text-app-primary'}`}>
                {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {error && <p className="text-xs text-red-400 px-4">{error}</p>}
          <div className="flex gap-2 p-3 border-t border-app">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Posez une question sur votre boutique…"
              className="flex-1 rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app-primary" />
            <button type="button" onClick={handleSend} disabled={sending}
              className={theme.btn.primary + ' text-sm disabled:opacity-50'}>
              {sending ? '…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
