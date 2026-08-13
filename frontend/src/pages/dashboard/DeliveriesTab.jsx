import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import StatCard from '../../components/StatCard'
import AlgeriaMap from '../../components/AlgeriaMap'
import { Spinner } from '../orders/stats/statsShared'
import api from '../../api/axios'
import { theme } from '../../theme'

const SERIES = [
  { key: 'total',     label: 'Toutes',     color: '#60a5fa' },
  { key: 'real',      label: 'Réelles',    color: '#22c55e' },
  { key: 'confirmed', label: 'Confirmées', color: '#a855f7' },
  { key: 'shipped',   label: 'Expédiées',  color: '#eab308' },
  { key: 'delivered', label: 'Livrées',    color: '#14b8a6' },
  { key: 'returned',  label: 'Retour',     color: '#ef4444' },
]

function SecondaryCard({ label, count, pct, color }) {
  const c = theme.stat[color] || theme.stat.violet
  return (
    <div className="rounded-2xl p-5 border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium" style={{ color: theme.dark.mutedLight }}>{label}</p>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{pct}%</span>
      </div>
      <span className={`text-3xl font-bold tracking-tight ${c.text}`}>{count}</span>
      <div className="mt-3 h-1 rounded-full" style={{ background: theme.dark.border }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pct)}%`, background: c.hex }} />
      </div>
    </div>
  )
}

export default function DeliveriesTab({ queryString, onFilterWilaya }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/orders/stats/dashboard/deliveries/?${queryString()}`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [queryString])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm" style={{ color: theme.dark.muted }}>Impossible de charger les statistiques.</p>

  const { funnel, secondary, timeseries, by_wilaya, by_source, by_status, deltas } = data
  const goToStatus = (status) => navigate(`/dashboard/commandes?status=${status}`)

  return (
    <div className="space-y-6">
      {/* Entonnoir */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard label="Commandes réelles" sub={`sur ${funnel.total} total`} color="violet" ring={100}
          value={funnel.real} trend={deltas.total} />
        <StatCard label="Confirmé" sub={`sur ${funnel.real} réelles`} color="green" ring={funnel.confirmed_pct}
          value={funnel.confirmed} />
        <StatCard label="Expédié" sub={`sur ${funnel.confirmed} confirmées`} color="blue" ring={funnel.shipped_pct}
          value={funnel.shipped} />
      </div>

      {/* Secondaires */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        <SecondaryCard label="En cours d'acheminement" count={secondary.in_transit.count} pct={secondary.in_transit.pct} color="orange" />
        <SecondaryCard label="Livré" count={secondary.delivered.count} pct={secondary.delivered.pct} color="green" />
        <SecondaryCard label="Retour" count={secondary.returned.count} pct={secondary.returned.pct} color="red" />
        <SecondaryCard label="Annulé" count={secondary.cancelled.count} pct={secondary.cancelled.pct} color="red" />
      </div>

      {/* Graphe 6 séries */}
      <div className="rounded-2xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <p className="text-sm font-semibold text-app-primary mb-4">Évolution des commandes</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={timeseries.map(d => ({ ...d, date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) }))}
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: theme.dark.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: theme.dark.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: theme.dark.sidebar, border: `1px solid ${theme.dark.border}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: theme.dark.mutedLight }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {SERIES.map(s => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.08} strokeWidth={2} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Carte + sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-sm font-semibold text-app-primary mb-4">Commandes par wilaya</p>
          <AlgeriaMap data={by_wilaya} onWilayaClick={onFilterWilaya} />
        </div>

        <div className="rounded-2xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-sm font-semibold text-app-primary mb-4">Statistiques par source de commande</p>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {by_source.length === 0 ? (
              <p className="text-sm" style={{ color: theme.dark.muted }}>Aucune donnée sur cette période.</p>
            ) : by_source.map(s => (
              <div key={s.source} className="rounded-xl border p-3.5" style={{ borderColor: theme.dark.border }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-app-primary truncate pr-2">{s.source}</span>
                  <span className="text-xs shrink-0" style={{ color: theme.dark.muted }}>Total : {s.total} · Réelles : {s.real}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg py-1.5" style={{ background: theme.dark.sidebar }}>
                    <p className="text-emerald-400 text-sm font-semibold">{s.confirmed_pct}%</p>
                    <p className="text-[10px]" style={{ color: theme.dark.muted }}>Confirmé</p>
                  </div>
                  <div className="rounded-lg py-1.5" style={{ background: theme.dark.sidebar }}>
                    <p className="text-violet-300 text-sm font-semibold">{s.delivered_pct}%</p>
                    <p className="text-[10px]" style={{ color: theme.dark.muted }}>Livré</p>
                  </div>
                  <div className="rounded-lg py-1.5" style={{ background: theme.dark.sidebar }}>
                    <p className="text-red-400 text-sm font-semibold">{s.returned}</p>
                    <p className="text-[10px]" style={{ color: theme.dark.muted }}>En retour</p>
                  </div>
                  <div className="rounded-lg py-1.5" style={{ background: theme.dark.sidebar }}>
                    <p className="text-red-400 text-sm font-semibold">{s.cancelled}</p>
                    <p className="text-[10px]" style={{ color: theme.dark.muted }}>Annulé</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tuiles de statut — cliquables, contrairement au concurrent */}
      <div>
        <p className="text-sm font-semibold text-app-primary mb-4">Répartition par statut</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {by_status.map(s => (
            <button
              key={s.status}
              onClick={() => goToStatus(s.status)}
              className="rounded-xl border p-4 text-left transition hover:border-violet-500/40 hover:bg-violet-500/5 cursor-pointer"
              style={{ background: theme.dark.card, borderColor: theme.dark.border }}
            >
              <p className="text-2xl font-bold text-app-primary">{s.count}</p>
              <p className="text-xs mt-1 truncate" style={{ color: theme.dark.muted }}>{s.label}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
