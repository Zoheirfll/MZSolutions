import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'

const PER_PAGE = 20
const MIN_REASON = 5
const dateTime = (v) => (v ? new Date(v).toLocaleString('fr-DZ') : '—')
const ROLE_LABEL = {
  owner: 'Propriétaire de boutique', team: 'Équipe de boutique', service: 'Service de confirmation',
  admin_platform: 'Admin plateforme', superadmin_platform: 'Superadmin plateforme', none: 'Sans rôle',
}
const FILTER_ROLES = ['owner', 'team', 'platform', 'service', 'none']
const FILTER_LABEL = { ...ROLE_LABEL, platform: 'Administration plateforme' }

// Tous les utilisateurs de la plateforme. Filtres dans l'URL. Les comptes d'administration
// (plateforme / service) ne se gèrent que depuis « Administrateurs ».
export default function PlatformAdminUsersPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const role = params.get('role') || ''
  const active = params.get('active') || ''
  const page = Number(params.get('page') || 1)

  const [data, setData] = useState({ results: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [term, setTerm] = useState(search)
  const [detail, setDetail] = useState(null)
  const [deactivating, setDeactivating] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const update = useCallback((patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k) })
    setParams(next, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (term === search) return undefined
    const id = setTimeout(() => update({ search: term, page: '' }), 300)
    return () => clearTimeout(id)
  }, [term, search, update])

  const load = useCallback(() => (
    api.get('/platform-admin/users/', { params: { search: search || undefined, role: role || undefined, active: active || undefined, page, per_page: PER_PAGE } })
      .then(({ data: d }) => { setData(d); setError('') })
      .catch(() => setError(t('Impossible de charger les utilisateurs.')))
      .finally(() => setLoading(false))
  ), [search, role, active, page, t])

  useEffect(() => { load() }, [load])

  const open = async (row) => {
    try {
      const { data: d } = await api.get(`/platform-admin/users/${row.id}/`)
      setDetail(d)
    } catch {
      setToast({ type: 'error', message: t('Utilisateur introuvable.') })
    }
  }

  const act = async (path, body, okMessage) => {
    setBusy(true)
    try {
      await api.post(`/platform-admin/users/${detail.id}/${path}/`, body)
      setToast({ type: 'success', message: okMessage })
      setDeactivating(false)
      setReason('')
      setDetail(null)
      await load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  const roleOptions = [{ value: '', label: t('Tous les rôles') }, ...FILTER_ROLES.map((r) => ({ value: r, label: t(FILTER_LABEL[r]) }))]
  const activeOptions = [{ value: '', label: t('Actifs et désactivés') }, { value: '1', label: t('Actifs') }, { value: '0', label: t('Désactivés') }]
  const columns = [
    { key: 'email', label: t('Utilisateur'), render: (r) => (<div><p className="font-medium">{`${r.first_name} ${r.last_name}`.trim() || '—'}</p><p className="text-xs text-app-muted">{r.email}</p></div>) },
    { key: 'role', label: t('Rôle'), render: (r) => t(ROLE_LABEL[r.role] || r.role) },
    { key: 'store_name', label: t('Boutique'), render: (r) => r.store_name || '—' },
    { key: 'last_login', label: t('Dernière connexion'), render: (r) => dateTime(r.last_login) },
    { key: 'is_active', label: t('Statut'), render: (r) => <span className={r.is_active ? theme.badge.success : theme.badge.danger}>{r.is_active ? t('Actif') : t('Désactivé')}</span> },
  ]
  const isAdminAccount = detail && ['admin_platform', 'superadmin_platform', 'service'].includes(detail.role)

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="users" title={t('Utilisateurs')} subtitle={t('Tous les comptes de la plateforme')}
        help={t('Liste de tous les utilisateurs (vendeurs, équipes, administrateurs). Ouvrez une fiche pour voir les connexions récentes, les tentatives échouées et les sessions actives, ou désactiver le compte (motif obligatoire, sessions révoquées). Les comptes d\'administration se gèrent depuis « Administrateurs ».')} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('Email, nom ou boutique…')} className={`${theme.inputDark} w-full sm:w-72`} />
        <Select value={role} onChange={(v) => update({ role: v, page: '' })} options={roleOptions} className={`${theme.inputDark} w-56`} />
        <Select value={active} onChange={(v) => update({ active: v, page: '' })} options={activeOptions} className={`${theme.inputDark} w-52`} />
      </div>

      <AdminList columns={columns} rows={data.results} total={data.count} page={page} perPage={PER_PAGE}
        onPage={(p) => update({ page: p > 1 ? String(p) : '' })} loading={loading} error={error} onRetry={load}
        rowActions={(r) => <button onClick={() => open(r)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{t('Ouvrir')}</button>} />

      <AdminConfirmModal open={!!detail && !deactivating} title={detail ? `${detail.first_name} ${detail.last_name}`.trim() || detail.email : ''}
        confirmLabel={detail?.is_active ? t('Désactiver le compte') : t('Réactiver le compte')} danger={!!detail?.is_active}
        confirmDisabled={isAdminAccount} busy={busy}
        onConfirm={() => (detail.is_active ? setDeactivating(true) : act('reactivate', {}, t('Utilisateur réactivé.')))}
        onCancel={() => setDetail(null)}>
        {detail && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-app-muted">{detail.email} — {t(ROLE_LABEL[detail.role] || detail.role)}{detail.store_name ? ` — ${detail.store_name}` : ''}</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-lg font-semibold text-app-primary">{detail.active_sessions}</p><p className="text-xs text-app-muted">{t('Sessions actives')}</p></div>
              <div><p className={`text-lg font-semibold ${detail.failed_attempts_24h > 0 ? 'text-amber-400' : 'text-app-primary'}`}>{detail.failed_attempts_24h}</p><p className="text-xs text-app-muted">{t('Échecs 24 h')}</p></div>
              <div><p className="text-lg font-semibold text-app-primary">{detail.is_email_verified ? t('Oui') : t('Non')}</p><p className="text-xs text-app-muted">{t('Email vérifié')}</p></div>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted mb-1">{t('Connexions récentes')}</p>
              {detail.login_history.length === 0 ? <p className="text-xs text-app-muted">—</p> : detail.login_history.map((h, i) => (
                <p key={i} className="text-xs text-app-muted-light">{dateTime(h.created_at)} — {h.status} — {h.ip_address || '—'}</p>
              ))}
            </div>
            {isAdminAccount && <p className="text-xs text-amber-400">{t('Compte d\'administration : à gérer depuis « Administrateurs ».')}</p>}
          </div>
        )}
      </AdminConfirmModal>

      <AdminConfirmModal open={deactivating} title={t('Désactiver ce compte')} danger confirmLabel={t('Désactiver')} busy={busy}
        confirmDisabled={reason.trim().length < MIN_REASON} onCancel={() => { setDeactivating(false); setReason('') }}
        message={t('L\'utilisateur ne pourra plus se connecter et ses sessions seront révoquées.')}
        onConfirm={() => act('deactivate', { reason: reason.trim() }, t('Utilisateur désactivé.'))}>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder={t('Motif (obligatoire)')} className={`${theme.inputDark} w-full`} />
      </AdminConfirmModal>
    </div>
  )
}
