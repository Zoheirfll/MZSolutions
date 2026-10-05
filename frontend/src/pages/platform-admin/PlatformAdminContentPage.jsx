import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import Toast from '../../components/Toast'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import { AdminError } from '../../components/admin/AdminState'

const EMPTY_FAQ = { question: '', answer: '', order: 0 }

// Contenu du site (superadmin pour modifier) : FAQ du dashboard vendeur et pages légales
// publiques (/legal/<page>/). Texte brut uniquement.
export default function PlatformAdminContentPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isSuper = user?.platform_level === 'superadmin'
  const [faq, setFaq] = useState([])
  const [pages, setPages] = useState([])
  const [error, setError] = useState(false)
  const [form, setForm] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => (
    Promise.all([api.get('/platform-admin/faq/'), api.get('/platform-admin/legal-pages/')])
      .then(([f, p]) => { setFaq(f.data); setPages(p.data); setDrafts({}); setError(false) })
      .catch(() => setError(true))
  ), [])
  useEffect(() => { load() }, [load])

  const run = async (fn, ok) => {
    setBusy(true)
    try { await fn(); setToast({ type: 'success', message: ok }); await load() }
    catch (err) { setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') }) }
    finally { setBusy(false) }
  }

  const saveFaq = () => run(async () => {
    if (form.id) await api.put(`/platform-admin/faq/${form.id}/`, form)
    else await api.post('/platform-admin/faq/', form)
    setForm(null)
  }, t('Question enregistrée.'))

  if (error) return <AdminError onRetry={load} />

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="content" title={t('Contenu du site')} subtitle={t('FAQ et pages légales')}
        help={t('La FAQ s’affiche dans le dashboard des vendeurs. Les pages légales sont publiques (/legal/privacy-policy/ et /legal/terms/) ; tant qu’une page n’est pas modifiée ici, la version historique est servie. Texte brut uniquement.')} />

      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-app-primary">{t('Questions fréquentes')}</h2>
          {isSuper && <button className={theme.btn.primary} onClick={() => setForm({ ...EMPTY_FAQ })}>{t('Ajouter une question')}</button>}
        </div>
        {faq.length === 0 && <p className="text-sm text-app-muted">{t('Aucune question pour le moment.')}</p>}
        <ul className="space-y-2">
          {faq.map((f) => (
            <li key={f.id} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <p className="text-sm font-medium text-app-primary">{f.question} {!f.is_active && <span className="text-xs text-red-400">— {t('masquée')}</span>}</p>
              <p className="text-xs text-app-muted-light mt-1 whitespace-pre-line">{f.answer}</p>
              {isSuper && (
                <div className="flex gap-3 mt-2 text-xs font-medium">
                  <button className="text-violet-400" onClick={() => setForm({ ...f })}>{t('Modifier')}</button>
                  <button className="text-app-muted-light" onClick={() => run(() => api.put(`/platform-admin/faq/${f.id}/`, { is_active: !f.is_active }), t('Question mise à jour.'))}>{f.is_active ? t('Masquer') : t('Afficher')}</button>
                  <button className="text-red-400" onClick={() => run(() => api.delete(`/platform-admin/faq/${f.id}/`), t('Question supprimée.'))}>{t('Supprimer')}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {form && (
          <div className="mt-4 rounded-xl border p-4 space-y-3" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <input aria-label={t('Question')} placeholder={t('Question')} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} className={`${theme.inputDark} w-full`} />
            <textarea aria-label={t('Réponse')} placeholder={t('Réponse')} rows={4} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} className={`${theme.inputDark} w-full`} />
            <input aria-label={t('Ordre')} type="number" min={0} value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} className={`${theme.inputDark} w-24`} />
            <div className="flex gap-3">
              <button className={theme.btn.primary} disabled={busy} onClick={saveFaq}>{t('Enregistrer la question')}</button>
              <button className={theme.btn.outline} onClick={() => setForm(null)}>{t('Annuler')}</button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-app-primary mb-3">{t('Pages légales')}</h2>
        <div className="space-y-6">
          {pages.map((p) => {
            const d = drafts[p.slug] || { title: p.title, body: p.body }
            return (
              <div key={p.slug} className="rounded-xl border p-4 space-y-3" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <p className="text-sm font-medium text-app-primary">{t(p.label)} <a className="text-xs text-violet-400 ms-2" href={`/legal/${p.slug}/`} target="_blank" rel="noreferrer">/legal/{p.slug}/</a></p>
                <input aria-label={`${t('Titre')} — ${p.slug}`} placeholder={t('Titre')} value={d.title} disabled={!isSuper} onChange={(e) => setDrafts({ ...drafts, [p.slug]: { ...d, title: e.target.value } })} className={`${theme.inputDark} w-full`} />
                <textarea aria-label={`${t('Texte')} — ${p.slug}`} placeholder={t('Texte (une ligne vide sépare les paragraphes)')} rows={8} value={d.body} disabled={!isSuper} onChange={(e) => setDrafts({ ...drafts, [p.slug]: { ...d, body: e.target.value } })} className={`${theme.inputDark} w-full`} />
                {isSuper && <button className={theme.btn.primary} disabled={busy} onClick={() => run(() => api.put(`/platform-admin/legal-pages/${p.slug}/`, d), t('Page enregistrée.'))}>{t('Enregistrer la page')}</button>}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
