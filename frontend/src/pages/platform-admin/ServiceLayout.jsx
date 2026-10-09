import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { theme } from '../../theme'
import { tt } from '../../i18n'
import { useTranslation } from 'react-i18next'

// Espace « Service de confirmation » (opérateur du service) : boutiques clientes dont on
// gère les commandes avec les confirmateurs de MZSolutions. TOTALEMENT séparé de
// l'administration de la plateforme (/plateforme) : accès distinct (`is_service_admin`).
const LINKS = [
  {
    to: '/platform-admin/boutiques', label: tt('Boutiques'),
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l1.5-5h15L21 9M3 9v10a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1V9M3 9h18" />,
  },
  {
    to: '/platform-admin/confirmateurs', label: tt('Confirmateurs'),
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-8 0" />,
  },
  {
    to: '/platform-admin/en-attente', label: tt('En attente d\'assignation'), badge: 'waiting',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
  },
  {
    to: '/platform-admin/a-traiter', label: tt('À traiter'), badge: 'review',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
  },
  {
    to: '/platform-admin/echecs', label: tt('Échecs'), badge: 'failed',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />,
  },
  {
    to: '/platform-admin/dispatch', label: tt('Algorithmes de dispatch'),
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />,
  },
  {
    to: '/platform-admin/journal', label: tt('Journal d\'audit'),
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  },
]

const navClass = ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-violet-500/10 text-violet-400' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
  }`

export default function ServiceLayout() {
  const { t } = useTranslation('dashboard')
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [counts, setCounts] = useState({})

  // Pastilles « en attente / à traiter / échecs » — rechargées à chaque navigation, pour que
  // le compteur reste juste sans sondage dédié.
  useEffect(() => {
    api.get('/platform-admin/dispatch/counts/')
      .then(({ data }) => { if (data && typeof data === 'object') setCounts(data) })
      .catch(() => {})
  }, [pathname])

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-app)' }}>
      <aside className="w-64 shrink-0 flex flex-col border-e" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: theme.dark.border }}>
          <p className="text-base font-bold text-app-primary">{t('MZSolutions')}</p>
          <p className="text-xs text-violet-400 font-medium mt-0.5">{t('Service de confirmation')}</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={navClass}>
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{l.icon}</svg>
              {l.label}
              {l.badge && counts[l.badge] > 0 && (
                <span className={`ms-auto text-xs font-semibold rounded-full px-2 py-0.5 ${l.badge === 'waiting' ? 'bg-violet-500/20 text-violet-300' : 'bg-red-500/20 text-red-300'}`}>{counts[l.badge]}</span>
              )}
            </NavLink>
          ))}

          {user?.is_platform_confirmateur && (
            <NavLink to="/platform-admin/ma-file" className={navClass}>
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>{t('Ma file de confirmation')}
            </NavLink>
          )}
        </nav>

        <div className="px-3 py-4 border-t" style={{ borderColor: theme.dark.border }}>
          <div className="px-3 mb-2">
            <p className="text-xs text-app-muted truncate">{user?.email}</p>
          </div>
          {/* Un opérateur du service n'a le plus souvent aucune boutique propre — /dashboard
              n'a de sens que si une boutique est déjà résolue côté serveur (mode « Gérer cette boutique »). */}
          {user?.store_slug && (
            <button onClick={() => navigate('/dashboard')} className="w-full text-start px-3 py-2 rounded-lg text-sm text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 transition-colors">{t('Retour au dashboard boutique')}</button>
          )}
          <button onClick={logout} className="w-full text-start px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">{t('Déconnexion')}</button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
