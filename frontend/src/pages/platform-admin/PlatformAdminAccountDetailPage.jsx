import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Toast from '../../components/Toast'
import Select from '../../components/Select'
import { useAuth } from '../../context/AuthContext'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'
import { AdminError } from '../../components/admin/AdminState'
import StoreStateBadge from '../../components/admin/StoreStateBadge'

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-DZ') : '—')
const money = (v) => `${Number(v || 0).toLocaleString('fr-DZ')} DA`
const MIN_REASON = 5

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-app-muted">{label}</p>
      <p className="text-sm text-app-primary break-all">{value || '—'}</p>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <h2 className="text-sm font-semibold text-app-primary mb-4">{title}</h2>
      {children}
    </div>
  )
}

// Fiche d'une boutique : informations, quota, activité récente et actions de
// modération (suspendre/réactiver avec motif, déconnexion forcée, reset mot de passe).
export default function PlatformAdminAccountDetailPage() {
  const { t } = useTranslation()
  const { storeId } = useParams()
  const { user } = useAuth()
  const isSuper = user?.platform_level === 'superadmin'
  const [grant, setGrant] = useState({ action: 'add_orders', value: '', plan_id: '' })
  const [plans, setPlans] = useState([])
  const [integrations, setIntegrations] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [modal, setModal] = useState(null) // 'suspend' | 'reactivate' | 'logout' | 'reset'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => {
    return api.get(`/platform-admin/accounts/${storeId}/`)
      .then(({ data: d }) => { setData(d); setError(false) })
      .catch(() => setError(true))
  }, [storeId])

  useEffect(() => { load() }, [load])

  // Intégrations : secondaire, jamais bloquant (une erreur laisse simplement le panneau vide).
  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => api.get(`/platform-admin/accounts/${storeId}/integrations/`))
      .then((res) => { if (alive && Array.isArray(res?.data?.carriers)) setIntegrations(res.data) }).catch(() => {})
    return () => { alive = false }
  }, [storeId])

  // Les paliers ne sont nécessaires que pour « offrir un palier ».
  useEffect(() => {
    if (modal !== 'grant') return
    api.get('/platform-admin/plans/').then(({ data: d }) => setPlans(d.results.filter((p) => p.is_active))).catch(() => {})
  }, [modal])

  const close = () => { setModal(null); setReason(''); setGrant({ action: 'add_orders', value: '', plan_id: '' }) }

  const run = async (path, body, okMessage) => {
    setBusy(true)
    try {
      await api.post(`/platform-admin/accounts/${storeId}/${path}/`, body)
      setToast({ type: 'success', message: okMessage })
      close()
      await load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <AdminError message={t('Impossible de charger cette boutique.')} onRetry={load} />
  if (!data) return <div className="py-16 text-center text-sm text-app-muted">{t('Chargement…')}</div>

  const suspended = data.state === 'suspended'
  const modals = {
    suspend: { title: t('Suspendre cette boutique'), confirmLabel: t('Suspendre'), danger: true,
      message: t('Le vendeur et son équipe ne pourront plus se connecter, la vitrine sera indisponible. Les données sont conservées.'),
      onConfirm: () => run('suspend', { reason: reason.trim() }, t('Boutique suspendue.')), disabled: reason.trim().length < MIN_REASON },
    reactivate: { title: t('Réactiver cette boutique'), confirmLabel: t('Réactiver'),
      message: t('Le vendeur et son équipe pourront de nouveau se connecter.'),
      onConfirm: () => run('reactivate', {}, t('Boutique réactivée.')) },
    logout: { title: t('Forcer la déconnexion'), confirmLabel: t('Déconnecter'), danger: true,
      message: t('Toutes les sessions du vendeur et de son équipe seront révoquées. Un jeton déjà émis reste valable jusqu\'à son expiration.'),
      onConfirm: () => run('force-logout', {}, t('Sessions révoquées.')) },
    grant: { title: t('Geste commercial'), confirmLabel: t('Appliquer'),
      message: t('Ajoutez du quota, prolongez l\'essai ou offrez un palier. Le motif est obligatoire et l\'action est journalisée.'),
      onConfirm: () => run('grant', { ...grant, value: Number(grant.value), reason: reason.trim() }, t('Geste commercial appliqué.')),
      disabled: reason.trim().length < MIN_REASON || !grant.value || (grant.action === 'grant_plan' && !grant.plan_id) },
    reset: { title: t('Réinitialiser le mot de passe'), confirmLabel: t('Envoyer le lien'),
      message: t('Un lien de réinitialisation sera envoyé par email au propriétaire. Vous ne voyez jamais son mot de passe.'),
      onConfirm: () => run('reset-password', {}, t('Lien envoyé.')) },
  }
  const m = modal ? modals[modal] : null

  const actions = (
    <>
      {isSuper && <button onClick={() => setModal('grant')} className={theme.btn.outline}>{t('Geste commercial')}</button>}
      <button onClick={() => setModal('reset')} className={theme.btn.outline}>{t('Réinitialiser le mot de passe')}</button>
      <button onClick={() => setModal('logout')} className={theme.btn.outline}>{t('Forcer la déconnexion')}</button>
      {suspended
        ? <button onClick={() => setModal('reactivate')} className={theme.btn.primary}>{t('Réactiver')}</button>
        : <button onClick={() => setModal('suspend')} className={theme.btn.danger}>{t('Suspendre')}</button>}
    </>
  )

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <Link to="/plateforme/comptes" className={`${theme.btn.ghost} mb-4`}>{t('← Comptes')}</Link>
      <AdminPageHeader pageKey="account-detail" title={data.name} subtitle={`/${data.slug}`} actions={actions}
        help={t('Fiche de la boutique : coordonnées du propriétaire, quota, activité et derniers paiements d\'abonnement. Toutes les actions de cette page sont enregistrées dans le journal d\'audit.')} />

      {suspended && (
        <div className="rounded-xl border p-4 mb-6 text-sm" style={{ background: theme.dark.card, borderColor: '#7f1d1d' }}>
          <p className="text-red-400 font-medium">{t('Boutique suspendue depuis le {{d}}', { d: date(data.suspended_at) })}</p>
          <p className="text-app-muted-light mt-1">{t('Motif')} : {data.suspension_reason}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={t('Boutique')}>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs text-app-muted mb-1">{t('État')}</p><StoreStateBadge state={data.state} /></div>
            <Field label={t('Inscrite le')} value={date(data.created_at)} />
            <Field label={t('Téléphone')} value={data.phone} />
            <Field label={t('Email')} value={data.email} />
          </div>
        </Panel>

        <Panel title={t('Propriétaire')}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Nom')} value={data.owner.first_name + ' ' + data.owner.last_name} />
            <Field label={t('Email')} value={data.owner.email} />
            <Field label={t('Téléphone')} value={data.owner.phone} />
            <Field label={t('Dernière connexion')} value={date(data.owner.last_login)} />
          </div>
        </Panel>

        <Panel title={t('Abonnement et quota')}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Palier')} value={data.quota?.plan} />
            <Field label={t('Commandes')} value={data.quota ? `${data.quota.orders_used} / ${data.quota.orders_limit}` : null} />
            <Field label={t('Fin d\'essai')} value={date(data.quota?.trial_ends_at)} />
            <Field label={t('Fin de période payée')} value={date(data.quota?.period_end)} />
          </div>
        </Panel>

        <Panel title={t('Activité')}>
          <div className="grid grid-cols-3 gap-4">
            <Field label={t('Commandes')} value={data.counts.orders} />
            <Field label={t('Produits')} value={data.counts.products} />
            <Field label={t('Équipe active')} value={data.counts.team_members} />
          </div>
        </Panel>
      </div>

      {integrations && (
        <div className="mt-4">
          <Panel title={t('Intégrations')}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-app-muted mb-1">{t('Transporteurs')}</p>
                {integrations.carriers.length === 0 ? <p className="text-app-muted">—</p> : integrations.carriers.map((c) => (
                  <p key={c.carrier} className="text-app-primary">{c.label}{c.is_default ? ` (${t('défaut')})` : ''}{!c.is_active ? ` — ${t('inactif')}` : ''}</p>
                ))}
              </div>
              <div>
                <p className="text-xs text-app-muted mb-1">{t('Canaux de vente')}</p>
                {integrations.channels.length === 0 ? <p className="text-app-muted">—</p> : integrations.channels.map((c) => (
                  <p key={c.channel} className="text-app-primary">{c.label}{!c.is_active ? ` — ${t('inactif')}` : ''}</p>
                ))}
              </div>
              <div>
                <p className="text-xs text-app-muted mb-1">{t('Webhooks et pixels')}</p>
                <p className="text-app-primary">{t('{{a}} webhook(s) actif(s) sur {{n}}', { a: integrations.webhooks.active, n: integrations.webhooks.total })}</p>
                {integrations.webhooks.failing > 0 && <p className="text-amber-400">{t('{{n}} en échec', { n: integrations.webhooks.failing })}</p>}
                <p className="text-app-primary">{t('{{n}} pixel(s) actif(s)', { n: integrations.pixels })}</p>
              </div>
            </div>
          </Panel>
        </div>
      )}

      <div className="mt-4">
        <Panel title={t('Derniers paiements d\'abonnement')}>
          {data.recent_payments.length === 0 ? <p className="text-sm text-app-muted">{t('Aucun paiement.')}</p> : (
            <ul className="divide-y" style={{ borderColor: theme.dark.border }}>
              {data.recent_payments.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-app-primary">{p.plan} — {money(p.amount)}</span>
                  <span className="text-app-muted">{date(p.created_at)} · {p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <AdminConfirmModal open={!!m} title={m?.title} message={m?.message} confirmLabel={m?.confirmLabel} danger={m?.danger}
        busy={busy} confirmDisabled={m?.disabled} onConfirm={m?.onConfirm} onCancel={close}>
        {modal === 'suspend' && (
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300}
            placeholder={t('Motif de la suspension (obligatoire)')} className={`${theme.inputDark} w-full`} />
        )}
        {modal === 'grant' && (
          <div className="space-y-3">
            <Select value={grant.action} onChange={(v) => setGrant({ ...grant, action: v })} className={`${theme.inputDark} w-full`}
              options={[{ value: 'add_orders', label: t('Ajouter des commandes') }, { value: 'extend_trial', label: t('Prolonger l\'essai (jours)') }, { value: 'grant_plan', label: t('Offrir un palier (mois)') }]} />
            {grant.action === 'grant_plan' && (
              <Select value={grant.plan_id} onChange={(v) => setGrant({ ...grant, plan_id: v })} className={`${theme.inputDark} w-full`}
                options={[{ value: '', label: t('Choisir un palier') }, ...plans.map((p) => ({ value: String(p.id), label: p.name }))]} />
            )}
            <input type="number" min={1} value={grant.value} onChange={(e) => setGrant({ ...grant, value: e.target.value })}
              placeholder={grant.action === 'add_orders' ? t('Nombre de commandes') : grant.action === 'extend_trial' ? t('Nombre de jours') : t('Nombre de mois')}
              className={`${theme.inputDark} w-full`} />
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300}
              placeholder={t('Motif (obligatoire)')} className={`${theme.inputDark} w-full`} />
          </div>
        )}
      </AdminConfirmModal>
    </div>
  )
}
