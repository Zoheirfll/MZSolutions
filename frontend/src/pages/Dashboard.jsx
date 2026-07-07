import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Package, CheckCircle2, Truck, Clock, PackageCheck, RotateCcw, XCircle, ExternalLink, LineChart, TrendingUp, MapPin, Share2 } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import StatCard from '../components/StatCard'
import AlgeriaMap from '../components/AlgeriaMap'
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

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl p-5 border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className={`h-3 w-20 rounded mb-4 ${theme.skeleton}`} />
      <div className={`h-9 w-16 rounded ${theme.skeleton}`} />
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quota, setQuota] = useState(null)
  const [stats, setStats] = useState(null)
  const [globalStats, setGlobalStats] = useState(null)
  const [wilayaStats, setWilayaStats] = useState(null)
  const [sourceStats, setSourceStats] = useState(null)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get('/stores/me/quota/').then(({ data }) => setQuota(data)).catch(() => {})

    // Accessible à tous les rôles (pas de permission stats_view requise) — une erreur ici est
    // un vrai incident réseau/serveur, donc affiche le bandeau d'erreur.
    api.get('/orders/stats/').then(({ data }) => setStats(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    // Ces deux endpoints (Epic 8.1) exigent la permission `stats_view` — absente par défaut pour
    // confirmateur/dropshipper. Un 403 ici est un cas attendu (pas d'accès), pas une erreur serveur :
    // catch séparé, silencieux, qui laisse simplement ces sections masquées plutôt que de déclencher
    // le bandeau d'erreur global.
    api.get('/orders/stats/global/?period=month').then(({ data }) => setGlobalStats(data)).catch(() => {})
    api.get('/orders/stats/wilayas/?period=month').then(({ data }) => setWilayaStats(data.results || [])).catch(() => {})
    api.get('/orders/stats/sources/?period=month').then(({ data }) => setSourceStats(data.results || [])).catch(() => {})
    api.get('/orders/stats/orders/?period=custom&date_from=' +
      new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10) +
      '&date_to=' + new Date().toISOString().slice(0, 10))
      .then(({ data }) => setChartData((data.daily || []).map(d => ({
        date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        commandes: d.count,
      }))))
      .catch(() => {
        // Repli pour les rôles sans permission `stats_view` (confirmateur/dropshipper par défaut) :
        // reconstitue la même tendance 15 jours à partir de leurs commandes visibles, pour ne pas
        // les priver du graphique.
        api.get('/orders/?per_page=200').then(({ data }) => {
          const orders = data.results || []
          const days = Array.from({ length: 15 }).map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (14 - i)); return d
          })
          setChartData(days.map(d => {
            const key = d.toISOString().slice(0, 10)
            const count = orders.filter(o => (o.created_at || '').slice(0, 10) === key).length
            return { date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), commandes: count }
          }))
        }).catch(() => {})
      })
  }, [])

  const usedPct = quota ? Math.round((quota.orders_used / quota.orders_limit) * 100) : 0
  const daysLeft = quota ? Math.max(0, Math.ceil((new Date(quota.trial_ends_at) - new Date()) / 86400000)) : 0

  const statValue = (key) => stats ? (key === 'total' ? stats.total : stats[key]?.count ?? 0) : 0
  const returnRate = globalStats?.total_orders
    ? Math.round((globalStats.returned_count / globalStats.total_orders) * 1000) / 10
    : 0

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
          className={theme.btn.outline + ' inline-flex text-xs w-9 h-9 sm:w-auto justify-center sm:justify-start px-0 sm:px-3.5'}
          aria-label="Voir ma boutique">
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">Voir ma boutique</span>
        </a>
      </div>

      {error && (
        <div className="rounded-xl border px-4 py-3 mb-6 text-sm" style={{ background: '#3b0f0f', borderColor: '#7f1d1d', color: '#fca5a5' }}>
          Impossible de charger certaines statistiques. Réessayez en rechargeant la page.
        </div>
      )}

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
                <div className="h-1.5 rounded-full" style={{ background: theme.dark.border }}
                  role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100}
                  aria-label="Utilisation du quota de commandes">
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

      {/* KPIs clés — taux de confirmation + taux de retour, mis en avant avant le détail par statut.
          Masqués si l'utilisateur (confirmateur/dropshipper sans permission stats_view) n'y a pas accès.
          Le chiffre d'affaires n'est volontairement pas affiché ici — donnée sensible, pas destinée à tous les rôles. */}
      {(loading || globalStats) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          {loading ? (
            <><StatCardSkeleton /><StatCardSkeleton /></>
          ) : (
            <>
              <StatCard label="Taux de confirmation" sub="30 derniers jours" color="green" icon={TrendingUp}
                ring={globalStats.confirmation_rate} value={`${globalStats.delivered_count} livrées`} />
              <StatCard label="Taux de retour" sub="30 derniers jours" color="red" icon={RotateCcw}
                ring={returnRate} value={`${globalStats.returned_count} retours`} />
            </>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="rounded-2xl border p-5 sm:p-6 mb-7"
        style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center gap-2 mb-4">
          <LineChart className="w-4 h-4 text-violet-400" strokeWidth={2} />
          <p className="text-sm font-semibold text-gray-200">Commandes — 15 derniers jours</p>
        </div>
        {loading ? (
          <div className={`h-60 rounded-lg ${theme.skeleton}`} />
        ) : (
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
        )}
      </div>

      {/* Top wilayas + sources — masqués si non chargés (403 stats_view ou aucune donnée) */}
      {(wilayaStats?.length > 0 || sourceStats?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-7">
          {wilayaStats?.length > 0 && (
            <div className="rounded-2xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-violet-400" strokeWidth={2} />
                <p className="text-sm font-semibold text-gray-200">Commandes par wilaya — 30 derniers jours</p>
              </div>
              <AlgeriaMap data={wilayaStats} />
              <div className="mt-4 space-y-1.5">
                {wilayaStats.slice(0, 3).map(w => (
                  <div key={w.wilaya} className="flex justify-between text-xs">
                    <span className="text-gray-300">{w.wilaya}</span>
                    <span style={{ color: theme.dark.muted }}>{w.orders_count} commande{w.orders_count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sourceStats?.length > 0 && (
            <div className="rounded-2xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <div className="flex items-center gap-2 mb-4">
                <Share2 className="w-4 h-4 text-violet-400" strokeWidth={2} />
                <p className="text-sm font-semibold text-gray-200">Par source de vente — 30 derniers jours</p>
              </div>
              <div className="space-y-2.5">
                {sourceStats.map(s => (
                  <div key={s.source} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: theme.dark.sidebar }}>
                    <span className="text-sm text-gray-300 truncate pr-2">{s.source}</span>
                    <div className="flex items-center gap-4 text-xs shrink-0" style={{ color: theme.dark.muted }}>
                      <span>{s.orders_count} cmd</span>
                      <span className="text-emerald-400">{s.confirmed_count} conf.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Détail par statut */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
        {loading ? [...Array(3)].map((_, i) => <StatCardSkeleton key={i} />) : STAT_DEFS.slice(0, 3).map(s => (
          <StatCard key={s.key} label={s.label} sub={s.sub} color={s.color} icon={s.icon} value={statValue(s.key)} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {loading ? [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />) : STAT_DEFS.slice(3).map(s => (
          <StatCard key={s.key} label={s.label} sub={s.sub} color={s.color} icon={s.icon} value={statValue(s.key)} />
        ))}
      </div>
    </DashboardLayout>
  )
}
