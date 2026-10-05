import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'
import AiQuotaGrid from '../../components/admin/AiQuotaGrid'

const money = (v) => `${Number(v || 0).toLocaleString('fr-DZ')} DA`
const EMPTY = { name: '', orders_limit: '', price_monthly: '', price_yearly: '', features: '', order: 0, ai_daily_limit: 0, ai_weekly_limit: 0 }

// Paliers d'abonnement (superadmin). Un prix modifié ne s'applique qu'aux NOUVEAUX
// paiements ; on désactive un palier au lieu de le supprimer (des boutiques et des
// paiements y sont rattachés).
export default function PlatformAdminPlansPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catalogue, setCatalogue] = useState([])
  const [form, setForm] = useState(null) // { id?, ...champs }
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => {
    return api.get('/platform-admin/plans/')
      .then(({ data }) => { setRows(data.results); setError('') })
      .catch(() => setError(t('Impossible de charger les paliers.')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  // Catalogue des fonctionnalités IA (dynamique) pour un nouveau palier
  useEffect(() => {
    Promise.resolve().then(() => api.get('/platform-admin/settings/'))
      .then((res) => { if (Array.isArray(res?.data?.ai_quotas)) setCatalogue(res.data.ai_quotas.map((r) => ({ ...r, daily: 0, weekly: 0 }))) }).catch(() => {})
  }, [])

  const payload = (f) => ({
    name: f.name, orders_limit: f.orders_limit === '' ? null : Number(f.orders_limit),
    price_monthly: f.price_monthly, price_yearly: f.price_yearly, order: Number(f.order || 0),
    ai_daily_limit: Number(f.ai_daily_limit || 0), ai_weekly_limit: Number(f.ai_weekly_limit || 0),
    ai_quotas: Object.fromEntries((f.ai_quotas || []).map((r) => [r.key, { daily: r.daily, weekly: r.weekly }])),
    features: String(f.features).split('\n').map((s) => s.trim()).filter(Boolean),
  })

  const save = async () => {
    setBusy(true)
    try {
      if (form.id) await api.put(`/platform-admin/plans/${form.id}/`, payload(form))
      else await api.post('/platform-admin/plans/', payload(form))
      setToast({ type: 'success', message: t('Palier enregistré.') })
      setForm(null)
      await load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (row) => {
    try {
      await api.put(`/platform-admin/plans/${row.id}/`, { is_active: !row.is_active })
      await load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    }
  }

  const edit = (row) => setForm({ ...row, orders_limit: row.orders_limit ?? '', features: (row.features || []).join('\n') })
  const field = (key, label, props = {}) => (
    <label className="block text-xs text-app-muted">
      {label}
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={`${theme.inputDark} w-full mt-1`} {...props} />
    </label>
  )

  const columns = [
    { key: 'name', label: t('Palier'), render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'ai', label: t('Quotas IA (jour / semaine)'), render: (r) => {
      const limited = (r.ai_quotas || []).filter((q) => q.daily || q.weekly)
      return (
        <div className="text-xs space-y-0.5 min-w-48">
          <p className="text-app-primary">{t('Total')} : {r.ai_daily_limit || '∞'} / {r.ai_weekly_limit || '∞'}</p>
          {limited.length === 0
            ? <p className="text-app-muted">{t('Aucune limite par fonctionnalité')}</p>
            : limited.map((q) => <p key={q.key} className="text-app-muted-light">{t(q.label)} : {q.daily || '∞'} / {q.weekly || '∞'}</p>)}
        </div>
      )
    } },
    { key: 'orders_limit', label: t('Commandes'), render: (r) => (r.orders_limit == null ? t('Illimité') : r.orders_limit) },
    { key: 'price_monthly', label: t('Mensuel'), render: (r) => money(r.price_monthly) },
    { key: 'price_yearly', label: t('Annuel'), render: (r) => money(r.price_yearly) },
    { key: 'subscribers', label: t('Abonnés') },
    { key: 'is_active', label: t('Statut'), render: (r) => <span className={r.is_active ? theme.badge.success : theme.badge.neutral}>{r.is_active ? t('Actif') : t('Désactivé')}</span> },
  ]

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="plans" title={t('Paliers d\'abonnement')} subtitle={t('Prix et limites proposés aux vendeurs')}
        actions={<button onClick={() => setForm({ ...EMPTY })} className={theme.btn.primary}>{t('Nouveau palier')}</button>}
        help={t('Modifiez les prix et limites sans redéployer. Un nouveau prix ne s\'applique qu\'aux prochains paiements ; les paiements passés gardent leur montant. Un palier se désactive (jamais supprimé) : il disparaît de la page Abonnement des vendeurs mais reste attaché à ses abonnés.')} />

      <AdminList columns={columns} rows={rows} total={rows.length} page={1} perPage={rows.length || 1} loading={loading} error={error} onRetry={load}
        rowActions={(r) => (
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => edit(r)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{t('Modifier')}</button>
            <button onClick={() => toggle(r)} className="text-app-muted-light hover:text-app-primary text-xs font-medium">{r.is_active ? t('Désactiver') : t('Activer')}</button>
          </div>
        )} />

      <AdminConfirmModal open={!!form} title={form?.id ? t('Modifier le palier') : t('Nouveau palier')} confirmLabel={t('Enregistrer')} busy={busy}
        confirmDisabled={!form?.name || form?.price_monthly === '' || form?.price_yearly === ''} onConfirm={save} onCancel={() => setForm(null)}>
        {form && (
          <div className="space-y-3">
            {field('name', t('Nom'))}
            {field('orders_limit', t('Commandes incluses (vide = illimité)'), { type: 'number', min: 1 })}
            <div className="grid grid-cols-2 gap-3">
              {field('ai_daily_limit', t('Appels IA par jour (0 = illimité)'), { type: 'number', min: 0 })}
              {field('ai_weekly_limit', t('Appels IA par semaine (0 = illimité)'), { type: 'number', min: 0 })}
            </div>
            <p className="text-xs text-app-muted">{t('Limites totales pour la boutique entière, tous comptes confondus.')}</p>
            <AiQuotaGrid rows={form.ai_quotas?.length ? form.ai_quotas : catalogue} onChange={(rows) => setForm({ ...form, ai_quotas: rows })} />
            <div className="grid grid-cols-2 gap-3">
              {field('price_monthly', t('Prix mensuel (DA)'), { type: 'number', min: 0 })}
              {field('price_yearly', t('Prix annuel (DA)'), { type: 'number', min: 0 })}
            </div>
            <label className="block text-xs text-app-muted">
              {t('Caractéristiques (une par ligne)')}
              <textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} rows={3} className={`${theme.inputDark} w-full mt-1`} />
            </label>
          </div>
        )}
      </AdminConfirmModal>
    </div>
  )
}
