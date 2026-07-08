import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import Logo from './Logo'
import { theme } from '../theme'
import { useTheme } from '../hooks/useTheme'

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

export default function DashboardLayout({ children, title }) {
  const { user, logout } = useAuth()
  const { theme: currentTheme, toggleTheme } = useTheme()
  const teamRole = user?.team_role || null
  const can = key => !!user?.permissions?.[key]
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded]         = useState({
    produits:     location.pathname.startsWith('/dashboard/produits'),
    fournisseurs: location.pathname.startsWith('/dashboard/produits/fournisseurs'),
    commandes:    location.pathname.startsWith('/dashboard/commandes'),
    annulation:   location.pathname.startsWith('/dashboard/commandes/annulations'),
    clients:      location.pathname.startsWith('/dashboard/clients'),
    finances:     location.pathname.startsWith('/dashboard/finances'),
    stats:        location.pathname.startsWith('/dashboard/stats'),
  })
  const [lowStockCount, setLowStockCount] = useState(0)
  const [openComplaintsCount, setOpenComplaintsCount] = useState(0)
  const [openExchangesCount, setOpenExchangesCount] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [quota, setQuota] = useState(null)

  useEffect(() => {
    api.get('/products/low-stock/').then(({ data }) => setLowStockCount(data.count)).catch(() => {})
    api.get('/orders/complaints/?status=open&per_page=1').then(({ data }) => setOpenComplaintsCount(data.count)).catch(() => {})
    api.get('/orders/exchanges/?status=open&per_page=1').then(({ data }) => setOpenExchangesCount(data.count)).catch(() => {})
    api.get('/stores/me/quota/').then(({ data }) => setQuota(data)).catch(() => {})
  }, [])

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
        'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors duration-150 ' +
        (isActive
          ? 'bg-white/6 text-app-primary font-medium'
          : 'text-app-muted hover:text-app-primary hover:bg-white/4')
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
        'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ' +
        (isActive
          ? 'bg-white/6 text-app-primary font-medium'
          : 'text-app-muted hover:text-app-primary hover:bg-white/4')
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
    <span className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-not-allowed opacity-40 text-gray-400">
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
            className="lg:hidden shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-app-primary hover:bg-white/5 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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

              {/* Commandes — expandable */}
              <li>
                <button
                  onClick={() => setExpanded(e => ({ ...e, commandes: !e.commandes }))}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    location.pathname.startsWith('/dashboard/commandes') ? 'bg-white/6 text-app-primary font-medium' : 'text-gray-400 hover:text-app-primary hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.orders}</span>Commandes</span>
                  <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.commandes ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
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
                        <li>{link('/dashboard/commandes/raisons-echec', "Raisons d'échec")}</li>
                        {/* Annulation — expandable */}
                        <li>
                          <button
                            onClick={() => setExpanded(e => ({ ...e, annulation: !e.annulation }))}
                            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 text-gray-400 hover:text-app-primary hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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

              {can('complaints_view') && <li>{mainLink('/dashboard/reclamations', ICONS.complaints, 'Réclamations', false, openComplaintsCount)}</li>}
              {can('exchanges_view') && <li>{mainLink('/dashboard/echanges', ICONS.exchange, 'Échanges', false, openExchangesCount)}</li>}

              {/* Produits & Catégories */}
              {can('products_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, produits: !e.produits }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      prodActive ? 'bg-white/6 text-app-primary font-medium' : 'text-gray-400 hover:text-app-primary hover:bg-white/5'
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
                          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 text-gray-400 hover:text-app-primary hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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
                      location.pathname.startsWith('/dashboard/clients') ? 'bg-white/6 text-app-primary font-medium' : 'text-gray-400 hover:text-app-primary hover:bg-white/5'
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
                      location.pathname.startsWith('/dashboard/finances') ? 'bg-white/6 text-app-primary font-medium' : 'text-gray-400 hover:text-app-primary hover:bg-white/5'
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
              {can('shipping_settings_view') && <li>{disabled(ICONS.shipping, 'Expéditions')}</li>}
              {can('stock_view') && <li>{mainLink('/dashboard/stock', ICONS.stock, 'Stock & Inventaire', false, lowStockCount)}</li>}
              {can('stats_view') && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, stats: !e.stats }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      location.pathname.startsWith('/dashboard/stats') ? 'bg-white/6 text-app-primary font-medium' : 'text-gray-400 hover:text-app-primary hover:bg-white/5'
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
              className="lg:hidden shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-app-primary hover:bg-white/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              {ICONS.menu}
            </button>
            <h1 className="text-base sm:text-lg font-semibold text-app-primary truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Cloche stock bas */}
            <button
              onClick={() => navigate('/dashboard/stock')}
              className="relative w-9 h-9 rounded-lg border flex items-center justify-center text-gray-400 hover:text-app-primary hover:bg-white/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              style={{ borderColor: theme.dark.border }}
            >
              {ICONS.bell}
              {lowStockCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-bold">
                  {lowStockCount > 9 ? '9+' : lowStockCount}
                </span>
              )}
            </button>
            {/* Réservé aux pages déjà converties au bi-thème (Dashboard, Équipe) — les ~45
                autres pages du dashboard consomment encore des couleurs Tailwind codées en
                dur (text-gray-*) qui ne suivent pas data-theme, donc y afficher le toggle
                casserait la lisibilité en mode clair. Retirer cette garde au fur et à mesure
                que le reste du dashboard est converti (voir CLAUDE.md, section Thème). */}
            {(location.pathname === '/dashboard' || location.pathname === '/dashboard/equipe') && (
              <button
                onClick={toggleTheme}
                data-testid="theme-toggle"
                aria-label={currentTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
                className="w-9 h-9 rounded-lg border-app flex items-center justify-center text-app-muted hover:text-app-primary hover:bg-white/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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
            )}
            <a
              href={user?.store_slug ? `/store/${user.store_slug}` : '#'}
              target="_blank" rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-white/12 text-violet-300 hover:bg-white/5 hover:border-white/20 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Voir ma boutique
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </header>
        {showQuotaAlert && (!teamRole || teamRole === 'admin') && (
          <div className="flex items-center justify-between gap-3 px-5 sm:px-8 py-2.5 text-sm shrink-0"
            style={{ background: '#3b0f0f', borderBottom: '1px solid #7f1d1d' }}>
            <span className="text-red-200">
              {usedPct >= 80 && daysLeft !== null && daysLeft <= 3
                ? `Essai gratuit : ${quota.orders_remaining} commande${quota.orders_remaining !== 1 ? 's' : ''} restante${quota.orders_remaining !== 1 ? 's' : ''}, se termine dans ${daysLeft} jour${daysLeft !== 1 ? 's' : ''}.`
                : usedPct >= 80
                ? `Essai gratuit : plus que ${quota.orders_remaining} commande${quota.orders_remaining !== 1 ? 's' : ''} sur ${quota.orders_limit}.`
                : `Essai gratuit : se termine dans ${daysLeft} jour${daysLeft !== 1 ? 's' : ''}.`}
            </span>
            <button onClick={() => navigate('/dashboard/abonnement')}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-white text-red-900 hover:bg-red-100 transition cursor-pointer shrink-0">
              Mettre à niveau
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-8">{children}</main>
      </div>
    </div>
  )
}
