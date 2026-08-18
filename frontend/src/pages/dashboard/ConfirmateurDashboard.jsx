import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneMissed, Clock, CheckCircle2, ListChecks, LineChart, Star } from 'lucide-react'
import DashboardLayout from '../../components/DashboardLayout'
import StatusBadge from '../../components/StatusBadge'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import { usePeriod, PeriodFilter } from '../orders/stats/statsShared'
import DeliveriesTab from './DeliveriesTab'
import ConfirmationTab from './ConfirmationTab'
import KpiTab from './KpiTab'
import FilterPanel, { EMPTY_FILTERS } from './FilterPanel'

// Pas d'onglet "Revenus" ici — c'est du profit/coûts publicitaires/dettes
// fournisseurs à l'échelle de toute la boutique, aucune notion de "mes
// revenus à moi" côté confirmateur (voir DashboardRevenueView.check_access,
// volontairement resté strict owner/admin/stats_view côté serveur).
const TABS = [
  { key: 'deliveries',   label: 'Livraisons',    icon: LineChart },
  { key: 'confirmation', label: 'Confirmation',  icon: CheckCircle2 },
  { key: 'kpi',          label: 'KPI',           icon: Star },
]

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="rounded-xl border p-4 flex items-center gap-3" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: tint + '22', color: tint }}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-app-primary leading-tight">{value}</p>
        <p className="text-xs truncate" style={{ color: theme.dark.muted }}>{label}</p>
      </div>
    </div>
  )
}

// Tableau de bord dédié aux confirmateurs — ils n'ont pas stats_view (masqué
// par défaut, matrice de permissions Epic 7.5), donc l'atterrissage sur le
// tableau de bord analytique classique leur renvoyait une page pleine
// d'erreurs 403/404. Ici : deux blocs —
//  1) un résumé "à traiter" propre au confirmateur (commandes assignées),
//  2) EXACTEMENT les mêmes 4 onglets (Livraisons/Revenus/Confirmation/KPI)
//     que le tableau de bord du vendeur, réutilisant les mêmes composants —
//     le serveur les restreint automatiquement à ses propres commandes
//     assignées (voir StatsPermissionMixin/_apply_dashboard_filters et
//     ConfirmationRateView côté backend), aucun paramètre côté client ne
//     peut élargir la vue à la boutique entière ou à un autre confirmateur.
export default function ConfirmateurDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('deliveries')
  const period = usePeriod('month')
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const buildFilteredQuery = useCallback(() => {
    const params = new URLSearchParams(period.queryString())
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    return params.toString()
  }, [period.queryString, filters])

  useEffect(() => {
    api.get('/orders/stats/my-summary/')
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <DashboardLayout title="Tableau de bord" subtitle="Votre tableau de bord — vos commandes assignées et vos statistiques, jamais celles du reste de la boutique.">
      <p className="text-lg text-app-primary mb-5">Bonjour, <span className="font-semibold text-violet-400">{user?.first_name}</span></p>

      {loading ? (
        <p className="text-sm mb-6" style={{ color: theme.dark.muted }}>Chargement…</p>
      ) : !data ? (
        <p className="text-sm mb-6" style={{ color: theme.dark.muted }}>Impossible de charger vos statistiques.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard icon={ListChecks} label="À traiter (nouvelles)" value={data.pending} tint="#7c3aed" />
            <StatCard icon={PhoneMissed} label="Relances en attente" value={data.no_answer_1 + data.no_answer_2 + data.no_answer_3} tint="#f59e0b" />
            <StatCard icon={CheckCircle2} label="Confirmées aujourd'hui" value={data.confirmed_today} tint="#10b981" />
            <StatCard icon={Clock} label="Total actif assigné" value={data.total_active} tint="#3b82f6" />
          </div>

          {data.urgent.length > 0 && (
            <div className="rounded-xl border overflow-hidden mb-8" style={{ borderColor: theme.dark.border }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: theme.dark.border }}>
                <p className="text-sm font-semibold text-app-primary">À traiter en priorité</p>
                <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>Les plus anciennes d'abord — nouvelles commandes et relances non abouties.</p>
              </div>
              <table className="w-full text-sm">
                <thead style={{ background: theme.dark.sidebar }}>
                  <tr className="text-left text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
                    <th className="px-4 py-2.5 font-medium">CLIENT</th>
                    <th className="px-4 py-2.5 font-medium">TÉLÉPHONE</th>
                    <th className="px-4 py-2.5 font-medium">WILAYA</th>
                    <th className="px-4 py-2.5 font-medium">STATUT</th>
                    <th className="px-4 py-2.5 font-medium">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.urgent.map(o => (
                    <tr key={o.id} onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
                      className="border-b hover:bg-violet-500/5 transition cursor-pointer" style={{ borderColor: theme.dark.borderRowHover }}>
                      <td className="px-4 py-2.5 text-app-primary">{o.first_name} {o.last_name}</td>
                      <td className="px-4 py-2.5 text-app-muted-light">{o.phone}</td>
                      <td className="px-4 py-2.5 text-app-muted-light">{o.wilaya}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-2.5 text-app-primary font-medium">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Mêmes 4 onglets que le tableau de bord du vendeur — données
          automatiquement restreintes à ce confirmateur côté serveur. */}
      <div className="flex items-center gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}>
            <t.icon className="w-3.5 h-3.5" strokeWidth={2} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <PeriodFilter period={period.period} setPeriod={period.setPeriod}
          dateFrom={period.dateFrom} setDateFrom={period.setDateFrom}
          dateTo={period.dateTo} setDateTo={period.setDateTo} />
        {(tab === 'deliveries' || tab === 'kpi') && (
          <FilterPanel filters={filters} setFilters={setFilters} />
        )}
      </div>

      {!period.ready ? (
        <p className="text-sm" style={{ color: theme.dark.muted }}>Choisissez une date de début et de fin.</p>
      ) : tab === 'deliveries' ? (
        <DeliveriesTab queryString={buildFilteredQuery} onFilterWilaya={(w) => navigate(`/dashboard/commandes?wilaya=${encodeURIComponent(w)}`)} />
      ) : tab === 'confirmation' ? (
        <ConfirmationTab queryString={period.queryString} />
      ) : (
        <KpiTab queryString={buildFilteredQuery} />
      )}
    </DashboardLayout>
  )
}
