import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TABS = [
  { value: 'facebook',            label: 'Facebook Pixel' },
  { value: 'facebook_catalog',    label: 'Facebook Catalog' },
  { value: 'tiktok',              label: 'TikTok Pixel' },
  { value: 'google_tag_manager',  label: 'Google Tag Manager' },
  { value: 'google_analytics',    label: 'Google Analytics' },
]

const PLACEHOLDERS = {
  facebook: 'Ex : 1234567890123456',
  tiktok:   'Ex : C4A1B2C3D4E5F6G7H8I9',
  google_analytics:   'Ex : G-XXXXXXXXXX',
  google_tag_manager: 'Ex : GTM-XXXXXXX',
}

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 text-gray-500 py-10">
      <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Chargement…
    </div>
  )
}

function AddModal({ pixelType, onClose, onSaved }) {
  const [pixelId, setPixelId] = useState('')
  const [label, setLabel]     = useState('')
  const [saving, setSaving]   = useState(false)
  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/stores/me/pixels/', { pixel_type: pixelType, pixel_id: pixelId, label })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h3 className="font-semibold text-gray-200 mb-5">Ajouter {TABS.find(t => t.value === pixelType)?.label}</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Identifiant *</label>
            <input value={pixelId} onChange={e => setPixelId(e.target.value)} required placeholder={PLACEHOLDERS[pixelType]}
              className={inputCls} style={bdrStyle} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nom (optionnel)</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Compte pub principal"
              className={inputCls} style={bdrStyle} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {saving ? '…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MarketingPixelsPage() {
  const { user } = useAuth()
  const [tab, setTab]         = useState('facebook')
  const [pixels, setPixels]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchPixels = () => {
    setLoading(true)
    api.get('/stores/me/pixels/')
      .then(({ data }) => setPixels(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPixels() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce pixel ?')) return
    await api.delete(`/stores/me/pixels/${id}/`)
    fetchPixels()
  }

  const catalogUrl = user?.store_slug ? `${API_BASE}/api/public/store/${user.store_slug}/catalog.xml` : ''
  const currentPixels = pixels.filter(p => p.pixel_type === tab)

  return (
    <DashboardLayout title="Marketing">
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${tab === t.value ? 'text-white bg-violet-600' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            style={tab === t.value ? undefined : { border: `1px solid ${theme.dark.border}` }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'facebook_catalog' ? (
        <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>
            Copiez cette URL dans Meta Commerce Manager (Catalogue → Ajouter des articles → Flux de données programmé). Déjà disponible depuis Canaux de vente → Meta Commerce.
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={catalogUrl} className="flex-1 px-3.5 py-2.5 rounded-lg border text-sm text-gray-300 bg-transparent outline-none" style={{ borderColor: theme.dark.border }} />
            <button onClick={() => navigator.clipboard.writeText(catalogUrl)} className={theme.btn.primary + ' text-sm shrink-0'}>Copier</button>
          </div>
        </div>
      ) : loading ? <Spinner /> : (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setModalOpen(true)} className={theme.btn.primary + ' text-sm'}>+ Ajouter</button>
          </div>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-140">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">NOM</th>
                  <th className="px-4 py-3 font-medium">IDENTIFIANT</th>
                  <th className="px-4 py-3 font-medium">AJOUTÉ LE</th>
                  <th className="px-4 py-3 font-medium">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {currentPixels.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">Aucun pixel configuré pour l'instant.</td></tr>
                ) : currentPixels.map(p => (
                  <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                    <td className="px-4 py-3 text-gray-200">{p.label || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{p.pixel_id}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString('fr-DZ')}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-red-400 hover:bg-red-900/20 px-2 py-1 rounded transition cursor-pointer">Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalOpen && (
        <AddModal pixelType={tab} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchPixels() }} />
      )}
    </DashboardLayout>
  )
}
