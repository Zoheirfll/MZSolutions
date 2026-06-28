import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

const STATS = [
  { label: 'Commandes réelles', sub: 'Réelles / Total', color: '#7c3aed' },
  { label: 'Confirmé',          sub: 'Confirmées',       color: '#059669' },
  { label: 'Expédié',           sub: 'Expédiées',        color: '#0891b2' },
  { label: 'En cours',          sub: 'Acheminement',     color: '#d97706' },
  { label: 'Livré',             sub: 'Livrées',          color: '#16a34a' },
  { label: 'Retour',            sub: 'Retournées',       color: '#dc2626' },
  { label: 'Annulé',            sub: 'Annulées',         color: '#6b7280' },
]

function StatCard({ label, sub, color }) {
  return (
    <div
      className="rounded-xl p-5 border flex flex-col gap-3"
      style={{ background: theme.dark.card, borderColor: theme.dark.border }}
    >
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold" style={{ color }}>0</span>
        <span className="text-xs text-gray-500 mb-1">{sub}</span>
      </div>
      <div className="w-full h-1 rounded-full bg-white/5">
        <div className="h-full w-0 rounded-full" style={{ background: color }} />
      </div>
      <p className="text-xs text-gray-600">↗ 0 %</p>
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

  return (
    <DashboardLayout title="Tableau de bord">
      {/* Welcome */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-100">Bonjour, {user?.first_name} 👋</h2>
        <p className="text-sm mt-1" style={{ color: theme.dark.muted }}>
          Bienvenue sur votre espace vendeur MZSolutions.
        </p>
      </div>

      {/* Trial quota banner */}
      {quota && (
        <div
          className="rounded-xl p-4 border mb-6 flex items-center justify-between"
          style={{ background: theme.dark.card, borderColor: '#3d2d6e' }}
        >
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Commandes restantes</p>
              <p className="text-2xl font-bold text-violet-400">{quota.orders_remaining}</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <p className="text-xs text-gray-400 mb-1">Jours restants</p>
              <p className="text-2xl font-bold text-violet-300">
                {Math.max(0, Math.ceil((new Date(quota.trial_ends_at) - new Date()) / 86400000))}
              </p>
            </div>
            <div className="w-32 h-1.5 rounded-full bg-white/10 ml-4">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${quota.is_trial_active ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
              {quota.is_trial_active ? '● Essai actif' : '● Expiré'}
            </span>
            <button className="text-xs px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition">
              Mettre à niveau
            </button>
          </div>
        </div>
      )}

      {/* Stats grid — row 1 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {STATS.slice(0, 3).map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Stats grid — row 2 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {STATS.slice(3).map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Chart placeholder */}
      <div
        className="rounded-xl border p-8 flex items-center justify-center"
        style={{ background: theme.dark.card, borderColor: theme.dark.border, minHeight: 200 }}
      >
        <div className="text-center">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-gray-400 text-sm font-medium">Graphiques disponibles au Sprint 4</p>
          <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>Livraisons · Revenus · Confirmation · KPI</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
