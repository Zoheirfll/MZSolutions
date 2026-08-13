import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import Logo from './Logo'
import { theme } from '../theme'
import { useTheme } from '../hooks/useTheme'

function playNewOrderChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    ;[880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.14)
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.14 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.14)
      osc.stop(now + i * 0.14 + 0.3)
    })
  } catch {}
}

const ICONS = {
  dashboard: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h7v9H3V3zm0 13h7v5H3v-5zm11-13h7v5h-7V3zm0 9h7v9h-7v-9z" />
    </svg>
  ),
  orders: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  products: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  customers: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-8 0" />
    </svg>
  ),
  shipping: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5V9a1 1 0 011-1h9v8.5M3 16.5h1.5m8.5 0h4m-4 0V8m4 8.5H21m-4.5 0a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0zM7.5 16.5a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0zM13 11h4l3 3.5v2h-1" />
    </svg>
  ),
  inbox: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  ),
  tracking: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  ),
  complaints: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  exchange: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h13l-3-3m3 3-3 3M20 17H7l3 3m-3-3 3-3" />
    </svg>
  ),
  stock: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 8-8m0 0h-5m5 0v5" />
    </svg>
  ),
  stats: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15l4-4 4 4 5-6" />
    </svg>
  ),
  store: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l1.5-5h15L21 9M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18M8 21v-6h8v6" />
    </svg>
  ),
  team: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  dropshipping: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M4 8h16M6 8v11a1 1 0 001 1h10a1 1 0 001-1V8M10 12v4m4-4v4" />
    </svg>
  ),
  subscription: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  ),
  channels: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342a4 4 0 010-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 9.632a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684zm0-9.632a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zM6 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  webhooks: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  marketing: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  bell: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  menu: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  close: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
}

function PageInfoButton({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!text) return null

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Informations sur cette page"
        aria-expanded={open}
        className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border border-(--border-color-hover) text-app-muted-light hover:text-violet-400 hover:border-violet-500/40 hover:bg-violet-500/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        ?
      </button>
      {open && (
        <div
          className="absolute z-50 top-7 left-0 w-[calc(100vw-2.5rem)] max-w-md rounded-xl border p-4 text-sm leading-relaxed text-app-primary shadow-xl space-y-2"
          style={{ background: theme.dark.sidebar, borderColor: theme.dark.borderHover, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}
        >
          <p className="text-[11px] font-semibold tracking-widest text-violet-400">À QUOI SERT CETTE PAGE</p>
          <div className="whitespace-pre-line">{text}</div>
        </div>
      )}
    </div>
  )
}

