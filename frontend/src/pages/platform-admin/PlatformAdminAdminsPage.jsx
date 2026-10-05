import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-DZ') : '—')
const EMPTY = { email: '', first_name: '', last_name: '', level: 'admin' }

// Administrateurs de la plateforme (superadmin uniquement). Le compte n'est
// jamais supprimé : « Retirer » ne fait que lui enlever l'accès admin. Vous ne
// pouvez ni modifier ni retirer votre propre compte (garde-fou serveur).
export default function PlatformAdminAdminsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(null) // null = fermé
  const [revoke, setRevoke] = useState(null)
  const [created, setCreated] = useState(null) // { email, link } juste après une création
  const [busy, setBusy] = useState(false)

  // Trois types de comptes, exclusifs : le service de confirmation et l'administration de la
  // plateforme sont deux accès distincts (un « admin de service » ne voit rien de la plateforme).
  const levelOptions = [
    { value: 'service', label: t('Admin de service de confirmation') },
    { value: 'admin', label: t('Admin de la plateforme') },
    { value: 'superadmin', label: t('Superadmin de la plateforme') },
  ]

  const load = useCallback(() => {
    return api.get('/platform-admin/admins/')
      .then(({ data }) => { setRows(data.results); setError('') })
      .catch(() => setError(t('Impossible de charger les administrateurs.')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  const call = async (fn, okMessage, after) => {
    setBusy(true)
    try {
      await fn()
      setToast({ type: 'success', message: okMessage })
      after?.()
      await load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  // Après création : on affiche le lien d'activation (usage unique) au superadmin, au cas où
  // l'adresse saisie ne recevrait pas l'email.
  const create = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/platform-admin/admins/', form)
      setCreated({ email: data.email, link: data.activation_link })
      setForm(null)
      await load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(created.link); setToast({ type: 'success', message: t('Lien copié.') }) }
    catch { setToast({ type: 'error', message: t('Copie impossible, sélectionnez le lien à la main.') }) }
  }
  const changeLevel = (row, level) => call(() => api.put(`/platform-admin/admins/${row.id}/`, { level }), t('Niveau mis à jour.'))
  const doRevoke = () => call(() => api.delete(`/platform-admin/admins/${revoke.id}/`), t('Accès retiré.'), () => setRevoke(null))

  const columns = [
    { key: 'name', label: t('Nom'), render: (r) => `${r.first_name} ${r.last_name}`.trim() || '—' },
    { key: 'email', label: t('Email') },
    { key: 'level', label: t('Niveau'), render: (r) => (
      <Select value={r.level} onChange={(v) => changeLevel(r, v)} options={levelOptions} disabled={r.id === user?.id}
        className={`${theme.inputDark} w-60 py-1.5 text-xs`} />
    ) },
    { key: 'last_login', label: t('Dernière connexion'), render: (r) => date(r.last_login) },
  ]

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="admins" title={t('Comptes administrateurs')} subtitle={t('Service de confirmation et administration de la plateforme')}
        actions={<button onClick={() => setForm({ ...EMPTY })} className={theme.btn.primary}>{t('Ajouter un administrateur')}</button>}
        help={t('Trois types de comptes, chacun avec un accès distinct. Admin de service de confirmation : gère les boutiques clientes et les confirmateurs (espace « Service de confirmation »), sans voir l’administration de la plateforme. Admin de la plateforme : consulte et modère (suspendre, déconnecter, réinitialiser un mot de passe). Superadmin de la plateforme : tout cela, plus les prix, remboursements, annonces, réglages et la création de comptes. Un compte n’a qu’un seul type à la fois. La personne reçoit un lien pour définir son mot de passe.')} />

      <AdminList columns={columns} rows={rows} total={rows.length} page={1} perPage={rows.length || 1} loading={loading} error={error} onRetry={load}
        rowActions={(r) => (
          <button onClick={() => setRevoke(r)} disabled={r.id === user?.id} className="text-red-400 hover:text-red-300 text-xs font-medium disabled:opacity-40 disabled:pointer-events-none">
            {t('Retirer l\'accès')}
          </button>
        )} />

      <AdminConfirmModal open={!!form} title={t('Ajouter un administrateur')} confirmLabel={t('Créer')} busy={busy}
        confirmDisabled={!form?.email || !form?.first_name} onConfirm={create} onCancel={() => setForm(null)}>
        {form && (
          <div className="space-y-3">
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('Email')} className={`${theme.inputDark} w-full`} />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder={t('Prénom')} className={`${theme.inputDark} w-full`} />
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder={t('Nom')} className={`${theme.inputDark} w-full`} />
            </div>
            <Select value={form.level} onChange={(v) => setForm({ ...form, level: v })} options={levelOptions} className={`${theme.inputDark} w-full`} />
          </div>
        )}
      </AdminConfirmModal>

      <AdminConfirmModal open={!!created} title={t('Administrateur créé')} confirmLabel={t('Fermer')}
        message={created ? t('{{email}} a reçu un email d\'activation. Si l\'adresse ne reçoit pas de courrier, transmettez-lui ce lien (usage unique, durée limitée, à ne pas partager).', { email: created.email }) : ''}
        onConfirm={() => setCreated(null)} onCancel={() => setCreated(null)}>
        {created && (
          <div className="flex items-center gap-2">
            <input readOnly value={created.link} onFocus={(e) => e.target.select()} aria-label={t('Lien d\'activation')} className={`${theme.inputDark} w-full text-xs`} />
            <button onClick={copyLink} className={theme.btn.outline}>{t('Copier')}</button>
          </div>
        )}
      </AdminConfirmModal>

      <AdminConfirmModal open={!!revoke} title={t('Retirer l\'accès administrateur')} danger confirmLabel={t('Retirer')} busy={busy}
        message={revoke ? t('{{email}} perdra l\'accès à l\'administration et ses sessions seront révoquées. Son compte est conservé.', { email: revoke.email }) : ''}
        onConfirm={doRevoke} onCancel={() => setRevoke(null)} />
    </div>
  )
}
