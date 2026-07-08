import { useEffect, useState, useRef } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const TABS = [
  { key: '',  label: 'Tous' },
  { key: '0', label: 'Non récupérés' },
  { key: '1', label: 'Récupérés' },
]

function StatusBadge({ cart }) {
  if (cart.is_recovered)   return <span className={theme.badge.success + ' whitespace-nowrap'}>Récupéré</span>
  if (cart.reminder_sent)  return <span className={theme.badge.warning + ' whitespace-nowrap'}>Relance envoyée</span>
  return <span className={theme.badge.neutral + ' whitespace-nowrap'}>En attente</span>
}

// Lien WhatsApp attend un numéro international sans le 0 initial ni espaces —
// on suppose l'Algérie (+213) faute d'indicatif stocké séparément.
function whatsappLink(phone, message) {
  const digits = (phone || '').replace(/\D/g, '').replace(/^0/, '')
  return `https://wa.me/213${digits}?text=${encodeURIComponent(message)}`
}

function reminderMessage(cart) {
  const name = [cart.first_name, cart.last_name].filter(Boolean).join(' ') || 'bonjour'
  return `Bonjour ${name}, vous avez laissé des articles dans votre panier (${Number(cart.total).toLocaleString('fr-DZ')} DA). Voulez-vous finaliser votre commande ?`
}

function RemindMenu({ cart, busy, onWhatsapp, onEmail }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Pas d'email enregistré : un seul canal possible, pas besoin de menu.
  if (!cart.email) {
    return (
      <button onClick={onWhatsapp} disabled={busy} className={theme.btn.secondary + ' text-xs px-2.5! py-1! whitespace-nowrap'} title="Relancer par WhatsApp">
        Relancer
      </button>
    )
  }

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const menuWidth = 160
      const left = Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)
      setPos({ top: r.bottom + 6, left: Math.max(left, 8) })
    }
    setOpen(o => !o)
  }

  return (
    <>
      <button ref={btnRef} onClick={toggleOpen} disabled={busy} className={theme.btn.secondary + ' text-xs px-2.5! py-1! whitespace-nowrap inline-flex items-center gap-1'}>
        Relancer
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && pos && (
        // position: fixed échappe au overflow-hidden/overflow-x-auto du tableau parent
        // (contrairement à absolute, qui s'y faisait couper — bug rencontré en pratique).
        <div
          ref={menuRef}
          className="fixed z-50 w-40 rounded-lg border shadow-xl py-1"
          style={{ top: pos.top, left: pos.left, background: theme.dark.sidebar, borderColor: theme.dark.border }}
        >
          <button
            onClick={() => { setOpen(false); onWhatsapp() }}
            className="w-full text-left px-3.5 py-2 text-sm text-gray-300 hover:bg-white/6 transition-colors duration-100 cursor-pointer"
          >
            Par WhatsApp
          </button>
          <button
            onClick={() => { setOpen(false); onEmail() }}
            className="w-full text-left px-3.5 py-2 text-sm text-gray-300 hover:bg-white/6 transition-colors duration-100 cursor-pointer"
          >
            Par email
          </button>
        </div>
      )}
    </>
  )
}

function ItemsModal({ cart, onClose }) {
  const items = cart.items || []
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border p-5 sm:p-6 max-h-[80vh] overflow-y-auto"
        style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-1">Panier de {cart.first_name} {cart.last_name}</h2>
        <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>{cart.phone}</p>

        {items.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">Aucun détail d'article enregistré.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: theme.dark.sidebar }}>
                <div>
                  <p className="text-gray-200">{item.product_name || 'Article'}</p>
                  <p className="text-xs" style={{ color: theme.dark.muted }}>Qté : {item.quantity}</p>
                </div>
                <p className="text-violet-300 font-medium">{Number((item.price || 0) * (item.quantity || 1)).toLocaleString('fr-DZ')} DA</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-3 flex justify-between text-sm font-semibold" style={{ borderColor: theme.dark.border }}>
          <span className="text-gray-300">Total</span>
          <span className="text-white">{Number(cart.total).toLocaleString('fr-DZ')} DA</span>
        </div>

        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition">Fermer</button>
        </div>
      </div>
    </div>
  )
}

