import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Package, CheckCircle2, Truck, Clock, PackageCheck, RotateCcw, XCircle, ExternalLink, LineChart } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import StatCard from '../components/StatCard'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

const STAT_DEFS = [
  { key: 'total',       label: 'Commandes réelles', sub: 'sur total',      color: 'violet', icon: Package },
  { key: 'confirmed',   label: 'Confirmées',        sub: 'confirmées',     color: 'green',  icon: CheckCircle2 },
  { key: 'shipped',     label: 'Expédiées',         sub: 'expédiées',      color: 'blue',   icon: Truck },
  { key: 'pending',     label: 'En attente',        sub: 'en attente',     color: 'orange', icon: Clock },
  { key: 'delivered',   label: 'Livrées',           sub: 'livrées',        color: 'green',  icon: PackageCheck },
  { key: 'returned',    label: 'Retours',           sub: 'retournées',     color: 'red',    icon: RotateCcw },
  { key: 'cancelled',   label: 'Annulées',          sub: 'annulées',       color: 'red',    icon: XCircle },
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quota, setQuota] = useState(null)
  const [stats, setStats] = useState(null)
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    api.get('/stores/me/quota/').then(({ data }) => setQuota(data)).catch(() => {})
    api.get('/orders/stats/').then(({ data }) => setStats(data)).catch(() => {})
    api.get('/orders/?per_page=200').then(({ data }) => {
      const orders = data.results || []
      const days = Array.from({ length: 15 }).map((_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (14 - i))
        return d
      })
      const points = days.map(d => {
        const key = d.toISOString().slice(0, 10)
        const count = orders.filter(o => (o.created_at || '').slice(0, 10) === key).length
        return { date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), commandes: count }
      })
      setChartData(points)
    }).catch(() => {})
  }, [])

  const usedPct = quota ? Math.round((quota.orders_used / quota.orders_limit) * 100) : 0
  const daysLeft = quota ? Math.max(0, Math.ceil((new Date(quota.trial_ends_at) - new Date()) / 86400000)) : 0

  const statValue = (key) => stats ? (key === 'total' ? stats.total : stats[key]?.count ?? 0) : 0

  return (
    <DashboardLayout title="Tableau de bord">
      {/* Welcome */}
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">
            Bonjour, <span className="text-violet-400">{user?.first_name}</span>
          </h2>
          <p className="text-sm mt-1" style={{ color: theme.dark.muted }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <a href={user?.store_slug ? `/store/${user.store_slug}` : '#'} target="_blank" rel="noreferrer"
          className={theme.btn.outline + ' hidden sm:inline-flex text-xs'}>
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
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
              <button onClick={() => navigate('/dashboard/abonnement')} className={theme.btn.primary}>Mettre à niveau</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
        {STAT_DEFS.slice(0, 3).map(s => (
          <StatCard key={s.key} label={s.label} sub={s.sub} color={s.color} icon={s.icon} value={statValue(s.key)} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        {STAT_DEFS.slice(3).map(s => (
          <StatCard key={s.key} label={s.label} sub={s.sub} color={s.color} icon={s.icon} value={statValue(s.key)} />
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-2xl border p-5 sm:p-6"
        style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center gap-2 mb-4">
          <LineChart className="w-4 h-4 text-violet-400" strokeWidth={2} />
          <p className="text-sm font-semibold text-gray-200">Commandes — 15 derniers jours</p>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: theme.dark.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: theme.dark.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: theme.dark.sidebar, border: `1px solid ${theme.dark.border}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: theme.dark.mutedLight }} />
            <Area type="monotone" dataKey="commandes" stroke="#8b5cf6" strokeWidth={2} fill="url(#ordersGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardLayout>
  )
}
