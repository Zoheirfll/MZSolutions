import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { theme } from '../theme'

export default function StorePage() {
  const [store, setStore] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get('/stores/me/').then(({ data }) => {
      setStore(data)
      setForm({ name: data.name, description: data.description ?? '', phone: data.phone ?? '', email: data.email ?? '' })
    }).catch(() => {})
  }, [])

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSave = async e => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const { data } = await api.put('/stores/me/', form)
      setStore(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {}
    finally { setSaving(false) }
  }

  const publicUrl = store ? `${store.slug}.mzsolutions.app` : '…'

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://${publicUrl}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none transition focus:border-violet-500`

  return (
    <DashboardLayout title="Ma Boutique">
      <div className="max-w-2xl">

        {/* URL publique */}
        <div
          className="rounded-xl border p-5 mb-6"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        >
          <p className="text-xs font-semibold text-gray-400 mb-3 tracking-widest">URL PUBLIQUE DE VOTRE BOUTIQUE</p>
          <div className="flex items-center gap-3">
            <div
              className="flex-1 flex items-center px-4 py-3 rounded-lg border text-violet-300 font-mono text-sm"
              style={{ borderColor: '#3d2d6e', background: '#0f0f1f' }}
            >
              <span className="text-gray-500 mr-1">https://</span>
              {publicUrl}
            </div>
            <button
              onClick={handleCopy}
              className="px-4 py-3 rounded-lg text-sm font-medium transition"
              style={{ background: copied ? '#16a34a22' : '#ffffff10', color: copied ? '#4ade80' : '#a78bfa' }}
            >
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
        </div>

        {/* Formulaire */}
        <div
          className="rounded-xl border p-6"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        >
          <p className="text-xs font-semibold text-gray-400 mb-5 tracking-widest">INFORMATIONS DE LA BOUTIQUE</p>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Nom de la boutique</label>
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
              <label className="block text-xs text-gray-400 mb-1.5">Description</label>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Téléphone</label>
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
                <label className="block text-xs text-gray-400 mb-1.5">Email de contact</label>
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
                <span className="text-xs text-emerald-400 font-medium">✓ Modifications enregistrées</span>
              )}
              <div className="ml-auto">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                  style={{ background: '#7c3aed' }}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}
