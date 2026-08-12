import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import RichEditor from '../../components/RichEditor'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'

function parseApiError(data) {
  if (!data) return 'Erreur.'
  if (data.detail) return data.detail
  if (data.non_field_errors) return data.non_field_errors[0]
  if (data.slug) return `Slug : ${Array.isArray(data.slug) ? data.slug[0] : data.slug}`
  const firstKey = Object.keys(data)[0]
  if (firstKey) {
    const v = data[firstKey]
    return `${firstKey} : ${Array.isArray(v) ? v[0] : v}`
  }
  return 'Erreur.'
}

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 100)
}

const PAGE_TYPES = [
  { value: 'about', label: 'À propos' },
  { value: 'faq',   label: 'FAQ' },
  { value: 'terms', label: 'Conditions générales' },
  { value: 'custom', label: 'Page libre' },
]

export default function PageFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    title: '', slug: '', content: '', page_type: 'custom', is_published: true, order: 0,
    meta_title: '', meta_description: '',
  })
  const [slugManual, setSlugManual] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (!isEdit) return
    api.get(`/stores/pages/${id}/`).then(({ data }) => {
      setForm(data)
      setSlugManual(true)
    }).catch(() => navigate('/dashboard/boutique/pages'))
  }, [id])

  const setTitle = (t) => {
    setForm(f => ({ ...f, title: t, slug: slugManual ? f.slug : slugify(t) }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await api.put(`/stores/pages/${id}/`, form)
      } else {
        await api.post('/stores/pages/', form)
      }
      navigate('/dashboard/boutique/pages')
    } catch (err) {
      setError(parseApiError(err.response?.data))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout title={isEdit ? 'Modifier la page' : 'Nouvelle page'} subtitle="Ici vous rédigez le contenu d'une page de votre boutique (comme un article dans un traitement de texte) : donnez-lui un titre, écrivez le texte avec l'éditeur (gras, images, liens possibles), et choisissez l'adresse web (URL) où elle sera visible. Dès que vous enregistrez, la page est immédiatement en ligne et consultable par vos clients.">
      <form onSubmit={submit} className="max-w-3xl space-y-5">

        {/* Titre + type */}
        <div className="rounded-2xl p-5 border space-y-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <div>
            <label className={theme.labelDark}>Titre *</label>
            <input value={form.title} onChange={e => setTitle(e.target.value)} required className={theme.inputDark} placeholder="À propos de nous" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={theme.labelDark}>Slug (URL)</label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 rounded-l-xl text-xs border-y border-l text-app-muted"
                  style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card-alt)' }}>
                  /pages/
                </span>
                <input value={form.slug}
                  onChange={e => { setSlugManual(true); setForm(f => ({ ...f, slug: e.target.value })) }}
                  className="flex-1 px-3 py-2.5 text-sm text-app-primary rounded-r-xl border outline-none font-mono"
                  style={{ background: 'var(--bg-card-alt)', borderColor: 'var(--border-color)' }}
                  placeholder="a-propos" />
              </div>
            </div>
            <div>
              <label className={theme.labelDark}>Type</label>
              <Select value={form.page_type} onChange={v => setForm(f => ({ ...f, page_type: v }))}
                options={PAGE_TYPES} className={theme.inputDark} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${form.is_published ? 'bg-violet-600' : 'bg-violet-500/15'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_published ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm" style={{ color: form.is_published ? '#a78bfa' : theme.dark.muted }}>
              {form.is_published ? 'Publiée — visible sur la boutique' : 'Brouillon — non visible'}
            </span>
          </div>
        </div>

        {/* Contenu */}
        <div>
          <label className={`${theme.labelDark} mb-2 block`}>Contenu</label>
          <RichEditor value={form.content} onChange={html => setForm(f => ({ ...f, content: html }))} />
        </div>

        {/* SEO */}
        <div className="rounded-2xl p-5 border space-y-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: theme.dark.mutedLight }}>Référencement (SEO)</p>
            <p className="text-xs" style={{ color: theme.dark.muted }}>Laissez vide pour utiliser le titre/un extrait du contenu par défaut.</p>
          </div>
          <div>
            <label className={theme.labelDark}>Titre (balise &lt;title&gt;)</label>
            <input value={form.meta_title || ''} onChange={e => setForm(f => ({ ...f, meta_title: e.target.value }))}
              maxLength={70} className={theme.inputDark} placeholder={form.title || 'Titre de la page'} />
          </div>
          <div>
            <label className={theme.labelDark}>Description (meta description)</label>
            <textarea value={form.meta_description || ''} onChange={e => setForm(f => ({ ...f, meta_description: e.target.value }))}
              rows={2} maxLength={160} className={`${theme.inputDark} resize-none`} placeholder="Résumé affiché dans les résultats Google" />
          </div>
        </div>

        {error && <p className={theme.errorText}>{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className={theme.btn.primary}>
            {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer la page'}
          </button>
          {isEdit && form.is_published && user?.store_slug && (
            <a href={`/store/${user.store_slug}/pages/${form.slug}`} target="_blank" rel="noreferrer"
              className="text-sm font-medium transition-colors" style={{ color: theme.dark.mutedLight }}>
              Aperçu →
            </a>
          )}
          <button type="button" onClick={() => navigate('/dashboard/boutique/pages')}
            className={theme.btn.secondary}>
            Annuler
          </button>
        </div>
      </form>
    </DashboardLayout>
  )
}
