import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import RichEditor from '../../components/RichEditor'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

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
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    title: '', slug: '', content: '', page_type: 'custom', is_published: true, order: 0,
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
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Erreur.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout title={isEdit ? 'Modifier la page' : 'Nouvelle page'}>
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
                <span className="px-3 py-2.5 rounded-l-xl text-xs border-y border-l text-gray-500"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                  /pages/
                </span>
                <input value={form.slug}
                  onChange={e => { setSlugManual(true); setForm(f => ({ ...f, slug: e.target.value })) }}
                  className="flex-1 px-3 py-2.5 text-sm text-gray-300 rounded-r-xl border outline-none font-mono"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${form.is_published ? 'bg-violet-600' : 'bg-white/10'}`}>
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

        {error && <p className={theme.errorText}>{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className={theme.btn.primary}>
            {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer la page'}
          </button>
          <button type="button" onClick={() => navigate('/dashboard/boutique/pages')}
            className={theme.btn.secondary}>
            Annuler
          </button>
        </div>
      </form>
    </DashboardLayout>
  )
}
