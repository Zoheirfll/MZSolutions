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

// Champs affichés par type de pixel — alignés sur les capacités réelles de
// chaque plateforme (Jeton d'accès = Conversions/Events API server-side, en
// plus du script client déjà injecté par lib/pixels.js ; Vérification de
// domaine = balise Meta Business ; GA4 garde ses propres champs).
const FIELD_SETS = {
  facebook: [
    { key: 'label', label: 'Nom du pixel', placeholder: 'Ex : Compte pub principal' },
    { key: 'access_token', label: "Jeton d'accès", secret: true, placeholder: 'Conversions API (optionnel)' },
    { key: 'pixel_id', label: 'Identifiant du pixel', required: true, placeholder: 'Ex : 1234567890123456' },
    { key: 'domain_verification', label: 'Vérification du domaine', placeholder: 'Balise facebook-domain-verification' },
  ],
  tiktok: [
    { key: 'label', label: 'Nom du pixel', placeholder: 'Ex : Compte pub principal' },
    { key: 'access_token', label: "Jeton d'accès", secret: true, placeholder: 'Events API (optionnel)' },
    { key: 'pixel_id', label: 'Identifiant du pixel', required: true, placeholder: 'Ex : C4A1B2C3D4E5F6G7H8I9' },
  ],
  google_tag_manager: [
    { key: 'pixel_id', label: 'Identifiant', required: true, placeholder: 'Ex : GTM-XXXXXXX' },
  ],
  google_analytics: [
    { key: 'label', label: 'Nom', placeholder: 'Ex : Propriété principale' },
    { key: 'ga_view_id', label: "Identifiant de vue d'analyse", placeholder: 'Optionnel' },
    { key: 'pixel_id', label: 'Mesure GA', required: true, placeholder: 'Ex : G-XXXXXXXXXX' },
    { key: 'ga_api_secret', label: 'Secret API (Measurement Protocol)', secret: true, placeholder: "Envoi réel de l'évènement purchase — GA4 Admin → Flux de données → Measurement Protocol" },
    { key: 'ga_service_account_json', label: "JSON des informations d'identification du compte de service", secret: true, textarea: true, placeholder: 'Optionnel — réservé à une future intégration de rapports (non lié à l\'envoi d\'évènements)' },
  ],
}

const EMPTY_ROW = { label: '', access_token: '', pixel_id: '', domain_verification: '', ga_view_id: '', ga_service_account_json: '', ga_api_secret: '', is_active: true }

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 text-app-muted py-10">
      <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Chargement…
    </div>
  )
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={onChange}
      className="relative inline-flex h-6 w-10 items-center rounded-full transition-colors cursor-pointer shrink-0"
      style={{ background: value ? '#7c3aed' : theme.dark.border }}>
      <span className="inline-block h-4.5 w-4.5 transform rounded-full bg-white transition-transform" style={{ transform: value ? 'translateX(18px)' : 'translateX(2px)' }} />
    </button>
  )
}

