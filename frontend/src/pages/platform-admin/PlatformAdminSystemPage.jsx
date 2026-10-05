import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import { AdminError } from '../../components/admin/AdminState'

const REFRESH_MS = 60_000
const PER_PAGE = 20
const dateTime = (v) => (v ? new Date(v).toLocaleString('fr-DZ') : '—')
const BADGE = { ok: theme.badge.success, warning: theme.badge.warning, error: theme.badge.danger }
const LABEL = { ok: 'OK', warning: 'Attention', error: 'Erreur' }

// Santé des services (configuration uniquement — aucun appel externe) et erreurs
// serveur (500) groupées. Les erreurs ne conservent ni corps de requête, ni
// cookies, ni message d'exception.
export default function PlatformAdminSystemPage() {
  const { t } = useTranslation()
  const [health, setHealth] = useState(null)
  const [healthError, setHealthError] = useState(false)
  const [errors, setErrors] = useState({ results: [], count: 0, open_count: 0 })
  const [errorsError, setErrorsError] = useState('')
  const [status, setStatus] = useState('open')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const loadHealth = useCallback(() => (
    api.get('/platform-admin/health/').then(({ data }) => { setHealth(data); setHealthError(false) }).catch(() => setHealthError(true))
  ), [])

  const loadErrors = useCallback(() => (
    api.get('/platform-admin/errors/', { params: { status: status || undefined, page, per_page: PER_PAGE } })
      .then(({ data }) => { setErrors(data); setErrorsError('') })
      .catch(() => setErrorsError(t('Impossible de charger les erreurs.')))
      .finally(() => setLoading(false))
  ), [status, page, t])

  // Rafraîchissement silencieux (onglet visible seulement) : pas de remise à
  // « chargement », donc ni scroll perdu ni clignotement.
  useEffect(() => {
    loadHealth(); loadErrors()
    const id = setInterval(() => { if (document.visibilityState === 'visible') { loadHealth(); loadErrors() } }, REFRESH_MS)
    return () => clearInterval(id)
  }, [loadHealth, loadErrors])

  const resolve = async (row) => {
    try {
      await api.post(`/platform-admin/errors/${row.id}/resolve/`)
      setToast({ type: 'success', message: t('Erreur marquée résolue.') })
      await loadErrors()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    }
  }

  const columns = [
    { key: 'exception_type', label: t('Erreur'), render: (r) => (<div><p className="font-medium">{r.exception_type}</p><p className="text-xs text-app-muted break-all">{r.method} {r.route}</p></div>) },
    { key: 'location', label: t('Emplacement'), render: (r) => <span className="text-xs text-app-muted-light break-all">{r.location || '—'}</span> },
    { key: 'count', label: t('Occurrences') },
    { key: 'last_seen', label: t('Dernière fois'), render: (r) => dateTime(r.last_seen) },
    { key: 'status', label: t('Statut'), render: (r) => <span className={r.status === 'open' ? theme.badge.danger : theme.badge.neutral}>{r.status === 'open' ? t('Ouverte') : t('Résolue')}</span> },
  ]
  const statusOptions = [{ value: 'open', label: t('Ouvertes') }, { value: 'resolved', label: t('Résolues') }, { value: '', label: t('Toutes') }]

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="system" title={t('Système')} subtitle={t('Santé des services et erreurs serveur')}
        help={t('La santé ne vérifie que la configuration (jamais d\'appel à Groq, SofizPay ou aux transporteurs). Les erreurs 500 sont regroupées par route et emplacement dans le code ; une erreur résolue qui revient se rouvre toute seule. Aucune donnée de la requête n\'est conservée.')} />

      <h2 className="text-sm font-semibold text-app-primary mb-3">{t('Santé des services')}</h2>
      {healthError && !health ? <AdminError onRetry={loadHealth} /> : !health ? (
        <p className="text-sm text-app-muted mb-6">{t('Chargement…')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
          {health.checks.map((c) => (
            <div key={c.key} className="rounded-xl border p-4 flex items-start justify-between gap-3" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <div>
                <p className="text-sm font-medium text-app-primary">{t(c.label)}</p>
                <p className="text-xs text-app-muted mt-0.5">{c.detail}</p>
              </div>
              <span className={BADGE[c.status]}>{t(LABEL[c.status])}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-app-primary">{t('Erreurs serveur')} ({errors.open_count} {t('ouvertes')})</h2>
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={statusOptions} className={`${theme.inputDark} w-40`} />
      </div>
      <AdminList columns={columns} rows={errors.results} total={errors.count} page={page} perPage={PER_PAGE} onPage={setPage}
        loading={loading} error={errorsError} onRetry={loadErrors}
        rowActions={(r) => (r.status === 'open' ? (
          <button onClick={() => resolve(r)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{t('Marquer résolue')}</button>
        ) : null)} />
    </div>
  )
}