export default function DashboardLayout({ children, title, subtitle }) {
  const { user, logout } = useAuth()
  const { theme: currentTheme, toggleTheme } = useTheme()
  const teamRole = user?.team_role || null
  const can = key => !!user?.permissions?.[key]
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)

  useEffect(() => {
    const onClick = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const [expanded, setExpanded]         = useState({
    produits:     location.pathname.startsWith('/dashboard/produits'),
    fournisseurs: location.pathname.startsWith('/dashboard/produits/fournisseurs'),
    commandes:    location.pathname.startsWith('/dashboard/commandes'),
    annulation:   location.pathname.startsWith('/dashboard/commandes/annulations'),
    suivi:        ['/dashboard/commandes/raisons-echec', '/dashboard/echanges'].some(p => location.pathname.startsWith(p)),
    clients:      location.pathname.startsWith('/dashboard/clients'),
    finances:     location.pathname.startsWith('/dashboard/finances'),
    paiements:    location.pathname.startsWith('/dashboard/paiements'),
    dispatch:     location.pathname.startsWith('/dashboard/dispatch'),
    stats:        location.pathname.startsWith('/dashboard/stats'),
    expeditions:  location.pathname.startsWith('/dashboard/expeditions'),
    stock:        location.pathname.startsWith('/dashboard/stock'),
  })
  const [lowStockCount, setLowStockCount] = useState(0)
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0)
  const [openExchangesCount, setOpenExchangesCount] = useState(0)
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
  const [newOrderPulse, setNewOrderPulse] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [quota, setQuota] = useState(null)
  const [notifyNewOrders, setNotifyNewOrders] = useState(true) // StoreSettings.notify_new_orders — optimiste jusqu'au fetch
  const pendingOrdersRef = useRef(null) // null = pas encore chargé (évite un faux positif au premier fetch)

  useEffect(() => {
    api.get('/products/low-stock/').then(({ data }) => setLowStockCount(data.count)).catch(() => {})
    api.get('/inbox/unread-count/').then(({ data }) => setInboxUnreadCount(data.count)).catch(() => {})
    api.get('/orders/exchanges/?status=open&per_page=1').then(({ data }) => setOpenExchangesCount(data.count)).catch(() => {})
    api.get('/stores/me/quota/').then(({ data }) => setQuota(data)).catch(() => {})
    api.get('/stores/me/settings/').then(({ data }) => setNotifyNewOrders(data.notify_new_orders !== false)).catch(() => {})
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  // Prévenir le vendeur (son + badge + notification navigateur) dès qu'une
  // nouvelle commande "en attente" arrive — sondage léger, pas de websocket
  // dans le projet. `pendingOrdersRef` retient la dernière valeur connue
  // pour ne détecter que les VRAIES augmentations (pas le chargement initial).
  useEffect(() => {
    const checkPendingOrders = () => {
      // StoreSettings.notify_new_orders — désactivé = pas de badge/son/notif
      // navigateur pour les nouvelles commandes (le reste du dashboard,
      // boîte de réception incluse, continue de fonctionner normalement).
      if (notifyNewOrders) {
        api.get('/orders/?status=pending&per_page=1').then(({ data }) => {
          const count = data.count ?? 0
          if (pendingOrdersRef.current !== null && count > pendingOrdersRef.current) {
            playNewOrderChime()
            setNewOrderPulse(true)
            setTimeout(() => setNewOrderPulse(false), 4000)
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('Nouvelle commande reçue', {
                body: `${count - pendingOrdersRef.current} nouvelle(s) commande(s) en attente de confirmation.`,
                icon: '/favicon.ico',
              })
            }
          }
          pendingOrdersRef.current = count
          setPendingOrdersCount(count)
        }).catch(() => {})
      }
      // Même sondage 30s, étendu à la boîte de réception plutôt que d'en
      // ajouter un second (US "boîte de réception, tout doit y arriver", 2026-08).
      api.get('/inbox/unread-count/').then(({ data }) => setInboxUnreadCount(data.count)).catch(() => {})
    }
    checkPendingOrders()
    const interval = setInterval(checkPendingOrders, 30000)
    return () => clearInterval(interval)
  }, [notifyNewOrders])

  // Alerte visuelle à l'approche de la limite (US-8.5.2) — essai gratuit
  // uniquement (un abonnement payant actif n'affiche pas cette alerte).
  const daysLeft = quota ? Math.max(0, Math.ceil((new Date(quota.trial_ends_at) - new Date()) / 86400000)) : null
  const usedPct  = quota && quota.orders_limit ? Math.round((quota.orders_used / quota.orders_limit) * 100) : 0
  const showQuotaAlert = quota && !quota.plan && (usedPct >= 80 || (daysLeft !== null && daysLeft <= 3))

  const handleLogout = () => { logout(); navigate('/auth') }
  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase()

  const link = (to, label, exact = false) => (
    <NavLink
      to={to}
      end={exact}
      onClick={() => setMobileNavOpen(false)}
      className={({ isActive }) =>
        `${theme.nav.subItem.base} ${isActive ? theme.nav.subItem.active : theme.nav.subItem.inactive}`
      }
    >
      {label}
    </NavLink>
  )

  const mainLink = (to, icon, label, exact = false, badge = null) => (
    <NavLink
      to={to}
      end={exact}
      onClick={() => setMobileNavOpen(false)}
      className={({ isActive }) =>
        `${theme.nav.item.base} ${isActive ? theme.nav.item.active : theme.nav.item.inactive}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-violet-500" />
          )}
          <span className={`shrink-0 ${isActive ? 'text-violet-400' : ''}`}>{icon}</span>
          <span className="flex-1">{label}</span>
          {badge > 0 && (
            <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold shrink-0">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  const disabled = (icon, label) => (
    <span className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-not-allowed opacity-40 text-app-muted-light">
      <span className="shrink-0">{icon}</span><span className="truncate">{label}</span>
    </span>
  )

  const prodActive = location.pathname.startsWith('/dashboard/produits')

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: theme.dark.app, colorScheme: currentTheme }}>

      {/* ── Mobile overlay ── */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`w-72 sm:w-64 shrink-0 flex flex-col border-r overflow-y-auto fixed lg:static inset-y-0 left-0 z-40
          transition-transform duration-300 ease-in-out
          ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>

        {/* Logo */}
        <div className="px-5 py-5 border-b flex items-center justify-between" style={{ borderColor: theme.dark.border }}>
          <div className="min-w-0 flex items-center gap-2.5">
            <Logo className="w-11 h-auto shrink-0 text-violet-400" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-app-primary tracking-tight leading-none">MZSolutions</p>
              <p className="text-xs mt-1.5 truncate" style={{ color: theme.dark.muted }}>
                {user?.store_name ?? user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            {ICONS.close}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3.5 py-5 space-y-6">

          {/* E-COMMERCE */}
          <div>
            <p className="text-[10px] font-semibold px-2 mb-2 tracking-widest" style={{ color: theme.dark.muted }}>E-COMMERCE</p>
            <ul className="space-y-0.5">
              <li>{mainLink('/dashboard', ICONS.dashboard, 'Tableau de bord', true)}</li>
              {can('inbox_view') && <li>{mainLink('/dashboard/boite-reception', ICONS.inbox, 'Boîte de réception', false, inboxUnreadCount)}</li>}

              {/* Commandes — expandable */}
              <li>
                <button
                  onClick={() => setExpanded(e => ({ ...e, commandes: !e.commandes }))}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    location.pathname.startsWith('/dashboard/commandes') ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.orders}</span>Commandes</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {pendingOrdersCount > 0 && (
                      <span className={`w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold ${newOrderPulse ? 'animate-pulse' : ''}`}>
                        {pendingOrdersCount > 9 ? '9+' : pendingOrdersCount}
                      </span>
                    )}
                    <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded.commandes ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
                {expanded.commandes && (
                  <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                    <li>{link('/dashboard/commandes', 'Toutes les commandes', true)}</li>
                    {!can('orders_manage') ? null : (
                      <>
                        <li>{link('/dashboard/commandes/programmees', 'Commandes programmées')}</li>
                        <li>{link('/dashboard/commandes/nouvelle', 'Nouvelle commande')}</li>
                        <li>{link('/dashboard/commandes/taux-confirmation', 'Taux de confirmation')}</li>
                        <li>{link('/dashboard/commandes/paniers-abandonnes', 'Paniers abandonnés')}</li>
                        {/* Annulation — expandable */}
                        <li>
                          <button
                            onClick={() => setExpanded(e => ({ ...e, annulation: !e.annulation }))}
                            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                          >
                            <span>Annulation</span>
                            <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.annulation ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          {expanded.annulation && (
                            <ul className="mt-0.5 ml-4 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                              <li>{link('/dashboard/commandes/annulations/demandes', "Demande d'annulation")}</li>
                              <li>{link('/dashboard/commandes/annulations/confirmees', 'Annulation confirmée')}</li>
                            </ul>
                          )}
                        </li>
                      </>
                    )}
                  </ul>
                )}
              </li>

              {/* Dispatch Commandes — règles de routage automatique (produit/wilaya → confirmateur/transporteur) */}
              {can('orders_manage') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, dispatch: !e.dispatch }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      location.pathname.startsWith('/dashboard/dispatch') ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.tracking}</span>Dispatch Commandes</span>
                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.dispatch ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {expanded.dispatch && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/dispatch/confirmateur', 'Par confirmateur')}</li>
                      <li>{link('/dashboard/dispatch/transporteur', 'Par société de livraison')}</li>
                      <li>{link('/dashboard/dispatch/wilaya', 'Par wilaya')}</li>
                    </ul>
                  )}
                </li>
              )}

              {/* Suivi des commandes — regroupe échecs d'appel / échanges (les réclamations vivent désormais dans la Boîte de réception) */}
              {(can('orders_manage') || can('exchanges_view')) && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, suivi: !e.suivi }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      ['/dashboard/commandes/raisons-echec', '/dashboard/echanges'].some(p => location.pathname.startsWith(p))
                        ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.tracking}</span>Suivi des commandes</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {openExchangesCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                          {openExchangesCount > 9 ? '9+' : openExchangesCount}
                        </span>
                      )}
                      <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded.suivi ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </button>
                  {expanded.suivi && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      {can('orders_manage') && <li>{link('/dashboard/commandes/raisons-echec', 'Gestion des échecs')}</li>}
                      {can('exchanges_view') && (
                        <li className="flex items-center justify-between">
                          {link('/dashboard/echanges', 'Gestion échanges')}
                          {openExchangesCount > 0 && <span className="mr-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold shrink-0">{openExchangesCount > 9 ? '9+' : openExchangesCount}</span>}
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              )}

              {/* Produits & Catégories */}
              {can('products_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, produits: !e.produits }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      prodActive ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.products}</span>Produits & Catégories</span>
                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.produits ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {expanded.produits && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/produits', 'Tous les produits', true)}</li>
                      <li>{link('/dashboard/produits/nouveau', 'Ajouter produit')}</li>
                      <li>{link('/dashboard/produits/categories', 'Catégories')}</li>
                      <li>
                        <button
                          onClick={() => setExpanded(e => ({ ...e, fournisseurs: !e.fournisseurs }))}
                          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          <span>Fournisseur</span>
                          <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.fournisseurs ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        {expanded.fournisseurs && (
                          <ul className="mt-0.5 ml-4 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                            <li>{link('/dashboard/produits/fournisseurs', 'Fournisseur', true)}</li>
                            <li>{link('/dashboard/produits/fournisseurs/credits', 'Crédit Fournisseur')}</li>
                            <li>{link('/dashboard/produits/fournisseurs/versements', 'Versement fournisseur')}</li>
                          </ul>
                        )}
                      </li>
                      <li>{link('/dashboard/produits/avis', 'Avis')}</li>
                      <li>{link('/dashboard/produits/promotions/coupons', 'Coupons')}</li>
                      <li>{link('/dashboard/produits/promotions/auto', 'Réductions automatiques')}</li>
                    </ul>
                  )}
                </li>
              )}

              {can('clients_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, clients: !e.clients }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      location.pathname.startsWith('/dashboard/clients') ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.customers}</span>Clients</span>
                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.clients ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {expanded.clients && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/clients', 'Clients', true)}</li>
                      <li>{link('/dashboard/clients/risque', 'Clients à risque')}</li>
                      <li>{link('/dashboard/clients/liste-noire', 'Liste noire')}</li>
                    </ul>
                  )}
                </li>
              )}
              {teamRole !== 'dropshipper' && can('dropshipping_view') && (
                <li>{mainLink('/dashboard/dropshipping', ICONS.dropshipping, 'Dropshipping')}</li>
              )}
              {can('channels_view') && (
                <li>{mainLink('/dashboard/canaux-vente', ICONS.channels, 'Canaux de vente')}</li>
              )}
              {can('marketing_view') && (
                <li>{mainLink('/dashboard/marketing', ICONS.marketing, 'Marketing')}</li>
              )}
              {can('webhooks_view') && (
                <li>{mainLink('/dashboard/webhooks', ICONS.webhooks, 'Webhooks')}</li>
              )}
              {teamRole === 'dropshipper' && (
                <>
                  <li>{mainLink('/dashboard/mes-produits', ICONS.dropshipping, 'Mes produits')}</li>
                  <li>{mainLink('/dashboard/mes-commissions', ICONS.subscription, 'Mes commissions')}</li>
                </>
              )}
              {can('finances_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, finances: !e.finances }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      location.pathname.startsWith('/dashboard/finances') ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.stats}</span>Finances</span>
                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.finances ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {expanded.finances && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/finances/rentabilite', 'Rentabilité')}</li>
                      <li>{link('/dashboard/finances/couts', 'Coûts')}</li>
                    </ul>
                  )}
                </li>
              )}
              {can('finances_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, paiements: !e.paiements }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      location.pathname.startsWith('/dashboard/paiements') ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.subscription}</span>Paiements</span>
                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.paiements ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {expanded.paiements && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/paiements/pret', 'Paiement prêt')}</li>
                      <li>{link('/dashboard/paiements/recupere', 'Paiement récupéré')}</li>
                      <li>{link('/dashboard/paiements/import-excel', 'Importer un fichier Excel')}</li>
                    </ul>
                  )}
                </li>
              )}
              {can('shipping_settings_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, expeditions: !e.expeditions }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      location.pathname.startsWith('/dashboard/expeditions') ? 'bg-white/6 text-app-primary font-medium' : 'text-gray-400 hover:text-app-primary hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.shipping}</span>Expéditions & Retours</span>
                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.expeditions ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {expanded.expeditions && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/expeditions', 'Expéditions', true)}</li>
                      <li>{link('/dashboard/expeditions/etiquettes', 'Étiquettes')}</li>
                      <li>{link('/dashboard/expeditions/preparees', 'Commandes préparées')}</li>
                      <li>{link('/dashboard/expeditions/retour-predictif', 'Retour prédictif')}</li>
                      <li>{link('/dashboard/expeditions/retours', 'Validation des retours')}</li>
                    </ul>
                  )}
                </li>
              )}
              {can('stock_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, stock: !e.stock }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      location.pathname.startsWith('/dashboard/stock') ? 'bg-white/6 text-app-primary font-medium' : 'text-gray-400 hover:text-app-primary hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.stock}</span>Stock & Inventaire</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {lowStockCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                          {lowStockCount > 9 ? '9+' : lowStockCount}
                        </span>
                      )}
                      <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.stock ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </button>
                  {expanded.stock && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/stock', 'Stock & Inventaire', true)}</li>
                      <li>{link('/dashboard/stock/mouvements', 'Mouvement des stocks')}</li>
                      <li>{link('/dashboard/stock/retour-vendeur', 'Retour au vendeur')}</li>
                    </ul>
                  )}
                </li>
              )}
              {can('stats_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, stats: !e.stats }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      location.pathname.startsWith('/dashboard/stats') ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.stats}</span>Statistiques</span>
                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.stats ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {expanded.stats && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/stats', 'Statistiques globales', true)}</li>
                      <li>{link('/dashboard/stats/commandes', 'Statistiques commandes')}</li>
                      <li>{link('/dashboard/stats/retours', 'Statistique retours')}</li>
                      <li>{link('/dashboard/stats/echecs', 'Statistique des échecs')}</li>
                      <li>{link('/dashboard/stats/vente-stock', 'Statistique vente de stock')}</li>
                      <li>{link('/dashboard/stats/produits', 'Statistiques des produits')}</li>
                      <li>{link('/dashboard/stats/confirmateurs', 'Statistique par confirmateur')}</li>
                      <li>{link('/dashboard/stats/wilayas', 'Statistiques par wilaya')}</li>
                      <li>{link('/dashboard/stats/sources', 'Statistiques des sources')}</li>
                    </ul>
                  )}
                </li>
              )}
            </ul>
          </div>

          {/* PARAMÈTRES */}
          {(can('store_view') || can('shipping_settings_view') || can('team_view')) && (
            <div>
              <p className="text-[10px] font-semibold px-2 mb-2 tracking-widest" style={{ color: theme.dark.muted }}>PARAMÈTRES</p>
              <ul className="space-y-0.5">
                {can('store_view') && (
                  <li>
                    {mainLink('/dashboard/boutique', ICONS.store, 'Ma boutique')}
                    <ul className="ml-7 mt-0.5 space-y-0.5">
                      <li>{link('/dashboard/boutique/theme',   'Thème & Apparence')}</li>
                      <li>{link('/dashboard/boutique/pages',   'Pages')}</li>
                      <li>{link('/dashboard/boutique/menu',    'Menu')}</li>
                      <li>{link('/dashboard/boutique/fichiers','Fichiers')}</li>
                    </ul>
                  </li>
                )}
                {can('shipping_settings_view') && (
                  <li>{mainLink('/dashboard/parametres-livraison', ICONS.shipping, 'Paramètres livraison')}</li>
                )}
                {can('team_view') && (
                  <li>{mainLink('/dashboard/equipe', ICONS.team, 'Équipe')}</li>
                )}
                {(!teamRole || teamRole === 'admin') && (
                  <li>{mainLink('/dashboard/equipe/permissions', ICONS.team, 'Permissions par rôle')}</li>
                )}
                {(!teamRole || teamRole === 'admin') && (
                  <li>{mainLink('/dashboard/abonnement', ICONS.subscription, 'Abonnement')}</li>
                )}
              </ul>
            </div>
          )}
        </nav>

        {/* User bottom */}
        <div className="px-5 py-5 border-t" style={{ borderColor: theme.dark.border }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-app-primary font-medium truncate">{user?.first_name} {user?.last_name}</p>
              <p className="text-xs truncate" style={{ color: theme.dark.muted }}>{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="mt-3 w-full text-xs py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="flex items-center justify-between gap-2 px-5 sm:px-8 py-4 border-b shrink-0"
          style={{ background: theme.dark.app, borderColor: theme.dark.border }}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              {ICONS.menu}
            </button>
            <div className="min-w-0 flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold text-app-primary truncate">{title}</h1>
              <PageInfoButton text={subtitle} />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Cloche — mène à la boîte de réception (US "tout doit y arriver", 2026-08) */}
            <button
              onClick={() => navigate('/dashboard/boite-reception')}
              className="relative w-9 h-9 rounded-lg border flex items-center justify-center text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              style={{ borderColor: theme.dark.border }}
              title="Boîte de réception"
            >
              {ICONS.bell}
              {inboxUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-bold">
                  {inboxUnreadCount > 9 ? '9+' : inboxUnreadCount}
                </span>
              )}
            </button>
            {/* Chantier epic-mode-clair-rollout terminé — toutes les pages du dashboard
                consomment désormais .text-app-primary/-muted/-muted-light (pilotées par
                data-theme) plutôt que des couleurs Tailwind codées en dur, donc le toggle
                n'a plus besoin d'être restreint à certaines pages. */}
            <button
              onClick={toggleTheme}
              data-testid="theme-toggle"
              aria-label={currentTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              className="w-9 h-9 rounded-lg border-app flex items-center justify-center text-app-muted hover:text-app-primary hover:bg-violet-500/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              style={{ borderWidth: 1, borderStyle: 'solid' }}
            >
              {currentTheme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <a
              href={user?.store_slug ? `/store/${user.store_slug}` : '#'}
              target="_blank" rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-violet-500/20 text-violet-500 hover:bg-violet-500/5 hover:border-violet-500/30 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Voir ma boutique
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            {/* Profil — avatar + menu déroulant (nom/email, raccourcis, déconnexion) */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="w-9 h-9 rounded-full bg-violet-700 text-white flex items-center justify-center text-xs font-bold shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                title="Profil"
                aria-haspopup="true"
                aria-expanded={profileOpen}
              >
                {initials}
              </button>
              {profileOpen && (
                <div
                  className="absolute right-0 z-50 mt-2 w-64 rounded-xl border shadow-xl py-2"
                  style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: theme.dark.border }}>
                    <p className="text-sm text-app-primary font-medium truncate">{user?.first_name} {user?.last_name}</p>
                    <p className="text-xs truncate" style={{ color: theme.dark.muted }}>{user?.email}</p>
                  </div>
                  <a
                    href={user?.store_slug ? `/store/${user.store_slug}` : '#'}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100"
                  >
                    Voir ma boutique
                  </a>
                  <button onClick={() => { setProfileOpen(false); navigate('/dashboard/boutique') }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100 text-left cursor-pointer">
                    Ma boutique
                  </button>
                  <button onClick={() => { setProfileOpen(false); navigate('/dashboard/parametres') }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100 text-left cursor-pointer">
                    Paramètres
                  </button>
                  <button onClick={() => { setProfileOpen(false); navigate('/dashboard/parametres-livraison') }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100 text-left cursor-pointer">
                    Paramètres livraison
                  </button>
                  {can('team_view') && (
                    <button onClick={() => { setProfileOpen(false); navigate('/dashboard/equipe') }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100 text-left cursor-pointer">
                      Équipe
                    </button>
                  )}
                  {(!teamRole || teamRole === 'admin') && (
                    <button onClick={() => { setProfileOpen(false); navigate('/dashboard/abonnement') }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100 text-left cursor-pointer">
                      Abonnement
                    </button>
                  )}
                  <div className="my-1.5 border-t" style={{ borderColor: theme.dark.border }} />
                  <button onClick={() => { setProfileOpen(false); navigate('/dashboard/contact') }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100 text-left cursor-pointer">
                    Contactez-nous
                  </button>
                  <button onClick={() => { setProfileOpen(false); navigate('/dashboard/faq') }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100 text-left cursor-pointer">
                    FAQ
                  </button>
                  <div className="my-1.5 border-t" style={{ borderColor: theme.dark.border }} />
                  <div className="flex items-center justify-between px-4 py-2 text-sm text-app-primary">
                    Langue
                    <span className="text-xs px-2 py-0.5 rounded-md" style={{ color: theme.dark.muted, background: theme.dark.cardAlt }}>Français</span>
                  </div>
                  <button
                    onClick={() => { setProfileOpen(false); toggleTheme() }}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition-colors duration-100 text-left cursor-pointer"
                  >
                    Thème
                    <span className="text-xs" style={{ color: theme.dark.muted }}>{currentTheme === 'dark' ? 'Sombre' : 'Clair'}</span>
                  </button>
                  <div className="my-1.5 border-t" style={{ borderColor: theme.dark.border }} />
                  <button
                    onClick={() => { setProfileOpen(false); handleLogout() }}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors duration-100 cursor-pointer"
                  >
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {showQuotaAlert && (!teamRole || teamRole === 'admin') && (
          <div className="flex items-center justify-between gap-3 px-5 sm:px-8 py-2.5 text-sm shrink-0 bg-red-500/10 border-b border-red-500/25">
            <span className="text-red-400">
              {usedPct >= 80 && daysLeft !== null && daysLeft <= 3
                ? `Essai gratuit : ${quota.orders_remaining} commande${quota.orders_remaining !== 1 ? 's' : ''} restante${quota.orders_remaining !== 1 ? 's' : ''}, se termine dans ${daysLeft} jour${daysLeft !== 1 ? 's' : ''}.`
                : usedPct >= 80
                ? `Essai gratuit : plus que ${quota.orders_remaining} commande${quota.orders_remaining !== 1 ? 's' : ''} sur ${quota.orders_limit}.`
                : `Essai gratuit : se termine dans ${daysLeft} jour${daysLeft !== 1 ? 's' : ''}.`}
            </span>
            <button onClick={() => navigate('/dashboard/abonnement')}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 transition cursor-pointer shrink-0">
              Mettre à niveau
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-8">{children}</main>
      </div>
    </div>
  )
}
