import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import StatCard from '../../components/StatCard'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'

const PER_PAGE = 25
const REFRESH_MS = 60_000
const dateTime = (v) => (v ? new Date(v).toLocaleString('fr-DZ') : '—')
const REASON_LABEL = { bad_credentials: 'Identifiants incorrects', unverified: 'Email non vérifié', suspended: 'Boutique suspendue' }

// Tentatives de connexion échouées (détection de force brute). Conserve l'email saisi et
// l'IP, jamais le mot de passe ; purgées après 90 jours.
export default function PlatformAdminLoginsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const email = params.get('email') || ''
  const reason = params.get('reason') || ''
  const page = Number(params.get('page') || 1)
  const [data, setData] = useState({ results: [], count: 0, summary: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const update = useCallback((patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k) })
    setParams(next, { replace: true })
  }, [params, setParams])

  const load = useCallback(() => (
    api.get('/platform-admin/login-attempts/', { params: { email: email || undefined, reason: reason || undefined, page, per_page: PER_PAGE } })
      .then(({ data: d }) => { setData(d); setError('') })
      .catch(() => setError(t('Impossible de charger les tentatives de connexion.')))
      .finally(() => setLoading(false))
  ), [email, reason, page, t])

  useEffect(() => {
    load()
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const reasonOptions = [{ value: '', label: t('Tous les motifs') }, ...Object.keys(REASON_LABEL).map((k) => ({ value: k, label: t(REASON_LABEL[k]) }))]
  const columns = [
    { key: 'created_at', label: t('Date'), render: (r) => dateTime(r.created_at) },
    { key: 'email', label: t('Email saisi'), render: (r) => r.email || '—' },
    { key: 'ip_address', label: t('Adresse IP'), render: (r) => r.ip_address || '—' },
    { key: 'reason', label: t('Motif'), render: (r) => <span className={r.reason === 'bad_credentials' ? theme.badge.warning : theme.badge.neutral}>{t(REASON_LABEL[r.reason] || r.reason)}</span> },
  ]
  const s = data.summary

  return (
    <div>
      <AdminPageHeader pageKey="logins" title={t('Connexions')} subtitle={t('Tentatives de connexion échouées')}
        help={t('Chaque échec de connexion est enregistré avec l\'email saisi et l\'adresse IP (jamais le mot de passe), puis purgé après 90 jours. Un grand nombre d\'échecs depuis une même adresse sur 24 h signale une attaque par force brute.')} />

      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard label={t('Échecs (24 h)')} value={s.failed_24h} color={s.failed_24h > 20 ? 'red' : 'violet'} />
          <StatCard label={t('Adresses IP distinctes (24 h)')} value={s.distinct_ips_24h} color="blue" />
          <div className="rounded-2xl p-5 border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <p className="text-xs font-medium text-app-muted-light mb-2">{t('Adresses les plus actives (24 h)')}</p>
            {s.top_ips.length === 0 ? <p className="text-sm text-app-muted">—</p> : s.top_ips.map((ip) => (
              <p key={ip.ip_address} className="text-sm text-app-primary">{ip.ip_address} <span className="text-app-muted">— {ip.count}</span></p>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={email} onChange={(e) => update({ email: e.target.value, page: '' })} placeholder={t('Email saisi…')} className={`${theme.inputDark} w-full sm:w-72`} />
        <Select value={reason} onChange={(v) => update({ reason: v, page: '' })} options={reasonOptions} className={`${theme.inputDark} w-56`} />
      </div>

      <AdminList columns={columns} rows={data.results} total={data.count} page={page} perPage={PER_PAGE}
        onPage={(p) => update({ page: p > 1 ? String(p) : '' })} loading={loading} error={error} onRetry={load} />
    </div>
  )
}
