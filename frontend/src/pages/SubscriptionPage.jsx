import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { downloadFile } from '../lib/downloadFile'
import { theme } from '../theme'
import { useTranslation } from 'react-i18next'

function Spinner() {
  const { t } = useTranslation('dashboard')
  return (
    <div className="flex items-center justify-center gap-2 text-app-muted py-16">
      <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>{t('Chargement…')}</div>
  )
}

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DA`

export default function SubscriptionPage() {
  const { t, t: tr } = useTranslation('dashboard')
  const [plans, setPlans]   = useState([])
  const [quota, setQuota]   = useState(null)
  const [cycle, setCycle]   = useState('monthly')
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState(null)
  const [error, setError]   = useState('')
  const [payNotice, setPayNotice] = useState('')
  const [invoices, setInvoices] = useState([])

  useEffect(() => {
    Promise.resolve().then(() => api.get('/support/invoices/'))
      .then((res) => { if (Array.isArray(res?.data)) setInvoices(res.data) }).catch(() => {})
  }, [])

  // Retour de SofizPay (?payment=return&ref=ID) : pas de webhook, on fait vérifier
  // le paiement côté serveur avant de relire le quota.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const ref = qs.get('ref')
    if (qs.get('payment') !== 'return' || !ref) return
    setPayNotice(t('Vérification de votre paiement…'))
    api.post('/stores/me/subscribe/verify/', { ref })
      .then(({ data }) => {
        setPayNotice(data.status === 'success' ? t('Paiement confirmé : votre abonnement est actif.')
          : data.status === 'failed' ? t('Le paiement a échoué ou a été annulé.')
          : t('Paiement pas encore confirmé. Il sera appliqué automatiquement dès que SofizPay le confirmera.'))
        if (data.status === 'success') api.get('/stores/me/quota/').then(q => setQuota(q.data)).catch(() => {})
      })
      .catch(() => setPayNotice(t('Impossible de vérifier le paiement pour le moment.')))
  }, [])

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
      setError(err.response?.data?.detail || t('Erreur lors de la création du paiement.'))
      setSubscribing(null)
    }
  }

  return (
    <DashboardLayout title={t('Abonnement')} subtitle={t('Cette page vous montre où vous en êtes dans votre période d\'essai gratuit ou votre abonnement payant (combien de commandes il vous reste, combien de jours). Elle affiche aussi les différents paliers d\'abonnement disponibles avec leurs prix mensuels ou annuels. En cliquant sur "Commencer", vous êtes redirigé vers un paiement sécurisé (SofizPay) ; votre abonnement n\'est activé qu\'une fois le paiement confirmé, pas avant.')}>
      {loading ? <Spinner /> : (
        <>
          {payNotice && <div className="rounded-xl border p-4 mb-6 text-sm text-app-primary" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>{payNotice}</div>}
          {quota && (() => {
            const active = quota.is_trial_active || quota.is_subscription_active
            return (
              <div className="rounded-xl border p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                style={{ background: theme.dark.card, borderColor: active ? theme.dark.border : '#7f1d1d' }}>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={active ? theme.badge.success : theme.badge.danger}>
                      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      {quota.is_subscription_active ? (quota.plan?.name ? t('Abonnement {{name}} actif', { name: quota.plan.name }) : t('Abonnement actif'))
                        : quota.is_trial_active ? t('Essai gratuit actif') : t('Expiré')}
                    </span>
                  </div>
                  {quota.is_subscription_active ? (
                    <p className="text-sm text-app-primary">
                      {quota.orders_used} / {quota.orders_limit >= 10 ** 9 ? '∞' : quota.orders_limit}{' '}{t('commandes utilisées')}{quota.period_end && <>{t('— renouvellement le')}{' '}{new Date(quota.period_end).toLocaleDateString('fr-DZ')}</>}
                    </p>
                  ) : quota.is_trial_active ? (
                    <p className="text-sm text-app-primary">
                      <span className="font-semibold text-violet-300">{quota.orders_remaining} / {quota.orders_limit}</span>{' '}{t('commandes restantes, se termine le')}{' '}{new Date(quota.trial_ends_at).toLocaleDateString('fr-DZ')}
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: '#fca5a5' }}>{t('Votre essai a pris fin le')}{' '}{new Date(quota.trial_ends_at).toLocaleDateString('fr-DZ')}{' '}{t('— les nouvelles commandes sont bloquées tant qu\'aucun abonnement n\'est actif.')}</p>
                  )}
                </div>
                {!active && (
                  <button onClick={() => document.getElementById('plans-grid')?.scrollIntoView({ behavior: 'smooth' })}
                    className={theme.btn.primary + ' shrink-0'}>{t('Choisir un palier')}</button>
                )}
              </div>
            )
          })()}

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-lg border p-1" style={{ borderColor: theme.dark.border }}>
              {[{ v: 'monthly', l: '1 mois' }, { v: 'yearly', l: '12 mois' }].map(o => (
                <button key={o.v} onClick={() => setCycle(o.v)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${cycle === o.v ? 'text-white bg-violet-600' : 'text-app-muted-light hover:text-app-primary'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div id="plans-grid" className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, i) => {
              const price = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly
              const isCurrent = quota?.plan?.id === plan.id
              const popular = i === 1
              return (
                <div key={plan.id}
                  className={`rounded-2xl border p-6 flex flex-col ${popular ? 'ring-2 ring-violet-500' : ''}`}
                  style={{ background: theme.dark.card, borderColor: popular ? '#7c3aed' : theme.dark.border }}>
                  {popular && <span className={theme.badge.info + ' self-start mb-3'}>{t('Le plus populaire')}</span>}
                  <h3 className="text-lg font-semibold text-app-primary mb-1">{plan.name}</h3>
                  <p className="text-3xl font-bold text-app-primary mb-1">{money(price)}
                    <span className="text-sm font-normal ms-1" style={{ color: theme.dark.muted }}>/ {cycle === 'yearly' ? 'an' : 'mois'}</span>
                  </p>
                  <p className="text-xs mb-5" style={{ color: theme.dark.muted }}>
                    {plan.orders_limit ? t('Jusqu\'à {{orders_limit}} commandes', { orders_limit: plan.orders_limit }) : t('Commandes illimitées')}
                  </p>
                  <p className="text-xs mb-5 -mt-4" style={{ color: theme.dark.muted }}>
                    {!plan.ai_daily_limit && !plan.ai_weekly_limit
                      ? t('Assistant IA illimité')
                      : [plan.ai_daily_limit ? t('{{n}} appels IA par jour', { n: plan.ai_daily_limit }) : '', plan.ai_weekly_limit ? t('{{n}} appels IA par semaine', { n: plan.ai_weekly_limit }) : ''].filter(Boolean).join(' · ')}
                  </p>
                  <button onClick={() => subscribe(plan)} disabled={subscribing === plan.id || isCurrent}
                    className={`${theme.btn.primary} justify-center mb-5 disabled:opacity-60`}>
                    {isCurrent ? t('Palier actuel') : subscribing === plan.id ? '…' : tr('Commencer')}
                  </button>
                  <ul className="space-y-2 text-sm text-app-primary">
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

      {invoices.length > 0 && (
        <div className="mt-8 rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <h2 className="text-sm font-semibold text-app-primary mb-3">{t('Mes factures')}</h2>
          <ul className="divide-y" style={{ borderColor: theme.dark.border }}>
            {invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm text-app-primary">
                <span>{i.number} — {i.description} — {i.total_ttc} DA</span>
                <button onClick={() => downloadFile(`/support/invoices/${i.id}/pdf/`, `facture-${i.number}.pdf`).catch(() => {})}
                  className="text-violet-400 hover:text-violet-300 text-xs font-medium">{t('Télécharger')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardLayout>
  )
}
