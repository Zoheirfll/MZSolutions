import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useTranslation } from 'react-i18next'
import { tt } from '../../i18n'

const ICON = {
  overview: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  stores: 'M3 9l1.5-5h15L21 9M3 9v10a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1V9M3 9h18',
  team: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-8 0',
  plugs: 'M13 10V3L4 14h7v7l9-11h-7z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  megaphone: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
  health: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  payments: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  plans: 'M4 6h16M4 10h16M4 14h10M4 18h6',
  accounts: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  audit: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
}

// Groupes du menu — `superOnly` : lien visible uniquement pour un superadmin
// (le contrôle réel reste côté serveur, le front masque seulement).
const GROUPS = [
  { group: 'Principal', items: [{ to: '/platform-admin/apercu', label: tt('Vue d’ensemble'), icon: ICON.overview, badge: true }] },
  { group: 'Boutiques', items: [
    { to: '/platform-admin/boutiques', label: tt('Boutiques'), icon: ICON.stores },
    { to: '/platform-admin/comptes', label: tt('Comptes'), icon: ICON.accounts },
    { to: '/platform-admin/integrations', label: tt('Intégrations'), icon: ICON.plugs },
    { to: '/platform-admin/confirmateurs', label: tt('Confirmateurs'), icon: ICON.team, superOnly: true },
  ] },
  { group: tt('Communication'), items: [
    { to: '/platform-admin/messages', label: tt('Messages'), icon: ICON.mail },
    { to: '/platform-admin/annonces', label: tt('Annonces'), icon: ICON.megaphone, superOnly: true },
  ] },
  { group: tt('Finances'), items: [
    { to: '/platform-admin/paiements', label: tt('Paiements'), icon: ICON.payments },
    { to: '/platform-admin/paliers', label: tt('Paliers'), icon: ICON.plans, superOnly: true },
  ] },
  { group: tt('Système'), items: [
    { to: '/platform-admin/systeme', label: tt('Santé et erreurs'), icon: ICON.health },
    { to: '/platform-admin/reglages', label: tt('Réglages'), icon: ICON.settings, superOnly: true },
    { to: '/platform-admin/administrateurs', label: tt('Administrateurs'), icon: ICON.shield, superOnly: true },
    { to: '/platform-admin/journal', label: tt('Journal d\'audit'), icon: ICON.audit },
  ] },
]

const navClass = ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-violet-500/10 text-violet-400' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
  }`

function alertsTotal(overview) {
  const a = overview?.alerts
  if (!a) return 0
  return (a.trials_expiring?.count || 0) + (a.quota_high?.count || 0) + (a.payments_stuck?.count || 0) + (a.open_errors?.count || 0) + (a.unread_messages?.count || 0)
}

export default function PlatformAdminLayout() {
  const { t } = useTranslation('dashboard')
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [overview, setOverview] = useState(null)
  const isSuper = user?.platform_level === 'superadmin'

  // Badges rechargés à chaque navigation (jamais figés jusqu'au F5) ; une erreur
  // réseau est silencieuse — le menu reste utilisable sans badge.
  useEffect(() => {
    setDrawer(false)
    let alive = true
    api.get('/platform-admin/overview/').then(({ data }) => { if (alive) setOverview(data) }).catch(() => {})
    return () => { alive = false }
  }, [location.pathname])

  const badge = alertsTotal(overview)

  const sidebar = (
    <>
      <div className="px-5 py-5 border-b" style={{ borderColor: theme.dark.border }}>
        <p className="text-base font-bold text-app-primary">{t('MZSolutions')}</p>
        <p className="text-xs text-violet-400 font-medium mt-0.5">{isSuper ? t('Espace Superadmin') : t('Espace Admin')}</p>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-4 overflow-y-auto">
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => !i.superOnly || isSuper)
          if (items.length === 0) return null
          return (
            <div key={g.group} className="flex flex-col gap-1">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-app-muted">{t(g.group)}</p>
              {items.map((l) => (
                <NavLink key={l.to} to={l.to} className={navClass}>
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={l.icon} />
                  </svg>
                  <span className="flex-1">{t(l.label)}</span>
                  {l.badge && badge > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">{badge}</span>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}

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
        {/* Un admin "pur" n'a aucune boutique propre — /dashboard planterait
            silencieusement tant qu'il n'a pas activé le mode "Gérer cette
            boutique" (impersonation). Le lien n'a donc de sens que si une
            vraie boutique est déjà résolue côté serveur. */}
        {user?.store_slug && (
          <button onClick={() => navigate('/dashboard')} className="w-full text-start px-3 py-2 rounded-lg text-sm text-app-muted-light hover:text-app-primary hover:bg-violet-500/5 transition-colors">{t('Retour au dashboard boutique')}</button>
        )}
        <button onClick={logout} className="w-full text-start px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">{t('Déconnexion')}</button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-app)' }}>
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-e"
        style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
        {sidebar}
      </aside>

      {drawer && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <aside className="w-64 flex flex-col border-e" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
            {sidebar}
          </aside>
          <button aria-label={t('Fermer le menu')} className="flex-1 bg-black/50" onClick={() => setDrawer(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: theme.dark.border, background: theme.dark.sidebar }}>
          <button aria-label={t('Ouvrir le menu')} onClick={() => setDrawer(true)} className={theme.btn.icon}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="text-sm font-semibold text-app-primary">{t('MZSolutions')}</span>
          {badge > 0 ? <span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-label={t('Alertes')} /> : <span className="w-2.5 h-2.5" />}
        </div>
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet context={{ overview }} />
        </main>
      </div>
    </div>
  )
}
