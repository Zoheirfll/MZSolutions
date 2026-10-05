import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import { AdminError } from '../../components/admin/AdminState'

// Réglages globaux (superadmin). Les secrets (clés API, SECRET_KEY) restent dans
// le .env du serveur : ils ne sont jamais stockés ni affichés ici.
export default function PlatformAdminSettingsPage() {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [trialDays, setTrialDays] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => (
    api.get('/platform-admin/settings/')
      .then(({ data: d }) => { setData(d); setTrialDays(String(d.trial_days)); setError(false) })
      .catch(() => setError(true))
  ), [])

  useEffect(() => { load() }, [load])

  const save = async (patch, okMessage) => {
    setBusy(true)
    try {
      const { data: d } = await api.put('/platform-admin/settings/', patch)
      setData(d)
      setTrialDays(String(d.trial_days))
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
      </div>
    </div>
  )
}
