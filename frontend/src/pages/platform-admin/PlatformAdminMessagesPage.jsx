import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'

const PER_PAGE = 20
const dateTime = (v) => (v ? new Date(v).toLocaleString('fr-DZ') : '—')
const STATUS = { new: 'Nouveau', read: 'Lu', handled: 'Traité' }
const BADGE = { new: theme.badge.danger, read: theme.badge.info, handled: theme.badge.success }

// Messages envoyés par les vendeurs via « Contactez-nous ». Ouvrir un message le
// marque comme lu ; le corps n'est chargé que pour le message ouvert. Texte brut.
export default function PlatformAdminMessagesPage() {
  const { t } = useTranslation()
  const [data, setData] = useState({ results: [], count: 0, new_count: 0 })
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => (
    api.get('/platform-admin/contact/', { params: { status: status || undefined, search: search || undefined, page, per_page: PER_PAGE } })
      .then(({ data: d }) => { setData(d); setError('') })
      .catch(() => setError(t('Impossible de charger les messages.')))
      .finally(() => setLoading(false))
  ), [status, search, page, t])

  useEffect(() => { load() }, [load])

  const openMessage = async (row) => {
    try {
      const { data: full } = await api.get(`/platform-admin/contact/${row.id}/`)
      setOpen(full)
      load()
    } catch {
      setToast({ type: 'error', message: t('Message introuvable.') })
    }
  }

  const setMessageStatus = async (value) => {
    try {
      await api.put(`/platform-admin/contact/${open.id}/`, { status: value })
      setOpen({ ...open, status: value })
      load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    }
  }

  const statusOptions = [{ value: '', label: t('Tous les statuts') }, ...Object.keys(STATUS).map((k) => ({ value: k, label: t(STATUS[k]) }))]
  const columns = [
    { key: 'subject', label: t('Sujet'), render: (r) => <span className={r.status === 'new' ? 'font-semibold' : ''}>{r.subject}</span> },
    { key: 'store', label: t('Boutique'), render: (r) => (<div><p>{r.store_name}</p><p className="text-xs text-app-muted">{r.owner_email}</p></div>) },
    { key: 'status', label: t('Statut'), render: (r) => <span className={BADGE[r.status]}>{t(STATUS[r.status])}</span> },
    { key: 'created_at', label: t('Reçu le'), render: (r) => dateTime(r.created_at) },
  ]

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="messages" title={t('Messages')} subtitle={t('{{n}} nouveau(x)', { n: data.new_count })}
        help={t('Messages envoyés par les vendeurs depuis la page « Contactez-nous ». Chacun est rattaché à sa boutique. Ouvrir un message le marque comme lu ; marquez-le « traité » une fois la réponse envoyée (par email au propriétaire).')} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder={t('Sujet, boutique ou email…')} className={`${theme.inputDark} w-full sm:w-72`} />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={statusOptions} className={`${theme.inputDark} w-44`} />
      </div>

      <AdminList columns={columns} rows={data.results} total={data.count} page={page} perPage={PER_PAGE} onPage={setPage} loading={loading} error={error} onRetry={load}
        rowActions={(r) => <button onClick={() => openMessage(r)} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{t('Ouvrir')}</button>} />

      <AdminConfirmModal open={!!open} title={open?.subject} confirmLabel={open?.status === 'handled' ? t('Remettre en lu') : t('Marquer comme traité')}
        onConfirm={() => setMessageStatus(open.status === 'handled' ? 'read' : 'handled')} onCancel={() => setOpen(null)}>
        {open && (
          <div>
            <p className="text-xs text-app-muted mb-3">{open.store_name} — {open.owner_email} — {dateTime(open.created_at)}</p>
            <p className="text-sm text-app-primary whitespace-pre-wrap break-words">{open.body}</p>
          </div>
        )}
      </AdminConfirmModal>
    </div>
  )
}
