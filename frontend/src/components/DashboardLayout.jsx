import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme'

const NAV_ALL = [
  {
    section: 'E-COMMERCE',
    items: [
      { label: 'Tableau de bord',      to: '/dashboard',              icon: '▦',  exact: true },
      { label: 'Commandes',            to: '/dashboard/commandes',    icon: '📦', disabled: true },
      { label: 'Produits & Catégories',to: '/dashboard/produits',     icon: '🛍️' },
      { label: 'Clients',              to: '/dashboard/clients',      icon: '👥', disabled: true },
      { label: 'Expéditions',          to: '/dashboard/expeditions',  icon: '🚚', disabled: true },
      { label: 'Statistiques',         to: '/dashboard/stats',        icon: '📊', disabled: true, hideFor: ['confirmateur','dropshipper'] },
    ],
  },
  {
    section: 'PARAMÈTRES',
    items: [
      { label: 'Ma boutique',  to: '/dashboard/boutique',    icon: '🏪' },
      { label: 'Équipe',       to: '/dashboard/equipe',      icon: '👤', hideFor: ['confirmateur','dropshipper'] },
      { label: 'Abonnement',   to: '/dashboard/abonnement',  icon: '⭐', disabled: true, hideFor: ['confirmateur','dropshipper'] },
    ],
  },
]

export default function DashboardLayout({ children, title }) {
  const { user, logout } = useAuth()
  const teamRole = user?.team_role || null
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/auth')
  }

  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: theme.dark.app }}>

      {/* ── Sidebar ── */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col border-r overflow-y-auto"
        style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b" style={{ borderColor: theme.dark.border }}>
          <span className="text-lg font-bold text-violet-400 tracking-tight">MZSolutions</span>
          <p className="text-xs mt-0.5 truncate" style={{ color: theme.dark.muted }}>
            {user?.store_name ?? user?.email}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-6">
          {NAV_ALL.map(({ section, items }) => (
            <div key={section}>
              <p className="text-[10px] font-semibold px-2 mb-2 tracking-widest" style={{ color: theme.dark.muted }}>
                {section}
              </p>
              <ul className="space-y-0.5">
                {items.filter(({ hideFor }) => !hideFor || !hideFor.includes(teamRole)).map(({ label, to, icon, disabled, exact }) =>
                  disabled ? (
                    <li key={label}>
                      <span className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-not-allowed opacity-40 text-gray-400">
                        <span>{icon}</span>{label}
                      </span>
                    </li>
                  ) : (
                    <li key={label}>
                      <NavLink
                        to={to}
                        end={exact}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ` +
                          (isActive
                            ? 'bg-violet-600/20 text-violet-300 font-medium'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')
                        }
                      >
                        <span>{icon}</span>{label}
                      </NavLink>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </nav>

        {/* User bottom */}
        <div className="px-4 py-4 border-t" style={{ borderColor: theme.dark.border }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-700 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-300 font-medium truncate">{user?.first_name} {user?.last_name}</p>
              <p className="text-xs truncate" style={{ color: theme.dark.muted }}>{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-xs py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition"
          >
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header
          className="flex items-center justify-between px-6 py-3.5 border-b flex-shrink-0"
          style={{ background: theme.dark.app, borderColor: theme.dark.border }}
        >
          <h1 className="text-base font-semibold text-gray-200">{title}</h1>
          <div className="flex items-center gap-3">
            <a
              href={`https://${user?.store_slug ?? '#'}.mzsolutions.app`}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border text-violet-300 hover:bg-violet-600/10 transition"
              style={{ borderColor: '#4c3d8a' }}
            >
              Voir ma boutique ↗
            </a>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
