import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, LineChart, DollarSign, CheckCircle2, Star } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'
import { usePeriod, PeriodFilter } from './orders/stats/statsShared'
import DeliveriesTab from './dashboard/DeliveriesTab'
import RevenueTab from './dashboard/RevenueTab'
import ConfirmationTab from './dashboard/ConfirmationTab'
import KpiTab from './dashboard/KpiTab'
import FilterPanel, { EMPTY_FILTERS } from './dashboard/FilterPanel'

const TABS = [
  { key: 'deliveries',   label: 'Livraisons',    icon: LineChart },
  { key: 'revenue',      label: 'Revenus',       icon: DollarSign },
  { key: 'confirmation', label: 'Confirmation',  icon: CheckCircle2 },
  { key: 'kpi',          label: 'KPI',           icon: Star },
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quota, setQuota] = useState(null)
  const [tab, setTab] = useState('deliveries')
  const period = usePeriod('month')
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const buildFilteredQuery = useCallback(() => {
    const params = new URLSearchParams(period.queryString())
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    return params.toString()
  }, [period.queryString, filters])

  useEffect(() => {
    api.get('/stores/me/quota/').then(({ data }) => setQuota(data)).catch(() => {})
  }, [])

  const usedPct = quota ? Math.round((quota.orders_used / quota.orders_limit) * 100) : 0
  const daysLeftUntil = (dateStr) => Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000))
  const daysLeft = quota
    ? (quota.is_subscription_active ? daysLeftUntil(quota.period_end) : daysLeftUntil(quota.trial_ends_at))
    : 0
  const daysLeftLabel = quota?.is_subscription_active ? "Jours avant renouvellement" : "Jours d'essai"

  const goToWilaya = (wilayaName) => navigate(`/dashboard/commandes?wilaya=${encodeURIComponent(wilayaName)}`)

  return (
    <DashboardLayout title="Tableau de bord" subtitle="C'est la première page que vous voyez en vous connectant. Elle résume l'état de votre boutique : l'onglet Livraisons montre l'entonnoir de vos commandes (réelles → confirmées → expédiées) et la carte des ventes par wilaya, Revenus détaille votre rentabilité, Confirmation le travail de vos confirmateurs, et KPI vos meilleures sources et wilayas. Choisissez la période en haut, elle s'applique aux 4 onglets.">
      {/* Welcome */}
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-app-primary">
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

      {/* Trial quota banner */}
      {quota && (
        <div className="rounded-2xl p-5 border mb-6 relative overflow-hidden"
          style={{ background: theme.dark.card, borderColor: 'rgba(124,58,237,0.25)' }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at top left, rgba(124,58,237,0.08), transparent 60%)' }} />
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
                <p className="text-xs font-medium mb-1" style={{ color: theme.dark.muted }}>{daysLeftLabel}</p>
                <p className="text-3xl font-bold text-violet-300">{daysLeft}
                  <span className="text-sm font-normal ml-1" style={{ color: theme.dark.muted }}>jours</span>
                </p>
              </div>
              <div className="flex flex-col gap-1.5 min-w-35">
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
              {(() => {
                const active = quota.is_trial_active || quota.is_subscription_active
                const label = quota.is_subscription_active ? (quota.plan?.name ? `Abonnement ${quota.plan.name}` : 'Abonnement actif') : quota.is_trial_active ? 'Essai actif' : 'Expiré'
                return (
                  <span className={active ? theme.badge.success : theme.badge.danger}>
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {label}
                  </span>
                )
              })()}
              <button onClick={() => navigate('/dashboard/abonnement')} className={theme.btn.primary}>Mettre à niveau</button>
            </div>
          </div>
        </div>
      )}

      {/* Onglets */}
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
        <DeliveriesTab queryString={buildFilteredQuery} onFilterWilaya={goToWilaya} />
      ) : tab === 'revenue' ? (
        <RevenueTab queryString={period.queryString} />
      ) : tab === 'confirmation' ? (
        <ConfirmationTab queryString={period.queryString} />
      ) : (
        <KpiTab queryString={buildFilteredQuery} />
      )}
    </DashboardLayout>
  )
}
