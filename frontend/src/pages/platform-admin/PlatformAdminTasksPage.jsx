import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'
import { AdminError } from '../../components/admin/AdminState'

const REFRESH_MS = 30_000
const dateTime = (v) => (v ? new Date(v).toLocaleString('fr-DZ') : '—')
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`)
const STATUS = {
  ok: { label: 'OK', cls: theme.badge.success }, running: { label: 'En cours', cls: theme.badge.info },
  overdue: { label: 'En retard', cls: theme.badge.warning }, error: { label: 'En erreur', cls: theme.badge.danger },
  never: { label: 'Jamais exécutée', cls: theme.badge.neutral },
}
const BACKUP_STATE = {
  ok: { label: 'Sauvegarde récente', cls: theme.badge.success }, warning: { label: 'Sauvegarde ancienne', cls: theme.badge.warning },
  error: { label: 'Aucune sauvegarde récente', cls: theme.badge.danger }, unconfigured: { label: 'Non configuré', cls: theme.badge.neutral },
}

// Tâches planifiées (dernier passage, retard) et sauvegardes de la base (lecture seule).
// « Jamais exécutée » = la tâche n'est probablement PAS planifiée sur le serveur.
export default function PlatformAdminTasksPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isSuper = user?.platform_level === 'superadmin'
  const [tasks, setTasks] = useState([])
  const [backups, setBackups] = useState(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => (
    Promise.all([api.get('/platform-admin/tasks/'), api.get('/platform-admin/backups/')])
      .then(([tk, bk]) => { setTasks(tk.data.results); setBackups(bk.data); setError('') })
      .catch(() => setError(t('Impossible de charger les tâches.')))
  ), [t])

  useEffect(() => {
    load()
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const run = async () => {
    setBusy(true)
    try {
      await api.post(`/platform-admin/tasks/${confirm.name}/run/`)
      setToast({ type: 'success', message: t('Tâche lancée en arrière-plan.') })
      setConfirm(null)
      setTimeout(load, 2000)
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'label', label: t('Tâche'), render: (r) => (<div><p className="font-medium">{t(r.label)}</p><p className="text-xs text-app-muted">{r.name} — {t('toutes les {{n}} min', { n: r.interval_minutes })}</p></div>) },
    { key: 'status', label: t('Statut'), render: (r) => (<div><span className={STATUS[r.status].cls}>{t(STATUS[r.status].label)}</span>{r.last_message && <p className="text-xs text-red-400 mt-1">{r.last_message}</p>}</div>) },
    { key: 'last_finished_at', label: t('Dernier passage'), render: (r) => dateTime(r.last_finished_at) },
    { key: 'runs_count', label: t('Passages') },
  ]
  const bk = backups ? BACKUP_STATE[backups.state] : null

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="tasks" title={t('Tâches et sauvegardes')} subtitle={t('Ce qui tourne en arrière-plan')}
        help={t('Chaque tâche planifiée enregistre son dernier passage. « En retard » : aucun passage réussi depuis plus de deux intervalles. « Jamais exécutée » : la tâche n\'est probablement pas planifiée sur le serveur. Le lancement manuel (superadmin) démarre la tâche en arrière-plan. Les sauvegardes sont en lecture seule : l\'application ne peut ni en créer ni en supprimer.')} />

      {error && !tasks.length ? <AdminError message={error} onRetry={load} /> : (
        <AdminList columns={columns} rows={tasks.map((r) => ({ ...r, id: r.name }))} total={tasks.length} page={1} perPage={tasks.length || 1}
          rowActions={isSuper ? (r) => (
            <button onClick={() => setConfirm(r)} disabled={r.status === 'running'} className="text-violet-400 hover:text-violet-300 text-xs font-medium disabled:opacity-40">{t('Lancer')}</button>
          ) : undefined} />
      )}

      <div className="flex items-center gap-3 mt-10 mb-3">
        <h2 className="text-sm font-semibold text-app-primary">{t('Sauvegardes de la base')}</h2>
        {bk && <span className={bk.cls}>{t(bk.label)}</span>}
      </div>
      {backups && !backups.configured && <p className="text-sm text-app-muted">{t('Aucun dossier de sauvegardes n\'est monté sur le serveur.')}</p>}
      {backups?.configured && (
        <div className="rounded-xl border divide-y" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          {backups.results.length === 0 ? <p className="p-4 text-sm text-app-muted">{t('Aucune sauvegarde trouvée.')}</p> : backups.results.slice(0, 10).map((f) => (
            <div key={f.name} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
              <span className="text-app-primary break-all">{f.name}</span>
              <span className="text-xs text-app-muted shrink-0">{size(f.size)} — {dateTime(f.modified_at)}</span>
            </div>
          ))}
        </div>
      )}

      <AdminConfirmModal open={!!confirm} title={t('Lancer la tâche')} confirmLabel={t('Lancer')} busy={busy} onConfirm={run} onCancel={() => setConfirm(null)}
        message={confirm ? t('« {{label}} » va démarrer en arrière-plan. Elle ne peut pas être relancée pendant 15 minutes.', { label: t(confirm.label) }) : ''} />
    </div>
  )
}
