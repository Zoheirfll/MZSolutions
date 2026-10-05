import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Store, Wallet, ShoppingCart, AlertTriangle } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../../api/axios'
import { theme } from '../../theme'
import StatCard from '../../components/StatCard'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import { AdminError } from '../../components/admin/AdminState'
import { tt } from '../../i18n'

const REFRESH_MS = 60_000
const money = (v) => `${Number(v || 0).toLocaleString('fr-DZ')} DA`

const ALERTS = [
  { key: 'trials_expiring', label: tt('Essais qui expirent sous 3 jours'), to: '/plateforme/comptes?state=trial' },
  { key: 'quota_high', label: tt('Quota consommé à plus de 80 %'), to: '/plateforme/comptes' },
  { key: 'payments_stuck', label: tt('Paiements en attente depuis plus d\'1 h'), to: '/plateforme/paiements?status=pending' },
  { key: 'open_errors', label: tt('Erreurs serveur ouvertes'), to: '/plateforme/systeme' },
  { key: 'unread_messages', label: tt('Messages non lus'), to: '/plateforme/messages' },
]

function Spinner() {
  const { t } = useTranslation()
  return <div className="py-16 text-center text-sm text-app-muted">{t('Chargement…')}</div>
}

function Panel({ title, children }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <h2 className="text-sm font-semibold text-app-primary mb-4">{title}</h2>
      {children}
    </div>
  )
}

export default function PlatformAdminOverviewPage() {
  const { t: tr } = useTranslation('dashboard')
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  // Chargement initial visible ; les rafraîchissements périodiques sont silencieux
  // (jamais de remise à l'état « chargement » → pas de perte de scroll).
  const load = useCallback(() => {
    return api.get('/platform-admin/overview/')
      .then(({ data: d }) => { setData(d); setError(false) })
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const help = t('Cette page résume la plateforme : boutiques par état (essai, abonnée, expirée, suspendue), revenus d\'abonnement encaissés, commandes des 30 derniers jours et alertes à traiter. Les revenus ne comptent que les paiements d\'abonnement confirmés depuis SofizPay.')

  if (!data && error) {
    return (
      <>
        <AdminPageHeader pageKey="overview" title={t('Vue d’ensemble')} help={help} />
        <AdminError onRetry={load} />
      </>
    )
  }
  if (!data) return <Spinner />

  const { stores, revenue, activity, alerts } = data
  const alertCount = ALERTS.reduce((n, a) => n + (alerts[a.key]?.count || 0), 0)
  const merged = activity.orders_series.map((o, i) => ({
    month: o.month, orders: o.value, stores: activity.new_stores_series[i]?.value || 0,
  }))
  const tooltipStyle = { background: theme.dark.card, border: `1px solid ${theme.dark.border}`, borderRadius: 8 }

  return (
    <div>
      <AdminPageHeader pageKey="overview" title={t('Vue d’ensemble')} subtitle={t('Santé de la plateforme en un coup d\'œil')} help={help} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label={t('Boutiques')} value={stores.total} sub={t('{{n}} suspendue(s)', { n: stores.suspended })} color="violet" icon={Store} />
        <StatCard label={t('Revenus du mois')} value={money(revenue.this_month)} sub={t('{{n}} paiement(s) en attente', { n: revenue.pending })} color="green" icon={Wallet} />
        <StatCard label={t('Commandes (30 j)')} value={activity.orders_30d} color="blue" icon={ShoppingCart} />
        <StatCard label={t('Alertes')} value={alertCount} color={alertCount > 0 ? 'red' : 'green'} icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Panel title={t('Boutiques par état')}>
          <ul className="space-y-2 text-sm">
            {[['trial', tr('En essai')], ['subscribed', tr('Abonnées')], ['expired', tr('Expirées')], ['suspended', 'Suspendues']].map(([k, label]) => (
              <li key={k} className="flex justify-between"><span className="text-app-muted-light">{t(label)}</span><span className="font-semibold text-app-primary">{stores[k]}</span></li>
            ))}
          </ul>
        </Panel>
        <div className="lg:col-span-2">
          <Panel title={t('Alertes')}>
            <ul className="divide-y" style={{ borderColor: theme.dark.border }}>
              {ALERTS.map((a) => {
                const count = alerts[a.key]?.count || 0
                return (
                  <li key={a.key} className="py-2.5 flex items-center justify-between text-sm">
                    <span className={count > 0 ? 'text-app-primary' : 'text-app-muted'}>{t(a.label)}</span>
                    {count > 0
                      ? <Link to={a.to} className="text-violet-400 hover:text-violet-300 font-semibold">{count} →</Link>
                      : <span className="text-app-muted">0</span>}
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={t('Revenus d\'abonnement (12 mois)')}>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue.series}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={t('Commandes et nouvelles boutiques')}>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={merged}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="orders" name={t('Commandes')} fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="stores" name={t('Nouvelles boutiques')} fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  )
}
