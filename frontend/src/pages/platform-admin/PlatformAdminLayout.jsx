import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { theme } from '../../theme'

const LINKS = [
  {
    to: '/platform-admin/boutiques', label: 'Boutiques',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l1.5-5h15L21 9M3 9v10a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1V9M3 9h18" />,
  },
  {
    to: '/platform-admin/confirmateurs', label: 'Confirmateurs',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-8 0" />,
  },
  {
    to: '/platform-admin/journal', label: "Journal d'audit",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  },
]

export default function PlatformAdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-app)' }}>
      <aside
        className="w-64 shrink-0 flex flex-col border-r"
        style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}
      >
        <div className="px-5 py-5 border-b" style={{ borderColor: theme.dark.border }}>
          <p className="text-base font-bold text-app-primary">MZSolutions</p>
          <p className="text-xs text-violet-400 font-medium mt-0.5">Espace Superadmin</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {LINKS.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-violet-500/10 text-violet-400' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                }`
              }
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{l.icon}</svg>
              {l.label}
            </NavLink>
          ))}

          {user?.is_platform_confirmateur && (
            <NavLink
              to="/platform-admin/ma-file"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-1 border-t pt-3 ${
                  isActive ? 'bg-violet-500/10 text-violet-400' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                }`
              }
              style={{ borderColor: theme.dark.border }}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Ma file de confirmation
            </NavLink>
          )}
        </nav>

        <div className="px-3 py-4 border-t" style={{ borderColor: theme.dark.border }}>
          <div className="px-3 mb-2">
            <p className="text-xs text-app-muted truncate">{user?.email}</p>
          </div>
          {/* Un superadmin "pur" n'a aucune boutique propre (comme
              admin_mz@gmail.com) — /dashboard planterait silencieusement
              (403 avalé sur chaque appel) tant qu'il n'a pas d'abord activé
              le mode "Gérer cette boutique" (impersonation, voir
              PlatformAdminStoresPage). Le lien n'a donc de sens que si une
              vraie boutique est déjà résolue côté serveur. */}
          {user?.store_slug && (
            <button onClick={() => navigate('/dashboard')} className="w-full text-left px-3 py-2 rounded-lg text-sm text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 transition-colors">
              Retour au dashboard boutique
            </button>
          )}
          <button onClick={logout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
