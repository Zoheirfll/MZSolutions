import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import { AdminError, AdminEmpty } from '../../components/admin/AdminState'

// Réglage du dispatch : quel algorithme classe les commandes, et avec quels délais/seuils, pour
// tout le site, une boutique, une date ou un jour de la semaine. Le plus spécifique l'emporte :
// boutique+date > boutique+jour > boutique > site+date > site+jour > site.
const WEIGHT_KEYS = ['age', 'attempts', 'low_rate', 'amount', 'quick_win', 'overdue']
const EMPTY_FORM = {
  id: null, store: '', when: 'always', weekday: '0', date: '', algorithm: 'fifo',
  waits: '30, 40, 50, 60', review_after: 4, fail_after_review: 4, max_open: 5, weights: {},
}

const toForm = (cfg) => ({
  id: cfg.id, store: cfg.store ? String(cfg.store) : '', algorithm: cfg.algorithm,
  when: cfg.date ? 'date' : cfg.weekday !== null ? 'weekday' : 'always',
  weekday: String(cfg.weekday ?? 0), date: cfg.date || '', waits: cfg.wait_minutes.join(', '),
  review_after: cfg.review_after, fail_after_review: cfg.fail_after_review, max_open: cfg.max_open,
  weights: cfg.weights || {},
})

