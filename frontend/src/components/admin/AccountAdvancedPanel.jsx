import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Toast from '../Toast'
import AdminConfirmModal from './AdminConfirmModal'

const MIN_REASON = 5
const KEYWORD = 'ANONYMISER'

// Gestion avancée d'une boutique (superadmin) : modifier, transférer la propriété, export
// RGPD, anonymisation (irréversible, boutique suspendue d'abord + mot-clé).
export default function AccountAdvancedPanel({ data, onChanged }) {
  const { t } = useTranslation()
  const [modal, setModal] = useState(null) // 'edit' | 'transfer' | 'anonymize'
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const base = `/platform-admin/accounts/${data.id}`
  const suspended = data.state === 'suspended'
  const anonymized = (data.owner?.email || '').endsWith('@anonymise.invalid')

  const open = (kind) => {
    setForm(kind === 'edit' ? { name: data.name, slug: data.slug, phone: data.phone || '', email: data.email || '' } : {})
    setModal(kind)
  }
  const close = () => { setModal(null); setForm({}) }

  const run = async (fn, okMessage) => {
    setBusy(true)
    try {
      await fn()
      setToast({ type: 'success', message: okMessage })
      close()
      await onChanged?.()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  const exportData = async () => {
    try {
      const { data: blob } = await api.get(`${base}/export/`, { responseType: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export-${data.slug}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setToast({ type: 'error', message: t('Export impossible.') })
    }
  }

  const reasonOk = (form.reason || '').trim().length >= MIN_REASON
  const field = (key, label, props = {}) => (
    <label className="block text-xs text-app-muted">
      {label}
      <input value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={`${theme.inputDark} w-full mt-1`} {...props} />
    </label>
  )
  const reasonField = (
    <textarea value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} maxLength={300}
      placeholder={t('Motif (obligatoire)')} className={`${theme.inputDark} w-full`} />
  )

  const cfg = {
    edit: { title: t('Modifier la boutique'), confirmLabel: t('Enregistrer'), disabled: !form.name || !form.slug,
      onConfirm: () => run(() => api.put(`${base}/edit/`, form), t('Boutique modifiée.')),
      body: (
        <div className="space-y-3">
          {field('name', t('Nom'))}
          {field('slug', t('Slug (adresse publique)'))}
          <p className="text-xs text-amber-400">{t('Changer le slug change l\'adresse publique de la boutique : les anciens liens cesseront de fonctionner.')}</p>
          <div className="grid grid-cols-2 gap-3">{field('phone', t('Téléphone'))}{field('email', t('Email'))}</div>
        </div>
      ) },
    transfer: { title: t('Transférer la propriété'), confirmLabel: t('Transférer'), danger: true, disabled: !form.new_owner_email || !reasonOk,
      onConfirm: () => run(() => api.post(`${base}/transfer/`, { new_owner_email: form.new_owner_email, reason: form.reason.trim() }), t('Propriété transférée.')),
      message: t('Le nouveau propriétaire doit avoir un compte existant, sans boutique ni équipe. L\'ancien propriétaire garde son compte, sans boutique.'),
      body: (<div className="space-y-3">{field('new_owner_email', t('Email du nouveau propriétaire'))}{reasonField}</div>) },
    anonymize: { title: t('Anonymiser le vendeur'), confirmLabel: t('Anonymiser définitivement'), danger: true, disabled: form.confirm !== KEYWORD || !reasonOk,
      onConfirm: () => run(() => api.post(`${base}/anonymize/`, { confirm: form.confirm, reason: form.reason.trim() }), t('Données anonymisées.')),
      message: t('Irréversible. Le nom, l\'email, le téléphone du propriétaire et de son équipe sont effacés, ainsi que l\'historique de connexion et les messages. Les commandes, produits et paiements sont conservés.'),
      body: (
        <div className="space-y-3">
          {field('confirm', t('Tapez {{kw}} pour confirmer', { kw: KEYWORD }), { autoComplete: 'off' })}
          {reasonField}
        </div>
      ) },
  }
  const m = modal ? cfg[modal] : null

  return (
    <div className="rounded-xl border p-5 mt-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <h2 className="text-sm font-semibold text-app-primary mb-1">{t('Gestion avancée')}</h2>
      <p className="text-xs text-app-muted mb-4">{t('Superadmin uniquement. Toutes ces actions sont enregistrées dans le journal d\'audit.')}</p>
      {anonymized ? (
        <p className="text-sm text-app-muted">{t('Cette boutique est anonymisée : aucune action n\'est possible.')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => open('edit')} className={theme.btn.outline}>{t('Modifier')}</button>
          <button onClick={() => open('transfer')} className={theme.btn.outline}>{t('Transférer la propriété')}</button>
          <button onClick={exportData} className={theme.btn.outline}>{t('Exporter les données (RGPD)')}</button>
          <button onClick={() => open('anonymize')} disabled={!suspended} title={suspended ? '' : t('Suspendez d\'abord la boutique')} className={theme.btn.danger}>{t('Anonymiser')}</button>
        </div>
      )}
      {!anonymized && !suspended && <p className="text-xs text-app-muted mt-3">{t('L\'anonymisation n\'est possible que sur une boutique suspendue.')}</p>}

      <AdminConfirmModal open={!!m} title={m?.title} message={m?.message} confirmLabel={m?.confirmLabel} danger={m?.danger}
        busy={busy} confirmDisabled={m?.disabled} onConfirm={m?.onConfirm} onCancel={close}>
        {m?.body}
      </AdminConfirmModal>
    </div>
  )
}
