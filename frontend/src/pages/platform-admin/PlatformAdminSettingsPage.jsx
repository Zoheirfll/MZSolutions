import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import { AdminError } from '../../components/admin/AdminState'
import AiQuotaGrid from '../../components/admin/AiQuotaGrid'

// Réglages globaux (superadmin). Les secrets (clés API, SECRET_KEY) restent dans
// le .env du serveur : ils ne sont jamais stockés ni affichés ici.
export default function PlatformAdminSettingsPage() {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [trialDays, setTrialDays] = useState('')
  const [aiLimit, setAiLimit] = useState('')
  const [aiWeekly, setAiWeekly] = useState('')
  const [quotaRows, setQuotaRows] = useState([])
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => (
    api.get('/platform-admin/settings/')
      .then(({ data: d }) => { setData(d); setTrialDays(String(d.trial_days)); setAiLimit(String(d.ai_daily_limit ?? 0)); setAiWeekly(String(d.ai_weekly_limit ?? 0)); setQuotaRows(d.ai_quotas || []); setError(false) })
      .catch(() => setError(true))
  ), [])

  useEffect(() => { load() }, [load])

  // Consommation IA : secondaire, jamais bloquante.
  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => api.get('/platform-admin/ai-usage/'))
      .then((res) => { if (alive && Array.isArray(res?.data?.last_7_days)) setUsage(res.data) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const save = async (patch, okMessage) => {
    setBusy(true)
    try {
      const { data: d } = await api.put('/platform-admin/settings/', patch)
      setData(d)
      setTrialDays(String(d.trial_days))
      setAiLimit(String(d.ai_daily_limit ?? 0))
      setAiWeekly(String(d.ai_weekly_limit ?? 0))
      setQuotaRows(d.ai_quotas || [])
      setToast({ type: 'success', message: okMessage })
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <AdminError onRetry={load} />
  if (!data) return <p className="py-16 text-center text-sm text-app-muted">{t('Chargement…')}</p>

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="settings" title={t('Réglages')} subtitle={t('Paramètres globaux de la plateforme')}
        help={t('La durée d\'essai ne s\'applique qu\'aux boutiques créées après la modification. Fermer les inscriptions bloque la création de nouveaux comptes (utile pendant un incident) sans affecter les vendeurs existants.')} />

      <div className="max-w-xl space-y-4">
        <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <label className="block text-sm font-medium text-app-primary mb-1" htmlFor="trial-days">{t('Durée de l\'essai gratuit (jours)')}</label>
          <p className="text-xs text-app-muted mb-3">{t('Pour les nouvelles boutiques uniquement (0 à 365).')}</p>
          <div className="flex items-center gap-3">
            <input id="trial-days" type="number" min={0} max={365} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className={`${theme.inputDark} w-32`} />
            <button disabled={busy || trialDays === '' || Number(trialDays) === data.trial_days} onClick={() => save({ trial_days: Number(trialDays) }, t('Durée d\'essai mise à jour.'))} className={theme.btn.primary}>
              {t('Enregistrer')}
            </button>
          </div>
        </div>

        <div className="rounded-xl border p-5 flex items-center justify-between gap-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <div>
            <p className="text-sm font-medium text-app-primary">{t('Inscriptions')}</p>
            <p className="text-xs text-app-muted mt-0.5">{data.allow_registration ? t('Ouvertes : les nouveaux vendeurs peuvent créer un compte.') : t('Fermées : aucune nouvelle inscription possible.')}</p>
          </div>
          <button disabled={busy} onClick={() => save({ allow_registration: !data.allow_registration }, data.allow_registration ? t('Inscriptions fermées.') : t('Inscriptions rouvertes.'))}
            className={data.allow_registration ? theme.btn.danger : theme.btn.primary}>
            {data.allow_registration ? t('Fermer les inscriptions') : t('Rouvrir les inscriptions')}
          </button>
        </div>

        <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-sm font-medium text-app-primary mb-1">{t('Modules de la plateforme')}</p>
          <p className="text-xs text-app-muted mb-3">{t('Couper un module le désactive pour TOUTES les boutiques (il peut aussi être coupé boutique par boutique depuis sa fiche).')}</p>
          <div className="space-y-2">
            {(data.features || []).map((f) => {
              const off = (data.disabled_features || []).includes(f.key)
              return (
                <label key={f.key} className="flex items-center justify-between gap-3 text-sm text-app-primary">
                  <span>{t(f.label)} <span className={off ? 'text-red-400' : 'text-emerald-400'}>— {off ? t('désactivé') : t('actif')}</span></span>
                  <input type="checkbox" aria-label={t(f.label)} checked={!off} disabled={busy} className="accent-violet-600"
                    onChange={() => save({ disabled_features: off ? data.disabled_features.filter((k) => k !== f.key) : [...data.disabled_features, f.key] },
                      off ? t('Module réactivé.') : t('Module désactivé.'))} />
                </label>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <label className="block text-sm font-medium text-app-primary mb-1" htmlFor="ai-limit">{t('Limite d’appels IA par boutique et par jour')}</label>
          <p className="text-xs text-app-muted mb-3">{t('Pour les boutiques sans palier (essai). Les boutiques abonnées suivent les limites de leur palier (page Paliers). 0 = illimité.')}</p>
          <div className="flex items-center gap-3">
            <input id="ai-limit" type="number" min={0} max={100000} value={aiLimit} onChange={(e) => setAiLimit(e.target.value)} className={`${theme.inputDark} w-32`} />
            <button disabled={busy || aiLimit === '' || Number(aiLimit) === data.ai_daily_limit} onClick={() => save({ ai_daily_limit: Number(aiLimit) }, t('Limite IA mise à jour.'))} className={theme.btn.primary}>{t('Enregistrer')}</button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <label className="text-sm text-app-primary" htmlFor="ai-weekly">{t('Par semaine')}</label>
            <input id="ai-weekly" type="number" min={0} max={1000000} value={aiWeekly} onChange={(e) => setAiWeekly(e.target.value)} className={`${theme.inputDark} w-32`} />
            <button disabled={busy || aiWeekly === '' || Number(aiWeekly) === (data.ai_weekly_limit ?? 0)} onClick={() => save({ ai_weekly_limit: Number(aiWeekly) }, t('Limite IA hebdomadaire mise à jour.'))} className={theme.btn.primary}>{t('Enregistrer')}</button>
          </div>
          <div className="mt-4">
            <AiQuotaGrid rows={quotaRows} onChange={setQuotaRows} />
            {quotaRows.length > 0 && (
              <button disabled={busy} className={`${theme.btn.primary} mt-3`}
                onClick={() => save({ ai_quotas: Object.fromEntries(quotaRows.map((r) => [r.key, { daily: r.daily, weekly: r.weekly }])) }, t('Quotas IA par fonctionnalité mis à jour.'))}>
                {t('Enregistrer les quotas par fonctionnalité')}
              </button>
            )}
          </div>
          {usage && (
            <div className="mt-4 text-xs text-app-muted-light">
              <p>{t('Aujourd’hui')} : <strong className="text-app-primary">{usage.today}</strong> {t('appel(s)')} — {t('7 derniers jours')} : <strong className="text-app-primary">{usage.last_7_days.reduce((n, d) => n + d.calls, 0)}</strong></p>
              {usage.top_stores_today.map((s) => <p key={s.store_id}>{s.store_name} — {s.calls}</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