export default function PlatformAdminDispatchConfigPage() {
  const { t } = useTranslation('dashboard')
  const [configs, setConfigs] = useState([])
  const [meta, setMeta] = useState(null)
  const [stores, setStores] = useState([])
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const weekdays = [t('Lundi'), t('Mardi'), t('Mercredi'), t('Jeudi'), t('Vendredi'), t('Samedi'), t('Dimanche')]

  const load = useCallback(() => {
    setError(null)
    Promise.all([
      api.get('/platform-admin/dispatch/config/'),
      api.get('/platform-admin/dispatch/meta/'),
      api.get('/platform-admin/stores/', { params: { active_only: 1, per_page: 100 } }),
    ]).then(([c, m, s]) => { setConfigs(c.data); setMeta(m.data); setStores(s.data.results || []) })
      .catch(() => setError(t('Impossible de charger les réglages.')))
  }, [t])

  useEffect(() => { load() }, [load])

  const scopeLabel = (c) => (c.store_name || t('Tout le site'))
  const whenLabel = (c) => (c.date ? c.date : c.weekday !== null ? weekdays[c.weekday] : t('Toujours'))
  const algoLabel = (key) => meta?.algorithms.find((a) => a.key === key)?.label || key

  const openNew = () => { setFormError(''); setForm({ ...EMPTY_FORM }) }
  const openEdit = (c) => { setFormError(''); setForm(toForm(c)) }
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const save = async () => {
    const waits = form.waits.split(',').map((w) => w.trim()).filter(Boolean).map(Number)
    const body = {
      algorithm: form.algorithm, wait_minutes: waits, review_after: Number(form.review_after),
      fail_after_review: Number(form.fail_after_review), max_open: Number(form.max_open),
      weights: form.algorithm === 'balanced' ? form.weights : {},
    }
    if (!form.id) {
      body.store = form.store || null
      if (form.when === 'weekday') body.weekday = Number(form.weekday)
      if (form.when === 'date') body.date = form.date
    }
    setBusy(true); setFormError('')
    try {
      if (form.id) await api.put(`/platform-admin/dispatch/config/${form.id}/`, body)
      else await api.post('/platform-admin/dispatch/config/', body)
      setForm(null); setToast({ type: 'success', message: t('Réglage enregistré.') }); load()
    } catch (err) {
      setFormError(err.response?.data?.detail || t('Échec de l\'enregistrement.'))
    } finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.delete(`/platform-admin/dispatch/config/${toDelete.id}/`)
      setToDelete(null); setToast({ type: 'success', message: t('Réglage supprimé.') }); load()
    } catch { setToast({ type: 'error', message: t('Suppression impossible.') }) } finally { setBusy(false) }
  }

  const algoDescription = meta?.algorithms.find((a) => a.key === form?.algorithm)?.description

  return (
    <div className="max-w-6xl mx-auto">
      <AdminPageHeader pageKey="dispatch-config" title={t('Algorithmes de dispatch')}
        subtitle={t('Choisissez comment les commandes sont classées et redistribuées.')}
        help={t('L\'algorithme décide quelle commande passe en premier quand il y a plus de commandes que de confirmateurs disponibles. Sans réglage, c\'est « Premier arrivé ». Un réglage de boutique l\'emporte sur celui du site, et une date ou un jour précis l\'emporte sur « toujours ».')}
        actions={<button onClick={openNew} className={theme.btn.primary}>{t('Nouveau réglage')}</button>} />

      {error ? <AdminError message={error} onRetry={load} />
        : configs.length === 0 ? <AdminEmpty title={t('Aucun réglage')} description={t('Le dispatch utilise « Premier arrivé » avec 30, 40, 50, 60 min d\'attente, signalement après 4 appels et échec après 8.')} />
        : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr>{[t('Portée'), t('Quand'), t('Algorithme'), t('Délais (min)'), t('Seuils'), t('Capacité'), ''].map((h, i) => (
                  <th key={i} className="text-start px-4 py-3 text-xs font-medium text-app-muted">{h}</th>))}</tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: theme.dark.border }}>
                    <td className="px-4 py-3 text-app-primary">{scopeLabel(c)}</td>
                    <td className="px-4 py-3 text-app-muted-light">{whenLabel(c)}</td>
                    <td className="px-4 py-3"><span className={theme.badge.info}>{c.algorithm_label}</span></td>
                    <td className="px-4 py-3 text-app-muted-light">{c.wait_minutes.join(' · ')}</td>
                    <td className="px-4 py-3 text-app-muted-light">{t('Signalée après {{a}}, échec après {{b}}', { a: c.review_after, b: c.review_after + c.fail_after_review })}</td>
                    <td className="px-4 py-3 text-app-muted-light">{c.max_open}</td>
                    <td className="px-4 py-3 text-end whitespace-nowrap">
                      <button onClick={() => openEdit(c)} className={theme.btn.ghost}>{t('Modifier')}</button>
                      <button onClick={() => setToDelete(c)} className={theme.btn.ghost}>{t('Supprimer')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {meta && (
        <div className="mt-6 rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <h2 className="text-sm font-semibold text-app-primary mb-3">{t('Les 10 algorithmes')}</h2>
          <ul className="grid md:grid-cols-2 gap-x-6 gap-y-2">
            {meta.algorithms.map((a) => (
              <li key={a.key} className="text-sm"><span className="font-medium text-app-primary">{a.label}</span>
                <span className="text-app-muted"> — {a.description}</span></li>))}
          </ul>
        </div>
      )}

      <AdminConfirmModal open={!!form} title={form?.id ? t('Modifier le réglage') : t('Nouveau réglage')}
        confirmLabel={t('Enregistrer')} busy={busy} onConfirm={save} onCancel={() => setForm(null)}>
        {form && (
          <div className="flex flex-col gap-3">
            {!form.id && (
              <>
                <div>
                  <label className={theme.labelDark}>{t('Portée')}</label>
                  <Select value={form.store} onChange={(v) => set({ store: v })} className={`${theme.inputDark} w-full`}
                    options={[{ value: '', label: t('Tout le site') }, ...stores.map((s) => ({ value: String(s.id), label: s.name }))]} />
                </div>
                <div>
                  <label className={theme.labelDark}>{t('Quand')}</label>
                  <Select value={form.when} onChange={(v) => set({ when: v })} className={`${theme.inputDark} w-full`}
                    options={[{ value: 'always', label: t('Toujours') }, { value: 'weekday', label: t('Un jour de la semaine') }, { value: 'date', label: t('Une date précise') }]} />
                </div>
                {form.when === 'weekday' && (
                  <Select value={form.weekday} onChange={(v) => set({ weekday: v })} className={`${theme.inputDark} w-full`}
                    options={weekdays.map((d, i) => ({ value: String(i), label: d }))} />)}
                {form.when === 'date' && (
                  <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={`${theme.inputDark} w-full`} />)}
              </>
            )}
            <div>
              <label className={theme.labelDark}>{t('Algorithme')}</label>
              <Select value={form.algorithm} onChange={(v) => set({ algorithm: v })} className={`${theme.inputDark} w-full`}
                options={(meta?.algorithms || []).map((a) => ({ value: a.key, label: a.label }))} />
              {algoDescription && <p className="text-xs text-app-muted mt-1">{algoDescription}</p>}
            </div>
            {form.algorithm === 'balanced' && (
              <div>
                <label className={theme.labelDark}>{t('Poids du score équilibré (0 à 10)')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {WEIGHT_KEYS.map((k) => (
                    <label key={k} className="text-xs text-app-muted">{k}
                      <input type="number" min={0} max={10} value={form.weights[k] ?? ''} placeholder={String(meta?.defaults.weights[k] ?? '')}
                        onChange={(e) => set({ weights: { ...form.weights, [k]: e.target.value === '' ? undefined : Number(e.target.value) } })}
                        className={`${theme.inputDark} w-full`} />
                    </label>))}
                </div>
              </div>
            )}
            <div>
              <label className={theme.labelDark}>{t('Délais d\'attente entre deux appels (minutes, séparés par des virgules)')}</label>
              <input value={form.waits} onChange={(e) => set({ waits: e.target.value })} className={`${theme.inputDark} w-full`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-app-muted">{t('Signalée après (appels)')}
                <input type="number" min={1} value={form.review_after} onChange={(e) => set({ review_after: e.target.value })} className={`${theme.inputDark} w-full`} />
              </label>
              <label className="text-xs text-app-muted">{t('Puis échec après (appels)')}
                <input type="number" min={1} value={form.fail_after_review} onChange={(e) => set({ fail_after_review: e.target.value })} className={`${theme.inputDark} w-full`} />
              </label>
              <label className="text-xs text-app-muted">{t('Capacité par confirmateur')}
                <input type="number" min={1} value={form.max_open} onChange={(e) => set({ max_open: e.target.value })} className={`${theme.inputDark} w-full`} />
              </label>
            </div>
            {formError && <p className="text-sm text-red-400">{formError}</p>}
          </div>
        )}
      </AdminConfirmModal>

      <AdminConfirmModal open={!!toDelete} danger title={t('Supprimer ce réglage ?')} confirmLabel={t('Supprimer')} busy={busy}
        message={toDelete ? t('« {{algo}} » ({{scope}}) ne s\'appliquera plus ; la portée suivante prendra le relais.', { algo: algoLabel(toDelete.algorithm), scope: scopeLabel(toDelete) }) : ''}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
