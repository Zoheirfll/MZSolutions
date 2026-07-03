import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

const STATS = [
  { label: 'Commandes réelles', sub: 'sur total',    color: '#a78bfa', glow: '#7c3aed22',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg> },
  { label: 'Confirmées',        sub: 'confirmées',   color: '#34d399', glow: '#05966922',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  { label: 'Expédiées',         sub: 'expédiées',    color: '#38bdf8', glow: '#0891b222',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h1m0 0h7m-7 0v2a1 1 0 002 0v-2m0 0h5m5-8h-3v6h3m-3 2a1 1 0 102 0 1 1 0 00-2 0zm-9 2a1 1 0 102 0 1 1 0 00-2 0z"/></svg> },
  { label: 'En cours',          sub: 'acheminement', color: '#fbbf24', glow: '#d9770622',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  { label: 'Livrées',           sub: 'livrées',      color: '#4ade80', glow: '#16a34a22',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> },
  { label: 'Retours',           sub: 'retournées',   color: '#f87171', glow: '#dc262622',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg> },
  { label: 'Annulées',          sub: 'annulées',     color: '#94a3b8', glow: '#6b728022',
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
]

function StatCard({ label, sub, color, glow, icon }) {
  return (
    <div className="relative rounded-2xl p-5 border overflow-hidden group transition-all duration-300 hover:-translate-y-0.5 cursor-default"
      style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(circle at 20% 50%, ${glow}, transparent 70%)` }} />
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl opacity-70" style={{ background: color }} />

      <div className="relative flex items-start justify-between mb-3">
        <p className="text-xs font-medium" style={{ color: theme.dark.mutedLight }}>{label}</p>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, color }}>
          {icon}
        </span>
      </div>
      <div className="relative flex items-end justify-between">
        <span className="text-4xl font-bold tracking-tight" style={{ color }}>0</span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full mb-1"
          style={{ background: `${color}18`, color }}>
          {sub}
        </span>
      </div>
      <div className="relative mt-4 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full" style={{ background: theme.dark.border }}>
          <div className="h-full w-0 rounded-full" style={{ background: color }} />
        </div>
        <span className="text-[10px]" style={{ color: theme.dark.muted }}>↗ 0%</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [quota, setQuota] = useState(null)

  useEffect(() => {
    api.get('/stores/me/quota/').then(({ data }) => setQuota(data)).catch(() => {})
  }, [])

  const usedPct = quota ? Math.round((quota.orders_used / quota.orders_limit) * 100) : 0
  const daysLeft = quota ? Math.max(0, Math.ceil((new Date(quota.trial_ends_at) - new Date()) / 86400000)) : 0

  return (
    <DashboardLayout title="Tableau de bord">
      {/* Welcome */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-100">
            Bonjour, <span className="text-violet-400">{user?.first_name}</span>
          </h2>
          <p className="text-sm mt-0.5" style={{ color: theme.dark.muted }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <a href={user?.store_slug ? `/store/${user.store_slug}` : '#'} target="_blank" rel="noreferrer"
          className={theme.btn.outline + ' hidden sm:inline-flex text-xs'}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          Voir ma boutique
        </a>
      </div>

      {/* Trial quota banner */}
      {quota && (
        <div className="rounded-2xl p-5 border mb-6 relative overflow-hidden"
          style={{ background: theme.dark.card, borderColor: '#2d1b5e' }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at top left, #7c3aed14, transparent 60%)' }} />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: theme.dark.muted }}>Commandes restantes</p>
                <p className="text-3xl font-bold text-violet-400">{quota.orders_remaining}
                  <span className="text-sm font-normal ml-1" style={{ color: theme.dark.muted }}>/ {quota.orders_limit}</span>
                </p>
              </div>
              <div className="w-px h-10 hidden sm:block" style={{ background: theme.dark.border }} />
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: theme.dark.muted }}>Jours d'essai</p>
                <p className="text-3xl font-bold text-violet-300">{daysLeft}
                  <span className="text-sm font-normal ml-1" style={{ color: theme.dark.muted }}>jours</span>
                </p>
              </div>
              <div className="flex flex-col gap-1.5 min-w-[140px]">
                <div className="flex justify-between text-[10px]" style={{ color: theme.dark.muted }}>
                  <span>Utilisation quota</span><span>{usedPct}%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: theme.dark.border }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${usedPct}%`, background: usedPct > 80 ? '#f87171' : '#7c3aed' }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={quota.is_trial_active ? theme.badge.success : theme.badge.danger}>
                <span className={`w-1.5 h-1.5 rounded-full ${quota.is_trial_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {quota.is_trial_active ? 'Essai actif' : 'Expiré'}
              </span>
              <button className={theme.btn.primary}>Mettre à niveau</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {STATS.slice(0, 3).map(s => <StatCard key={s.label} {...s} />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATS.slice(3).map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Chart placeholder */}
      <div className="rounded-2xl border p-8 flex items-center justify-center"
        style={{ background: theme.dark.card, borderColor: theme.dark.border, minHeight: 200 }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: '#7c3aed18', border: `1px solid #7c3aed30` }}>
            <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 15l4-4 3 3 5-6" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm font-medium">Graphiques disponibles prochainement</p>
          <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>Livraisons · Revenus · Confirmation · KPI</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
