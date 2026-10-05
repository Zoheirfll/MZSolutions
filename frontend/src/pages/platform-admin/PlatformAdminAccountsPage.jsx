import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import StoreStateBadge, { STATE_OPTIONS, stateLabel } from '../../components/admin/StoreStateBadge'

const PER_PAGE = 20
const date = (v) => (v ? new Date(v).toLocaleDateString('fr-DZ') : '—')

// Tous les vendeurs/boutiques de la plateforme. Filtres et page dans l'URL
// (?search=&state=&page=) : lien partageable, retour arrière fidèle.
export default function PlatformAdminAccountsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const state = params.get('state') || ''
  const page = Number(params.get('page') || 1)

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [term, setTerm] = useState(search)

  const update = useCallback((patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k) })
    setParams(next, { replace: true })
  }, [params, setParams])

  // Recherche avec délai : on ne frappe pas l'API à chaque touche.
  useEffect(() => {
    if (term === search) return undefined
    const id = setTimeout(() => update({ search: term, page: '' }), 300)
    return () => clearTimeout(id)
  }, [term, search, update])

  const load = useCallback(() => {
    return api.get('/platform-admin/accounts/', { params: { search: search || undefined, state: state || undefined, page, per_page: PER_PAGE } })
      .then(({ data }) => { setRows(data.results); setTotal(data.count); setError('') })
      .catch(() => setError(t('Impossible de charger les comptes.')))
      .finally(() => setLoading(false))
  }, [search, state, page, t])

  useEffect(() => { load() }, [load])

  const columns = [
    { key: 'name', label: t('Boutique'), render: (r) => (<div><p className="font-medium">{r.name}</p><p className="text-xs text-app-muted">/{r.slug}</p></div>) },
    { key: 'owner', label: t('Propriétaire'), render: (r) => (<div><p>{r.owner_name || '—'}</p><p className="text-xs text-app-muted">{r.owner_email}</p></div>) },
    { key: 'state', label: t('État'), render: (r) => <StoreStateBadge state={r.state} /> },
    { key: 'plan_name', label: t('Palier'), render: (r) => r.plan_name || '—' },
    { key: 'orders', label: t('Commandes'), render: (r) => `${r.orders_used} / ${r.orders_limit}` },
    { key: 'created_at', label: t('Inscrite le'), render: (r) => date(r.created_at) },
  ]

  const stateOptions = [{ value: '', label: t('Tous les états') }, ...STATE_OPTIONS.map((s) => ({ value: s, label: t(stateLabel(s)) }))]

  return (
    <div>
      <AdminPageHeader pageKey="accounts" title={t('Comptes')} subtitle={t('Tous les vendeurs de la plateforme')}
        help={t('Liste de toutes les boutiques avec leur état (essai, abonnée, expirée, suspendue). Ouvrez une fiche pour voir le détail, suspendre ou réactiver une boutique, forcer la déconnexion de ses sessions ou envoyer un lien de réinitialisation de mot de passe.')} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('Boutique, email ou slug…')}
          className={`${theme.inputDark} w-full sm:w-72`} />
        <Select value={state} onChange={(v) => update({ state: v, page: '' })} options={stateOptions} className={`${theme.inputDark} w-48`} />
      </div>

      <AdminList columns={columns} rows={rows} total={total} page={page} perPage={PER_PAGE}
        onPage={(p) => update({ page: p > 1 ? String(p) : '' })} loading={loading} error={error} onRetry={load}
        rowActions={(r) => <Link to={`/platform-admin/comptes/${r.id}`} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{t('Ouvrir')}</Link>} />
    </div>
  )
}
