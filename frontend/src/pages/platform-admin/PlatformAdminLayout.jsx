import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { theme } from '../../theme'

const LINKS = [
  { to: '/platform-admin/boutiques',      label: 'Boutiques' },
  { to: '/platform-admin/confirmateurs',  label: 'Confirmateurs' },
]

export default function PlatformAdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-8">
          <p className="text-lg font-bold text-app-primary">MZSolutions <span className="text-violet-500">· Superadmin</span></p>
          <nav className="flex items-center gap-1">
            {LINKS.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-violet-500/10 text-violet-400' : 'text-app-muted-light hover:text-app-primary'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-app-muted">{user?.email}</span>
          <button onClick={logout} className={theme.btn.ghost}>Déconnexion</button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
