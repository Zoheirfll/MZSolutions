import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { theme } from '../theme'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TABS = [
  { value: 'stores',  label: 'Boutiques e-commerce' },
  { value: 'sheets',  label: 'Google Sheets' },
  { value: 'meta',    label: 'Meta Commerce' },
]

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

function ConnectModal({ channel, initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    shop_url: initial?.shop_url || '',
    api_key: initial?.api_key || '',
    api_secret: '',
  })
  const [saving, setSaving] = useState(false)
  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/channels/connections/', { channel, ...form })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const label = channel === 'shopify' ? 'Shopify' : 'Google Sheets'
  const urlLabel = channel === 'shopify' ? 'URL de la boutique (ex: monshop.myshopify.com)' : 'URL ou ID du Google Sheet'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h3 className="font-semibold text-gray-200 mb-1">Connecter {label}</h3>
        <p className="text-xs mb-5" style={{ color: theme.dark.muted }}>
          Les accès API réels ne sont pas encore obtenus — la connexion est enregistrée et la synchronisation fonctionne en mode simulé (aucun appel réseau réel) en attendant.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">{urlLabel}</label>
            <input value={form.shop_url} onChange={e => setForm(f => ({ ...f, shop_url: e.target.value }))}
              className={inputCls} style={bdrStyle} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Clé API (optionnel pour l'instant)</label>
            <input value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
              className={inputCls} style={bdrStyle} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Secret API (optionnel pour l'instant)</label>
            <input type="password" value={form.api_secret} onChange={e => setForm(f => ({ ...f, api_secret: e.target.value }))}
              className={inputCls} style={bdrStyle} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {saving ? '…' : 'Connecter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChannelCard({ title, description, connection, onConnect, onSync, onDisconnect, syncing, pullDirection = 'pull', pullLabel = 'Importer les commandes' }) {
  return (
    <div className="rounded-xl border p-5 flex flex-col gap-3" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div>
        <p className="font-semibold text-gray-200">{title}</p>
        <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{description}</p>
      </div>
      {connection ? (
        <>
          <div className="text-xs space-y-1" style={{ color: theme.dark.muted }}>
            <p>URL : <span className="text-gray-300">{connection.shop_url || '—'}</span></p>
            {connection.oauth_connected && <p><span className={theme.badge.success}>Connecté via OAuth</span></p>}
            <p>Dernière synchro : <span className="text-gray-300">{connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString('fr-DZ') : 'jamais'}</span></p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onSync(connection, 'push')} disabled={syncing} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition">
              {syncing ? '…' : 'Pousser le catalogue'}
            </button>
            <button onClick={() => onSync(connection, pullDirection)} disabled={syncing} className="px-3 py-1.5 rounded-lg text-xs font-semibold border text-gray-300 hover:bg-white/5 disabled:opacity-60 cursor-pointer transition" style={{ borderColor: theme.dark.border }}>
              {syncing ? '…' : pullLabel}
            </button>
            <button onClick={() => onDisconnect(connection)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-900/20 cursor-pointer transition">
              Déconnecter
            </button>
          </div>
        </>
      ) : (
        <button onClick={onConnect} className={theme.btn.primary + ' text-sm self-start'}>Connecter</button>
      )}
    </div>
  )
}

function ShopifyConnectModal({ onClose, onError }) {
  const [shop, setShop] = useState('')
  const [connecting, setConnecting] = useState(false)
  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setConnecting(true)
    try {
      const { data } = await api.post('/channels/shopify/install/', { shop: shop.trim() })
      window.location.href = data.authorize_url
    } catch (err) {
      onError(err?.response?.data?.detail || "Impossible de démarrer la connexion Shopify.")
      setConnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h3 className="font-semibold text-gray-200 mb-1">Connecter Shopify</h3>
        <p className="text-xs mb-5" style={{ color: theme.dark.muted }}>
          Vous allez être redirigé vers Shopify pour autoriser MZSolutions à accéder à votre boutique. Aucune information sensible à saisir ici.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Domaine de votre boutique Shopify</label>
            <input value={shop} onChange={e => setShop(e.target.value)} placeholder="monshop.myshopify.com"
              className={inputCls} style={bdrStyle} required />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={connecting} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {connecting ? '…' : 'Continuer vers Shopify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SalesChannelsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('stores')
  const [connections, setConnections] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalChannel, setModalChannel] = useState(null)
  const [shopifyModalOpen, setShopifyModalOpen] = useState(false)
  const [syncingId, setSyncingId] = useState(null)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)

  const fetchAll = () => {
    setLoading(true)
    Promise.all([api.get('/channels/connections/'), api.get('/channels/logs/')])
      .then(([c, l]) => { setConnections(c.data); setLogs(l.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
    const params = new URLSearchParams(window.location.search)
    if (params.get('shopify') === 'connected') {
      setNotice('Boutique Shopify connectée avec succès.')
      setNoticeError(false)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const byChannel = key => connections.find(c => c.channel === key)

  const handleSync = async (connection, direction) => {
    setSyncingId(connection.id)
    try {
      await api.post(`/channels/connections/${connection.id}/sync/`, { direction })
      fetchAll()
    } finally {
      setSyncingId(null)
    }
  }

  const handleDisconnect = async (connection) => {
    if (!confirm('Déconnecter ce canal ?')) return
    await api.delete(`/channels/connections/${connection.id}/`)
    fetchAll()
  }

  const feedUrl = user?.store_slug ? `${API_BASE}/api/public/store/${user.store_slug}/catalog.xml` : ''

  return (
    <DashboardLayout title="Canaux de vente">
      <p className="text-sm mb-5" style={{ color: theme.dark.muted }}>
        Connectez vos applications et services pour centraliser vos données et vos flux de travail.
      </p>

      {notice && (
        <div className={(noticeError ? theme.badge.danger : theme.badge.success) + ' block mb-5 px-3.5 py-2.5 rounded-lg text-sm'}>{notice}</div>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === t.value ? 'text-white bg-violet-600' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            style={tab === t.value ? undefined : { border: `1px solid ${theme.dark.border}` }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'stores' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <ChannelCard
                title="Shopify" description="Connectez votre boutique Shopify — les commandes arrivent automatiquement dans MZSolutions."
                connection={byChannel('shopify')} onConnect={() => setShopifyModalOpen(true)}
                onSync={handleSync} onDisconnect={handleDisconnect} syncing={syncingId === byChannel('shopify')?.id}
                pullDirection="pull_products" pullLabel="Importer les produits"
              />
            </div>
          )}

          {tab === 'sheets' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <ChannelCard
                title="Google Sheets" description="Synchronisez automatiquement vos données de commandes avec Google Sheets pour les rapports et l'analyse."
                connection={byChannel('google_sheets')} onConnect={() => setModalChannel('google_sheets')}
                onSync={handleSync} onDisconnect={handleDisconnect} syncing={syncingId === byChannel('google_sheets')?.id}
              />
            </div>
          )}

          {tab === 'meta' && (
            <div className="rounded-xl border p-5 mb-8" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <p className="font-semibold text-gray-200 mb-1">Intégration des Publicités Meta (Facebook/Instagram)</p>
              <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>
                Contrairement à Shopify/Google Sheets, cette intégration ne nécessite aucune clé API de votre part : copiez l'URL ci-dessous dans Meta Commerce Manager (Catalogue → Ajouter des articles → Flux de données programmé). Meta viendra lire automatiquement votre catalogue à cette adresse.
              </p>
              <div className="flex items-center gap-2">
                <input readOnly value={feedUrl} className="flex-1 px-3.5 py-2.5 rounded-lg border text-sm text-gray-300 bg-transparent outline-none [color-scheme:dark]" style={{ borderColor: theme.dark.border }} />
                <button onClick={() => navigator.clipboard.writeText(feedUrl)} className={theme.btn.primary + ' text-sm shrink-0'}>Copier</button>
              </div>
            </div>
          )}

          <h2 className="font-semibold text-gray-200 mb-3">Journal de synchronisation</h2>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-140">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">CANAL</th>
                  <th className="px-4 py-3 font-medium">SENS</th>
                  <th className="px-4 py-3 font-medium">STATUT</th>
                  <th className="px-4 py-3 font-medium">MESSAGE</th>
                  <th className="px-4 py-3 font-medium">DATE</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">Aucune synchronisation pour l'instant.</td></tr>
                ) : logs.map(l => (
                  <tr key={l.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                    <td className="px-4 py-3 text-gray-200">{l.channel_label}</td>
                    <td className="px-4 py-3 text-gray-400">{l.direction_label}</td>
                    <td className="px-4 py-3">
                      <span className={l.status === 'success' ? theme.badge.success : theme.badge.danger}>{l.status === 'success' ? 'Succès' : 'Erreur'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-80 truncate" title={l.message}>{l.message}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(l.started_at).toLocaleString('fr-DZ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalChannel && (
        <ConnectModal channel={modalChannel} initial={byChannel(modalChannel)} onClose={() => setModalChannel(null)} onSaved={() => { setModalChannel(null); fetchAll() }} />
      )}
      {shopifyModalOpen && (
        <ShopifyConnectModal onClose={() => setShopifyModalOpen(false)} onError={msg => { setNotice(msg); setNoticeError(true) }} />
      )}
    </DashboardLayout>
  )
}