function PixelRow({ pixelType, pixel, onSaved, onDeleted, isNew, onCancelNew }) {
  const [form, setForm] = useState(pixel ? { ...EMPTY_ROW, ...pixel } : EMPTY_ROW)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const fields = FIELD_SETS[pixelType]
  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  const set = (key) => (v) => setForm(f => ({ ...f, [key]: v }))

  const save = async () => {
    const required = fields.find(f => f.required)
    if (required && !form[required.key]) return
    setSaving(true)
    setError('')
    try {
      // Un champ secret laissé vide ne doit PAS écraser la valeur déjà
      // enregistrée côté serveur (write_only, jamais renvoyée par le GET) —
      // on ne l'inclut dans le payload que s'il a été retapé, ou à la
      // création. Bug réel corrigé : avant ce correctif, modifier n'importe
      // quel autre champ effaçait silencieusement le jeton déjà sauvegardé.
      const payload = Object.fromEntries(
        fields
          .filter(f => !(f.secret && !isNew && !form[f.key]))
          .map(f => [f.key, form[f.key] || ''])
      )
      payload.is_active = form.is_active
      if (isNew) {
        await api.post('/stores/me/pixels/', { pixel_type: pixelType, ...payload })
        onCancelNew()
      } else {
        await api.put(`/stores/me/pixels/${pixel.id}/`, payload)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.pixel_id?.[0] || "Erreur lors de l'enregistrement.")
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('Supprimer ?')) return
    setDeleting(true)
    try {
      await api.delete(`/stores/me/pixels/${pixel.id}/`)
      onDeleted()
    } finally { setDeleting(false) }
  }

  return (
    <div className="rounded-xl border p-5 space-y-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(f => (
          <div key={f.key} className={f.textarea ? 'sm:col-span-2' : ''}>
            <label className="block text-xs text-app-muted-light mb-1.5">{f.label}{f.required ? ' *' : ''}</label>
            {f.textarea ? (
              <textarea
                value={form[f.key]} onChange={e => set(f.key)(e.target.value)} rows={3}
                placeholder={f.secret && pixel?.[`${f.key}_configured`] ? 'Déjà configuré — laisser vide pour ne pas changer' : f.placeholder}
                className={inputCls + ' resize-none font-mono text-xs'} style={bdrStyle}
              />
            ) : (
              <input
                type={f.secret ? 'password' : 'text'}
                value={form[f.key]} onChange={e => set(f.key)(e.target.value)}
                placeholder={f.secret && pixel?.[`${f.key}_masked`] ? `Actuel : ${pixel[`${f.key}_masked`]}` : f.placeholder}
                className={inputCls} style={bdrStyle}
              />
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center justify-between">
        <Toggle value={form.is_active} onChange={() => set('is_active')(!form.is_active)} />
        <div className="flex items-center gap-2">
          {isNew && <button onClick={onCancelNew} className="px-3 py-2 text-sm text-app-muted-light hover:text-app-primary transition cursor-pointer">Annuler</button>}
          {!isNew && (
            <button onClick={remove} disabled={deleting} className={theme.btn.danger + ' text-sm disabled:opacity-50'}>
              {deleting ? '…' : 'Supprimer'}
            </button>
          )}
          <button onClick={save} disabled={saving} className={theme.btn.primary + ' text-sm disabled:opacity-50'}>
            {saving ? '…' : isNew ? 'Ajouter' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MarketingPixelsPage() {
  const { user } = useAuth()
  const [tab, setTab]         = useState('facebook')
  const [pixels, setPixels]   = useState([])
  const [loading, setLoading] = useState(true)
  const [addingNew, setAddingNew] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchPixels = () => {
    setLoading(true)
    api.get('/stores/me/pixels/')
      .then(({ data }) => setPixels(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPixels() }, [])
  useEffect(() => { setAddingNew(false) }, [tab])

  const catalogUrl = user?.store_slug ? `${API_BASE}/api/public/store/${user.store_slug}/catalog.xml` : ''
  const currentPixels = pixels.filter(p => p.pixel_type === tab)

  const copyCatalogUrl = () => {
    navigator.clipboard.writeText(catalogUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <DashboardLayout title="Marketing" subtitle={`Cette page sert à brancher vos outils de publicité en ligne (Facebook Ads, TikTok Ads, Google Analytics) sur votre boutique. Le script client (déjà injecté automatiquement sur la boutique) suffit pour la plupart des besoins ; le jeton d'accès est optionnel et permet en plus un envoi d'évènements côté serveur (Conversions API), plus fiable face aux bloqueurs de publicité. Vous pouvez ajouter plusieurs identifiants du même type si vous gérez plusieurs comptes publicitaires.`}>
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 cursor-pointer ${tab === t.value ? 'text-white bg-violet-600' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'}`}
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
            <input readOnly value={catalogUrl} className="flex-1 px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none" style={{ borderColor: theme.dark.border }} />
            <button onClick={copyCatalogUrl} className={theme.btn.primary + ' text-sm shrink-0 flex items-center gap-1.5 cursor-pointer'}>
              {copied ? <><CheckIcon /> Copié</> : 'Copier'}
            </button>
          </div>
        </div>
      ) : loading ? <Spinner /> : (
        <div className="space-y-4">
          {currentPixels.map(p => (
            <PixelRow key={p.id} pixelType={tab} pixel={p} onSaved={fetchPixels} onDeleted={fetchPixels} />
          ))}

          {addingNew && (
            <PixelRow pixelType={tab} isNew onSaved={fetchPixels} onCancelNew={() => setAddingNew(false)} onDeleted={() => {}} />
          )}

          {currentPixels.length === 0 && !addingNew && (
            <p className="text-sm text-app-muted text-center py-4">Aucun pixel configuré pour l'instant.</p>
          )}

          {!addingNew && (
            <button onClick={() => setAddingNew(true)} className={theme.btn.primary + ' w-full cursor-pointer flex items-center justify-center gap-1.5'}>
              + Ajouter
            </button>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
