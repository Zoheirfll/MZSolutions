import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-DZ') : '—')
const EMPTY = { title: '', body: '', audience: 'all', level: 'info', send_email: false }
const AUDIENCE_LABEL = { all: 'Tous les vendeurs', trial: 'En essai', subscribed: 'Abonnés', expired: 'Essai ou abonnement expiré' }

// Annonces aux vendeurs (superadmin) : bandeau dans leur dashboard, email facultatif.
// Texte brut uniquement. L'email exige la confirmation du nombre exact de destinataires.
export default function PlatformAdminAnnouncementsPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const audienceOptions = Object.keys(AUDIENCE_LABEL).map((k) => ({ value: k, label: t(AUDIENCE_LABEL[k]) }))
  const levelOptions = [{ value: 'info', label: t('Information') }, { value: 'warning', label: t('Avertissement') }]

  const load = useCallback(() => (
    api.get('/platform-admin/announcements/')
      .then(({ data }) => { setRows(data.results); setError('') })
      .catch(() => setError(t('Impossible de charger les annonces.')))
      .finally(() => setLoading(false))
  ), [t])

  useEffect(() => { load() }, [load])

  // Aperçu du nombre exact d'emails dès que « envoyer par email » est coché.
  useEffect(() => {
    if (!form?.send_email) { setPreview(null); return }
    let alive = true
    api.post('/platform-admin/announcements/preview/', { audience: form.audience })
      .then(({ data }) => { if (alive) setPreview(data) }).catch(() => { if (alive) setPreview(null) })
    return () => { alive = false }
  }, [form?.send_email, form?.audience])

  const create = async () => {
    setBusy(true)
    try {
      await api.post('/platform-admin/announcements/', { ...form, confirm_count: form.send_email ? preview?.emails : undefined })
      setToast({ type: 'success', message: t('Annonce publiée.') })
      setForm(null)
      await load()
    } catch (err) {
      if (err.response?.status === 409) setPreview((p) => ({ ...p, emails: err.response.data.count }))
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (row) => {
    try {
      await api.put(`/platform-admin/announcements/${row.id}/`, { is_active: !row.is_active })
      await load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    }
  }

  const columns = [
    { key: 'title', label: t('Annonce'), render: (r) => (<div><p className="font-medium">{r.title}</p><p className="text-xs text-app-muted line-clamp-2">{r.body}</p></div>) },
    { key: 'audience', label: t('Audience'), render: (r) => t(AUDIENCE_LABEL[r.audience]) },
    { key: 'level', label: t('Niveau'), render: (r) => <span className={r.level === 'warning' ? theme.badge.warning : theme.badge.info}>{r.level === 'warning' ? t('Avertissement') : t('Information')}</span> },
    { key: 'emailed_count', label: t('Emails'), render: (r) => r.emailed_count || '—' },
    { key: 'created_at', label: t('Créée le'), render: (r) => date(r.created_at) },
    { key: 'is_active', label: t('Statut'), render: (r) => <span className={r.is_active ? theme.badge.success : theme.badge.neutral}>{r.is_active ? t('Active') : t('Désactivée')}</span> },
  ]

  const canSend = form && form.title.trim() && form.body.trim() && (!form.send_email || (preview && preview.emails <= preview.max))

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="announcements" title={t('Annonces')} subtitle={t('Messages affichés aux vendeurs')}
        actions={<button onClick={() => setForm({ ...EMPTY })} className={theme.btn.primary}>{t('Nouvelle annonce')}</button>}
        help={t('Une annonce s\'affiche en bandeau dans le dashboard des vendeurs ciblés, tant qu\'elle est active. La cible est évaluée à l\'affichage : une boutique qui passe d\'essai à abonnée cesse de voir une annonce « en essai ». L\'envoi par email est facultatif et exige la confirmation du nombre exact de destinataires ; les boutiques suspendues ne reçoivent jamais rien. Texte brut uniquement.')} />

      <AdminList columns={columns} rows={rows} total={rows.length} page={1} perPage={rows.length || 1} loading={loading} error={error} onRetry={load}
        rowActions={(r) => (
          <button onClick={() => toggle(r)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{r.is_active ? t('Désactiver') : t('Réactiver')}</button>
        )} />

      <AdminConfirmModal open={!!form} title={t('Nouvelle annonce')} confirmLabel={form?.send_email ? t('Publier et envoyer') : t('Publier')} busy={busy}
        confirmDisabled={!canSend} onConfirm={create} onCancel={() => setForm(null)}>
        {form && (
          <div className="space-y-3">
            <input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('Titre')} className={`${theme.inputDark} w-full`} />
            <textarea value={form.body} maxLength={1000} rows={4} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={t('Message')} className={`${theme.inputDark} w-full`} />
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.audience} onChange={(v) => setForm({ ...form, audience: v })} options={audienceOptions} className={`${theme.inputDark} w-full`} />
              <Select value={form.level} onChange={(v) => setForm({ ...form, level: v })} options={levelOptions} className={`${theme.inputDark} w-full`} />
            </div>
            <label className="flex items-center gap-2 text-sm text-app-muted-light">
              <input type="checkbox" checked={form.send_email} onChange={(e) => setForm({ ...form, send_email: e.target.checked })} className="accent-violet-600" />
              {t('Envoyer aussi par email')}
            </label>
            {form.send_email && preview && (
              <p className={`text-xs ${preview.emails > preview.max ? 'text-red-400' : 'text-app-muted-light'}`}>
                {t('{{n}} email(s) seront envoyés (plafond {{max}}).', { n: preview.emails, max: preview.max })}
              </p>
            )}
          </div>
        )}
      </AdminConfirmModal>
    </div>
  )
}
