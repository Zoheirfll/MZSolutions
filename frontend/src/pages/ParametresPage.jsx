import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import Select from '../components/Select'
import api from '../api/axios'
import { theme } from '../theme'
import { useAuth } from '../context/AuthContext'

const TABS = [
  { key: 'account',  label: 'Informations du compte' },
  { key: 'general',  label: 'Paramètres généraux' },
  { key: 'sessions', label: 'Historique de connexion récent' },
]

const CURRENCY_OPTIONS = [
  { value: 'DZD', label: 'Dinar algérien (DZD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'USD', label: 'Dollar américain (USD)' },
]

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-app-muted-light mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ value, onChange, label, disabled, hint }) {
  return (
    <label className={`flex items-center justify-between gap-3 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <div>
        <span className="text-sm text-app-primary">{label}</span>
        {hint && <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>{hint}</p>}
      </div>
      <button
        type="button" disabled={disabled}
        onClick={() => !disabled && onChange(!value)}
        className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ background: value ? '#7c3aed' : theme.dark.border }}
      >
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: value ? 'translateX(18px)' : 'translateX(2px)' }} />
      </button>
    </label>
  )
}

function AccountTab() {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' })
  const [avatarFile, setAvatarFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pwd, setPwd] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false })

  useEffect(() => {
    if (user) setForm({ first_name: user.first_name || '', last_name: user.last_name || '', phone: user.phone || '' })
  }, [user])

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      let data
      if (avatarFile) {
        const fd = new FormData()
        Object.entries(form).forEach(([k, v]) => fd.append(k, v))
        fd.append('avatar', avatarFile)
        ;({ data } = await api.put('/auth/me/', fd, { headers: { 'Content-Type': 'multipart/form-data' } }))
      } else {
        ;({ data } = await api.put('/auth/me/', form))
      }
      setUser(data)
      setAvatarFile(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {} finally { setSaving(false) }
  }

  const savePassword = async () => {
    setPwdError('')
    setPwdSuccess('')
    if (pwd.new_password !== pwd.confirm) {
      setPwdError('La confirmation ne correspond pas au nouveau mot de passe.')
      return
    }
    setPwdSaving(true)
    try {
      await api.post('/auth/change-password/', { current_password: pwd.current_password, new_password: pwd.new_password })
      setPwdSuccess('Mot de passe mis à jour.')
      setPwd({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setPwdError(err.response?.data?.detail || 'Échec de la mise à jour.')
    } finally { setPwdSaving(false) }
  }

  const avatarPreview = avatarFile ? URL.createObjectURL(avatarFile) : user?.avatar

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h2 className="font-semibold text-app-primary mb-4">Profil</h2>

        <label
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-10 mb-5 cursor-pointer hover:border-violet-500/40 transition"
          style={{ borderColor: theme.dark.border }}
        >
          {avatarPreview ? (
            <img src={avatarPreview} alt="Avatar" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <svg className="w-10 h-10 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" />
            </svg>
          )}
          <p className="text-sm text-app-primary">Glissez une image ou <span className="text-violet-400">parcourir</span></p>
          <p className="text-xs" style={{ color: theme.dark.muted }}>PNG, JPG, GIF jusqu'à 5 Mo</p>
          <input type="file" accept="image/*" className="hidden" onChange={e => setAvatarFile(e.target.files?.[0] || null)} />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Prénom">
            <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className={inputCls} style={bdrStyle} />
          </Field>
          <Field label="Nom de famille">
            <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className={inputCls} style={bdrStyle} />
          </Field>
          <Field label="E-mail">
            <input value={user?.email || ''} disabled className={inputCls + ' opacity-60 cursor-not-allowed'} style={bdrStyle} />
          </Field>
          <Field label="Numéro de téléphone">
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} style={bdrStyle} />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className={theme.btn.primary + ' cursor-pointer disabled:opacity-50'}>
            {saving ? 'Enregistrement…' : 'Mettre à jour les informations'}
          </button>
          {saved && <span className="text-xs text-emerald-400">Enregistré ✓</span>}
        </div>
      </div>

      <div className="rounded-xl border p-5 sm:p-6 max-w-lg" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h2 className="font-semibold text-app-primary mb-4">Réinitialiser le mot de passe</h2>
        <div className="space-y-3">
          {[
            { key: 'current_password', label: 'Mot de passe actuel', show: 'current' },
            { key: 'new_password',     label: 'Nouveau mot de passe', show: 'next' },
            { key: 'confirm',          label: 'Confirmez le mot de passe', show: 'confirm' },
          ].map(f => (
            <div key={f.key} className="relative">
              <input
                type={showPwd[f.show] ? 'text' : 'password'}
                value={pwd[f.key]}
                onChange={e => setPwd(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.label}
                className={inputCls + ' pr-10'} style={bdrStyle}
              />
              <button type="button" onClick={() => setShowPwd(s => ({ ...s, [f.show]: !s[f.show] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted-light hover:text-app-primary transition cursor-pointer">
                👁
              </button>
            </div>
          ))}
        </div>
        {pwdError && <p className="text-xs text-red-400 mt-2">{pwdError}</p>}
        {pwdSuccess && <p className="text-xs text-emerald-400 mt-2">{pwdSuccess}</p>}
        <button
          onClick={savePassword}
          disabled={pwdSaving || !pwd.current_password || !pwd.new_password}
          className={theme.btn.primary + ' mt-4 cursor-pointer disabled:opacity-50'}
        >
          {pwdSaving ? '…' : 'Mettre à jour le mot de passe'}
        </button>
      </div>
    </div>
  )
}

function GeneralTab() {
  const [store, setStore] = useState(null)
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/stores/me/').then(({ data }) => setStore(data)).catch(() => {})
    api.get('/stores/me/settings/').then(({ data }) => setSettings(data)).catch(() => {})
  }, [])

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await Promise.all([
        api.put('/stores/me/', store),
        api.put('/stores/me/settings/', settings),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {} finally { setSaving(false) }
  }

  if (!store || !settings) return <p className="text-app-muted text-center py-16">Chargement…</p>

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h2 className="font-semibold text-app-primary mb-4">Boutique</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Nom du magasin">
            <input value={store.name} onChange={e => setStore(s => ({ ...s, name: e.target.value }))} className={inputCls} style={bdrStyle} />
          </Field>
          <Field label="Titre du magasin (SEO)">
            <input value={store.meta_title} onChange={e => setStore(s => ({ ...s, meta_title: e.target.value }))} className={inputCls} style={bdrStyle} placeholder={store.name} />
          </Field>
          <Field label="Téléphone du magasin">
            <input value={store.phone} onChange={e => setStore(s => ({ ...s, phone: e.target.value }))} className={inputCls} style={bdrStyle} />
          </Field>
          <Field label="E-mail du magasin">
            <input value={store.email} onChange={e => setStore(s => ({ ...s, email: e.target.value }))} className={inputCls} style={bdrStyle} />
          </Field>
          <Field label="URL Facebook">
            <input value={store.facebook_url} onChange={e => setStore(s => ({ ...s, facebook_url: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="https://facebook.com/…" />
          </Field>
          <Field label="URL Instagram">
            <input value={store.instagram_url} onChange={e => setStore(s => ({ ...s, instagram_url: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="https://instagram.com/…" />
          </Field>
          <Field label="URL Twitter / X">
            <input value={store.twitter_url} onChange={e => setStore(s => ({ ...s, twitter_url: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="https://x.com/…" />
          </Field>
          <Field label="URL TikTok">
            <input value={store.tiktok_url} onChange={e => setStore(s => ({ ...s, tiktok_url: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="https://tiktok.com/@…" />
          </Field>
        </div>
        <Field label="Description">
          <textarea value={store.description} onChange={e => setStore(s => ({ ...s, description: e.target.value }))} rows={4} className={inputCls + ' resize-none'} style={bdrStyle} />
        </Field>
      </div>

      <div className="rounded-xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h2 className="font-semibold text-app-primary mb-4">Devise et limites de commande</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Devise">
            <Select value={store.currency} onChange={v => setStore(s => ({ ...s, currency: v }))} options={CURRENCY_OPTIONS}
              className={inputCls} style={{ ...bdrStyle, background: theme.dark.sidebar }} />
          </Field>
          <Field label="Symbole">
            <input value={store.currency_symbol} onChange={e => setStore(s => ({ ...s, currency_symbol: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="DA" />
          </Field>
          <Field label="Montant maximum de la commande">
            <input type="number" min="0" value={settings.max_order_amount || ''} onChange={e => setSettings(s => ({ ...s, max_order_amount: e.target.value || null }))} className={inputCls} style={bdrStyle} placeholder="Aucune limite" />
          </Field>
          <Field label="Quantité maximale de la commande">
            <input type="number" min="0" value={settings.max_order_quantity || ''} onChange={e => setSettings(s => ({ ...s, max_order_quantity: e.target.value || null }))} className={inputCls} style={bdrStyle} placeholder="Aucune limite" />
          </Field>
          <Field label="Préfixe de commande">
            <input value={settings.order_prefix} onChange={e => setSettings(s => ({ ...s, order_prefix: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="ex: MZ-" />
          </Field>
          <Field label="Suffixe de commande">
            <input value={settings.order_suffix} onChange={e => setSettings(s => ({ ...s, order_suffix: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="ex: -DZ" />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border p-5 sm:p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h2 className="font-semibold text-app-primary mb-1">Notifications et comportement</h2>
        <div className="divide-y" style={{ borderColor: theme.dark.border }}>
          <Toggle value={settings.notify_duplicate_orders} onChange={v => setSettings(s => ({ ...s, notify_duplicate_orders: v }))}
            label="Commandes en double" hint="Notifie (webhook) quand un client repasse commande avec le même téléphone sous 24h." />
          <Toggle value={settings.notify_new_orders} onChange={v => setSettings(s => ({ ...s, notify_new_orders: v }))}
            label="Notification" hint="Badge, son et notification navigateur à chaque nouvelle commande." />
          <Toggle value={settings.sms_notifications_enabled} onChange={() => {}} disabled
            label="Messages SMS" hint="Fournisseur SMS non configuré pour l'instant." />
          <Toggle value={settings.order_confirmed_otp_enabled} onChange={() => {}} disabled
            label="OTP de confirmation de commande" hint="Fournisseur SMS non configuré pour l'instant." />
          <Toggle value={settings.deduct_stock_on_order_create} onChange={v => setSettings(s => ({ ...s, deduct_stock_on_order_create: v }))}
            label="Mettre à jour le stock dès la création de la commande" hint="Si désactivé, le stock n'est décrémenté qu'à la confirmation." />
          <Toggle value={settings.free_shipping_if_product_free_shipping} onChange={v => setSettings(s => ({ ...s, free_shipping_if_product_free_shipping: v }))}
            label="Livraison gratuite si le panier contient un produit avec livraison gratuite" hint="Basé sur l'option « Livraison gratuite » de la fiche produit." />
        </div>
        <Field label="Jeton SMS (pour quand un fournisseur sera configuré)">
          <input value={settings.sms_api_token || ''} onChange={e => setSettings(s => ({ ...s, sms_api_token: e.target.value }))} className={inputCls + ' mt-1'} style={bdrStyle}
            placeholder={settings.sms_api_token_masked || 'Non configuré'} />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className={theme.btn.primary + ' cursor-pointer disabled:opacity-50'}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Enregistré ✓</span>}
      </div>
    </div>
  )
}

function SessionsTab() {
  const [data, setData] = useState({ results: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const perPage = 10

  const fetchData = useCallback(() => {
    setLoading(true)
    api.get(`/auth/login-history/?page=${page}&per_page=${perPage}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
      <table className="w-full text-sm min-w-160">
        <thead style={{ background: theme.dark.sidebar }}>
          <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
            <th className="px-4 py-3 font-medium">ID</th>
            <th className="px-4 py-3 font-medium">ADRESSE IP</th>
            <th className="px-4 py-3 font-medium">APPAREIL</th>
            <th className="px-4 py-3 font-medium">STATUT</th>
            <th className="px-4 py-3 font-medium">DATE</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="text-center py-12 text-app-muted">Chargement…</td></tr>
          ) : data.results.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-12 text-app-muted">Aucune connexion enregistrée.</td></tr>
          ) : data.results.map(h => (
            <tr key={h.id} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
              <td className="px-4 py-3 text-app-muted">#{h.id}</td>
              <td className="px-4 py-3 font-mono text-xs text-app-primary">{h.ip_address || '—'}</td>
              <td className="px-4 py-3 text-app-muted-light max-w-60 truncate" title={h.user_agent}>{h.user_agent || '—'}</td>
              <td className="px-4 py-3">
                <span className={h.status === 'login' ? theme.badge.success : theme.badge.neutral}>{h.status}</span>
              </td>
              <td className="px-4 py-3 text-app-muted text-xs">{new Date(h.created_at).toLocaleString('fr-DZ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.count > perPage && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">← Précédent</button>
          <span className={theme.badge.info}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">Suivant →</button>
        </div>
      )}
    </div>
  )
}

export default function ParametresPage() {
  const [tab, setTab] = useState('account')

  return (
    <DashboardLayout title="Paramètres" subtitle="Informations de votre compte, réglages généraux de la boutique et historique de connexion.">
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit overflow-x-auto" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 cursor-pointer
              ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'account'  && <AccountTab />}
      {tab === 'general'  && <GeneralTab />}
      {tab === 'sessions' && <SessionsTab />}
    </DashboardLayout>
  )
}
