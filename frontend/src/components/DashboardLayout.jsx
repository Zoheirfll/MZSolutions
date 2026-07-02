import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

export default function DashboardLayout({ children, title }) {
  const { user, logout } = useAuth()
  const teamRole = user?.team_role || null
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded]         = useState({
    produits:     location.pathname.startsWith('/dashboard/produits'),
    fournisseurs: location.pathname.startsWith('/dashboard/produits/fournisseurs'),
    commandes:    location.pathname.startsWith('/dashboard/commandes'),
    annulation:   location.pathname.startsWith('/dashboard/commandes/annulations'),
  })
  const [lowStockCount, setLowStockCount] = useState(0)

  useEffect(() => {
    api.get('/products/low-stock/').then(({ data }) => setLowStockCount(data.count)).catch(() => {})
  }, [])

  const handleLogout = () => { logout(); navigate('/auth') }
  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase()

  const link = (to, label, exact = false) => (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ' +
        (isActive ? 'bg-violet-600/20 text-violet-300 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')
      }
    >
      {label}
    </NavLink>
  )

  const mainLink = (to, icon, label, exact = false, badge = null) => (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ' +
        (isActive ? 'bg-violet-600/20 text-violet-300 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')
      }
    >
      <span>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  )

  const disabled = (icon, label) => (
    <span className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-not-allowed opacity-40 text-gray-400">
      <span>{icon}</span>{label}
    </span>
  )

  const prodActive = location.pathname.startsWith('/dashboard/produits')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: theme.dark.app }}>

      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 flex flex-col border-r overflow-y-auto"
        style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>

        {/* Logo */}
        <div className="px-5 py-5 border-b" style={{ borderColor: theme.dark.border }}>
          <span className="text-lg font-bold text-violet-400 tracking-tight">MZSolutions</span>
          <p className="text-xs mt-0.5 truncate" style={{ color: theme.dark.muted }}>
            {user?.store_name ?? user?.email}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-5">

          {/* E-COMMERCE */}
          <div>
            <p className="text-[10px] font-semibold px-2 mb-2 tracking-widest" style={{ color: theme.dark.muted }}>E-COMMERCE</p>
            <ul className="space-y-0.5">
              <li>{mainLink('/dashboard', '▦', 'Tableau de bord', true)}</li>

              {/* Commandes — expandable */}
              <li>
                <button
                  onClick={() => setExpanded(e => ({ ...e, commandes: !e.commandes }))}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    location.pathname.startsWith('/dashboard/commandes') ? 'bg-violet-600/20 text-violet-300 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5"><span>📦</span>Commandes</span>
                  <span className="text-xs">{expanded.commandes ? '▾' : '▸'}</span>
                </button>
                {expanded.commandes && (
                  <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                    <li>{link('/dashboard/commandes', 'Toutes les commandes', true)}</li>
                    {teamRole === 'confirmateur' ? null : (
                      <>
                        <li><span className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-not-allowed opacity-40 text-gray-400">Commandes programmées</span></li>
                        <li>{link('/dashboard/commandes/nouvelle', 'Nouvelle commande')}</li>
                        <li>{link('/dashboard/commandes/taux-confirmation', 'Taux de confirmation')}</li>
                        <li><span className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-not-allowed opacity-40 text-gray-400">Paniers abandonnés</span></li>
                        <li>{link('/dashboard/commandes/raisons-echec', "Raisons d'échec")}</li>
                        {/* Annulation — expandable */}
                        <li>
                          <button
                            onClick={() => setExpanded(e => ({ ...e, annulation: !e.annulation }))}
                            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors text-gray-400 hover:text-gray-200 hover:bg-white/5"
                          >
                            <span>Annulation</span>
                            <span className="text-xs">{expanded.annulation ? '▾' : '▸'}</span>
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

              {/* Produits & Catégories — masqué pour confirmateur */}
              {teamRole !== 'confirmateur' && (
                <li>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, produits: !e.produits }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      prodActive ? 'bg-violet-600/20 text-violet-300 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><span>🛍️</span>Produits & Catégories</span>
                    <span className="text-xs">{expanded.produits ? '▾' : '▸'}</span>
                  </button>
                  {expanded.produits && (
                    <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                      <li>{link('/dashboard/produits', 'Tous les produits', true)}</li>
                      <li>{link('/dashboard/produits/nouveau', 'Ajouter produit')}</li>
                      <li>{link('/dashboard/produits/categories', 'Catégories')}</li>
                      <li>
                        <button
                          onClick={() => setExpanded(e => ({ ...e, fournisseurs: !e.fournisseurs }))}
                          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors text-gray-400 hover:text-gray-200 hover:bg-white/5"
                        >
                          <span>Fournisseur</span>
                          <span className="text-xs">{expanded.fournisseurs ? '▾' : '▸'}</span>
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
                    </ul>
                  )}
                </li>
              )}

              {teamRole !== 'confirmateur' && <li>{disabled('👥', 'Clients')}</li>}
              {teamRole !== 'confirmateur' && <li>{disabled('🚚', 'Expéditions')}</li>}
              {teamRole !== 'confirmateur' && <li>{mainLink('/dashboard/stock', '📉', 'Stock & Inventaire', false, lowStockCount)}</li>}
              {!['confirmateur', 'dropshipper'].includes(teamRole) && (
                <li>{disabled('📊', 'Statistiques')}</li>
              )}
            </ul>
          </div>

          {/* PARAMÈTRES */}
          {teamRole !== 'confirmateur' && (
            <div>
              <p className="text-[10px] font-semibold px-2 mb-2 tracking-widest" style={{ color: theme.dark.muted }}>PARAMÈTRES</p>
              <ul className="space-y-0.5">
                <li>{mainLink('/dashboard/boutique', '🏪', 'Ma boutique')}</li>
                {!['confirmateur', 'dropshipper'].includes(teamRole) && (
                  <li>{mainLink('/dashboard/equipe', '👤', 'Équipe')}</li>
                )}
                {!['confirmateur', 'dropshipper'].includes(teamRole) && (
                  <li>{disabled('⭐', 'Abonnement')}</li>
                )}
              </ul>
            </div>
          )}
        </nav>

        {/* User bottom */}
        <div className="px-4 py-4 border-t" style={{ borderColor: theme.dark.border }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-300 font-medium truncate">{user?.first_name} {user?.last_name}</p>
              <p className="text-xs truncate" style={{ color: theme.dark.muted }}>{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-3 w-full text-xs py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition">
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3.5 border-b shrink-0"
          style={{ background: theme.dark.app, borderColor: theme.dark.border }}>
          <h1 className="text-base font-semibold text-gray-200">{title}</h1>
          <div className="flex items-center gap-3">
            {/* Cloche stock bas */}
            <button
              onClick={() => navigate('/dashboard/stock')}
              className="relative w-9 h-9 rounded-lg border flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-white/5 transition"
              style={{ borderColor: theme.dark.border }}
            >
              🔔
              {lowStockCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-bold">
                  {lowStockCount > 9 ? '9+' : lowStockCount}
                </span>
              )}
            </button>
            <a
              href={user?.store_slug ? `/store/${user.store_slug}` : '#'}
              target="_blank" rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border text-violet-300 hover:bg-violet-600/10 transition"
              style={{ borderColor: '#4c3d8a' }}
            >
              Voir ma boutique ↗
            </a>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
