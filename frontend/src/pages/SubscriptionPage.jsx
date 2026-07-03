import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { theme } from '../theme'

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 text-gray-500 py-16">
      <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Chargement…
    </div>
  )
}

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DA`

export default function SubscriptionPage() {
  const [plans, setPlans]   = useState([])
  const [quota, setQuota]   = useState(null)
  const [cycle, setCycle]   = useState('monthly')
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState(null)
  const [error, setError]   = useState('')

  useEffect(() => {
    Promise.all([api.get('/stores/plans/'), api.get('/stores/me/quota/')])
      .then(([p, q]) => { setPlans(p.data); setQuota(q.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const subscribe = async (plan) => {
    setSubscribing(plan.id)
    setError('')
    try {
      const { data } = await api.post('/stores/me/subscribe/', { plan_id: plan.id, billing_cycle: cycle })
      window.location.href = data.payment_url
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création du paiement.')
      setSubscribing(null)
    }
  }

  return (
    <DashboardLayout title="Abonnement">
      {loading ? <Spinner /> : (
        <>
          {quota && (
            <div className="rounded-xl border p-5 mb-8" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              {quota.plan ? (
                <p className="text-sm text-gray-300">
                  Palier actuel : <span className="font-semibold text-violet-300">{quota.plan.name}</span>
                  {' — '}{quota.orders_used} / {quota.orders_limit >= 10**9 ? '∞' : quota.orders_limit} commandes utilisées
                  {quota.period_end && <> — renouvellement le {new Date(quota.period_end).toLocaleDateString('fr-DZ')}</>}
                </p>
              ) : (
                <p className="text-sm text-gray-300">
                  Essai gratuit : <span className="font-semibold text-violet-300">{quota.orders_remaining} / {quota.orders_limit}</span> commandes restantes,
                  se termine le {new Date(quota.trial_ends_at).toLocaleDateString('fr-DZ')}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-lg border p-1" style={{ borderColor: theme.dark.border }}>
              {[{ v: 'monthly', l: '1 mois' }, { v: 'yearly', l: '12 mois' }].map(o => (
                <button key={o.v} onClick={() => setCycle(o.v)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${cycle === o.v ? 'text-white bg-violet-600' : 'text-gray-400 hover:text-gray-200'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, i) => {
              const price = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly
              const isCurrent = quota?.plan?.id === plan.id
              const popular = i === 1
              return (
                <div key={plan.id}
                  className={`rounded-2xl border p-6 flex flex-col ${popular ? 'ring-2 ring-violet-500' : ''}`}
                  style={{ background: theme.dark.card, borderColor: popular ? '#7c3aed' : theme.dark.border }}>
                  {popular && <span className={theme.badge.info + ' self-start mb-3'}>Le plus populaire</span>}
                  <h3 className="text-lg font-semibold text-gray-100 mb-1">{plan.name}</h3>
                  <p className="text-3xl font-bold text-gray-100 mb-1">{money(price)}
                    <span className="text-sm font-normal ml-1" style={{ color: theme.dark.muted }}>/ {cycle === 'yearly' ? 'an' : 'mois'}</span>
                  </p>
                  <p className="text-xs mb-5" style={{ color: theme.dark.muted }}>
                    {plan.orders_limit ? `Jusqu'à ${plan.orders_limit} commandes` : 'Commandes illimitées'}
                  </p>
                  <button onClick={() => subscribe(plan)} disabled={subscribing === plan.id || isCurrent}
                    className={`${theme.btn.primary} justify-center mb-5 disabled:opacity-60`}>
                    {isCurrent ? 'Palier actuel' : subscribing === plan.id ? '…' : 'Commencer'}
                  </button>
                  <ul className="space-y-2 text-sm text-gray-300">
                    {plan.features.map((f, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-400 mt-0.5">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
