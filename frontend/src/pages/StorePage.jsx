import { useEffect, useRef, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { theme } from '../theme'

export default function StorePage() {
  const [store, setStore] = useState(null)
  const [form, setForm] = useState({})
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [errors, setErrors] = useState({})
  const [slugEditing, setSlugEditing] = useState(false)
  const fileInput = useRef()

  useEffect(() => {
    api.get('/stores/me/').then(({ data }) => {
      setStore(data)
      setForm({
        name: data.name, slug: data.slug, description: data.description ?? '',
        phone: data.phone ?? '', email: data.email ?? '',
        meta_title: data.meta_title ?? '', meta_description: data.meta_description ?? '',
      })
    }).catch(() => {})
  }, [])

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleLogoPick = (file) => {
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleSave = async e => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setErrors({})
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''))
      if (logoFile) fd.append('logo', logoFile)
      const { data } = await api.put('/stores/me/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setStore(data)
      setForm(f => ({ ...f, slug: data.slug }))
      setLogoFile(null)
      setLogoPreview(null)
      setSlugEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setErrors(err.response?.data || {})
    }
    finally { setSaving(false) }
  }

  const publicUrl = form.slug ? `${window.location.origin}/store/${form.slug}` : '…'

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none transition focus:border-violet-500`

  return (
    <DashboardLayout title="Ma Boutique">
      <div className="max-w-2xl">

        {/* URL publique */}
        <div
          className="rounded-xl border p-5 mb-6"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        >
          <p className="text-xs font-semibold text-app-muted-light mb-3 tracking-widest">URL PUBLIQUE DE VOTRE BOUTIQUE</p>
          {slugEditing ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 flex items-center px-4 py-3 rounded-lg border font-mono text-sm"
                style={{ borderColor: '#3d2d6e', background: '#0f0f1f' }}>
                <span className="text-app-muted mr-1 shrink-0">/store/</span>
                <input value={form.slug ?? ''} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="flex-1 bg-transparent outline-none text-violet-300" />
              </div>
              <button type="button" onClick={() => { setSlugEditing(false); setForm(f => ({ ...f, slug: store.slug })) }}
                className="px-4 py-3 rounded-lg text-sm text-app-muted-light hover:text-app-primary transition">Annuler</button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div
                className="flex-1 flex items-center px-4 py-3 rounded-lg border text-violet-300 font-mono text-sm overflow-x-auto"
                style={{ borderColor: '#3d2d6e', background: '#0f0f1f' }}
              >
                <span className="truncate">{publicUrl}</span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium transition"
                style={{ background: copied ? '#16a34a22' : '#ffffff10', color: copied ? '#4ade80' : '#a78bfa' }}
              >
                {copied ? 'Copié' : 'Copier'}
              </button>
              <button type="button" onClick={() => setSlugEditing(true)}
                className="px-4 py-3 rounded-lg text-sm font-medium transition"
                style={{ background: '#ffffff10', color: '#a78bfa' }}>
                Modifier
              </button>
            </div>
          )}
          {errors.slug && <p className="text-red-400 text-xs mt-2">{Array.isArray(errors.slug) ? errors.slug[0] : errors.slug}</p>}
        </div>

        {/* Logo */}
        <div className="rounded-xl border p-6 mb-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs font-semibold text-app-muted-light mb-4 tracking-widest">LOGO</p>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center shrink-0 border"
              style={{ borderColor: theme.dark.border, background: theme.dark.app }}>
              {logoPreview || store?.logo
                ? <img src={logoPreview || store.logo} alt="Logo" className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold text-app-muted">{form.name?.[0] || '?'}</span>}
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={e => handleLogoPick(e.target.files?.[0])} className="hidden" />
              <button type="button" onClick={() => fileInput.current?.click()} className={theme.btn.outline + ' text-sm'}>
                Choisir une image
              </button>
              {logoFile && <span className="text-xs text-app-muted">{logoFile.name}</span>}
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: theme.dark.muted }}>JPG, PNG, WEBP ou GIF, 5 Mo max. Enregistrez le formulaire ci-dessous pour appliquer.</p>
        </div>

        {/* Formulaire */}
        <div
          className="rounded-xl border p-6 mb-6"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        >
          <p className="text-xs font-semibold text-app-muted-light mb-5 tracking-widest">INFORMATIONS DE LA BOUTIQUE</p>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs text-app-muted-light mb-1.5">Nom de la boutique</label>
              <input
                name="name"
                value={form.name ?? ''}
                onChange={handleChange}
                className={inputCls}
                style={{ borderColor: theme.dark.border }}
                placeholder="Nom de votre boutique"
              />
            </div>
            <div>
              <label className="block text-xs text-app-muted-light mb-1.5">Description</label>
              <textarea
                name="description"
                value={form.description ?? ''}
                onChange={handleChange}
                rows={3}
                className={`${inputCls} resize-none`}
                style={{ borderColor: theme.dark.border }}
                placeholder="Décrivez votre boutique…"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-app-muted-light mb-1.5">Téléphone</label>
                <input
                  name="phone"
                  value={form.phone ?? ''}
                  onChange={handleChange}
                  className={inputCls}
                  style={{ borderColor: theme.dark.border }}
                  placeholder="+213 …"
                />
              </div>
              <div>
                <label className="block text-xs text-app-muted-light mb-1.5">Email de contact</label>
                <input
                  name="email"
                  type="email"
                  value={form.email ?? ''}
                  onChange={handleChange}
                  className={inputCls}
                  style={{ borderColor: theme.dark.border }}
                  placeholder="contact@boutique.com"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Modifications enregistrées
                </span>
              )}
              <div className="ml-auto">
                <button
                  type="submit"
                  disabled={saving}
                  className={theme.btn.primary + ' px-6 py-2.5'}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* SEO */}
        <div className="rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs font-semibold text-app-muted-light mb-1 tracking-widest">RÉFÉRENCEMENT (SEO)</p>
          <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>Contrôle l'apparition de la page d'accueil de votre boutique dans les résultats Google. Laissez vide pour utiliser le nom/la description par défaut.</p>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs text-app-muted-light mb-1.5">Titre (balise &lt;title&gt;)</label>
              <input name="meta_title" value={form.meta_title ?? ''} onChange={handleChange} maxLength={70}
                className={inputCls} style={{ borderColor: theme.dark.border }} placeholder={form.name || 'Nom de la boutique'} />
              <p className="text-[10px] mt-1" style={{ color: theme.dark.muted }}>{(form.meta_title || '').length}/70</p>
            </div>
            <div>
              <label className="block text-xs text-app-muted-light mb-1.5">Description (meta description)</label>
              <textarea name="meta_description" value={form.meta_description ?? ''} onChange={handleChange} rows={2} maxLength={160}
                className={`${inputCls} resize-none`} style={{ borderColor: theme.dark.border }} placeholder={form.description || 'Description de la boutique'} />
              <p className="text-[10px] mt-1" style={{ color: theme.dark.muted }}>{(form.meta_description || '').length}/160</p>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className={theme.btn.primary + ' px-6 py-2.5'}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}