export default function AbandonedCartsPage() {
  const [carts,   setCarts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('')
  const [page,    setPage]    = useState(1)
  const [total,   setTotal]   = useState(0)
  const [viewing, setViewing] = useState(null)
  const [remindingId, setRemindingId] = useState(null)
  const [delayHours, setDelayHours] = useState(1)
  const [savingDelay, setSavingDelay] = useState(false)
  const PER_PAGE = 20

  useEffect(() => {
    api.get('/stores/me/settings/').then(({ data }) => setDelayHours(data.abandoned_cart_delay_hours)).catch(() => {})
  }, [])

  const saveDelay = async () => {
    setSavingDelay(true)
    try {
      await api.put('/stores/me/settings/', { abandoned_cart_delay_hours: delayHours })
    } catch {} finally { setSavingDelay(false) }
  }

  const fetchCarts = () => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: PER_PAGE })
    if (tab !== '') params.set('recovered', tab)
    api.get(`/orders/abandoned-carts/?${params}`)
      .then(({ data }) => { setCarts(data.results); setTotal(data.count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCarts() }, [tab, page])

  const switchTab = (t) => { setTab(t); setPage(1) }
  const totalPages = Math.ceil(total / PER_PAGE)

  const handleRemindWhatsapp = async (cart) => {
    window.open(whatsappLink(cart.phone, reminderMessage(cart)), '_blank', 'noopener')
    setRemindingId(cart.id)
    try {
      await api.post(`/orders/abandoned-carts/${cart.id}/remind/`, { channel: 'whatsapp' })
      fetchCarts()
    } catch {} finally { setRemindingId(null) }
  }

  const handleRemindEmail = async (cart) => {
    setRemindingId(cart.id)
    try {
      await api.post(`/orders/abandoned-carts/${cart.id}/remind/`, { channel: 'email' })
      fetchCarts()
    } catch {} finally { setRemindingId(null) }
  }

  return (
    <DashboardLayout title="Paniers abandonnés">
      {/* Réglage délai de relance automatique */}
      <div className="rounded-xl border p-5 mb-5 flex items-center gap-4 flex-wrap" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex-1 min-w-60">
          <p className="text-sm font-medium text-gray-200 mb-0.5">Relance automatique par email</p>
          <p className="text-xs" style={{ color: theme.dark.muted }}>
            Un email de relance est envoyé automatiquement (paniers avec email renseigné) après ce délai sans finalisation — nécessite la tâche planifiée <code>send_abandoned_cart_reminders</code>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number" min="1"
            value={delayHours}
            onChange={e => setDelayHours(Number(e.target.value))}
            className="w-20 px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 text-center"
            style={{ borderColor: theme.dark.border }}
          />
          <span className="text-xs" style={{ color: theme.dark.muted }}>heure(s)</span>
          <button onClick={saveDelay} disabled={savingDelay} className={theme.btn.primary + ' text-sm px-4 py-2'}>
            {savingDelay ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
              tab === t.key
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: theme.dark.card, borderBottom: `1px solid ${theme.dark.border}` }}>
                {['Date', 'Client', 'Email', 'Wilaya', 'Articles', 'Total', 'Statut', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.dark.border}` }}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className={`h-3 rounded ${theme.skeleton} w-24`} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : carts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-gray-500">
                    <svg className="w-10 h-10 mx-auto mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
                    </svg>
                    Aucun panier abandonné
                  </td>
                </tr>
              ) : carts.map(cart => (
                <tr key={cart.id}
                  className="transition-colors duration-150"
                  style={{ borderBottom: `1px solid ${theme.dark.border}`, background: theme.dark.app }}
                  onMouseEnter={e => e.currentTarget.style.background = theme.dark.card}
                  onMouseLeave={e => e.currentTarget.style.background = theme.dark.app}>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {new Date(cart.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-200 font-medium">{cart.first_name} {cart.last_name}</p>
                    <p className="text-gray-500 text-xs">{cart.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{cart.email || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-gray-400">{cart.wilaya || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">
                    <button onClick={() => setViewing(cart)} className="text-violet-300 hover:text-violet-200 underline decoration-dotted transition">
                      {(cart.items || []).length} article(s)
                    </button>
                  </td>
                  <td className="px-4 py-3 text-violet-400 font-semibold">
                    {Number(cart.total).toLocaleString('fr-DZ')} DA
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><StatusBadge cart={cart} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {!cart.is_recovered && (
                      <RemindMenu
                        cart={cart}
                        busy={remindingId === cart.id}
                        onWhatsapp={() => handleRemindWhatsapp(cart)}
                        onEmail={() => handleRemindEmail(cart)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">{total} panier(s) au total</p>
          <div className="flex gap-1">
            {[...Array(totalPages)].map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)}
                className={`w-8 h-8 rounded-lg text-sm transition-colors cursor-pointer ${
                  page === i + 1
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-400 hover:bg-white/5'
                }`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewing && <ItemsModal cart={viewing} onClose={() => setViewing(null)} />}
    </DashboardLayout>
  )
}
