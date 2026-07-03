import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { theme } from '../theme'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

function EndpointModal({ catalog, onClose, onSaved }) {
  const [name, setName]     = useState('')
  const [url, setUrl]       = useState('')
  const [events, setEvents] = useState([])
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  const toggleEvent = key => setEvents(e => e.includes(key) ? e.filter(x => x !== key) : [...e, key])

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/webhooks/endpoints/', { name, url, events, is_active: active })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h3 className="font-semibold text-gray-200 mb-5">Ajouter un endpoint</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nom</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Mon ERP" className={inputCls} style={bdrStyle} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">URL de l'endpoint *</label>
            <input value={url} onChange={e => setUrl(e.target.value)} required placeholder="https://votre-app.com/webhooks" className={inputCls} style={bdrStyle} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Événements ({events.length} sélectionné{events.length !== 1 ? 's' : ''} — aucun = tous)</label>
            <div className="flex flex-wrap gap-2">
              {catalog.map(ev => (
                <button key={ev.key} type="button" onClick={() => toggleEvent(ev.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${events.includes(ev.key) ? 'text-white bg-violet-600' : 'text-gray-400 hover:text-gray-200'}`}
                  style={events.includes(ev.key) ? undefined : { border: `1px solid ${theme.dark.border}` }}>
                  {ev.key}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setActive(a => !a)}
              className={`w-9 h-5 rounded-full transition-colors duration-150 relative cursor-pointer ${active ? 'bg-violet-600' : 'bg-white/10'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-gray-300">Actif</span>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {saving ? '…' : "Créer l'endpoint"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState([])
  const [logs, setLogs]           = useState([])
  const [incomingKey, setIncomingKey] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [catalog, setCatalog]     = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      api.get('/webhooks/endpoints/'),
      api.get('/webhooks/logs/'),
      api.get('/webhooks/incoming-key/'),
      api.get('/webhooks/events/'),
    ]).then(([e, l, k, c]) => {
      setEndpoints(e.data); setLogs(l.data); setIncomingKey(k.data); setCatalog(c.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cet endpoint ?')) return
    await api.delete(`/webhooks/endpoints/${id}/`)
    fetchAll()
  }

  const handleToggleActive = async (endpoint) => {
    await api.put(`/webhooks/endpoints/${endpoint.id}/`, { is_active: !endpoint.is_active })
    fetchAll()
  }

  const regenerateKey = async () => {
    if (!confirm('Régénérer la clé ? Les intégrations existantes utilisant l\'ancienne URL cesseront de fonctionner.')) return
    const { data } = await api.post('/webhooks/incoming-key/')
    setIncomingKey(data)
  }

  const filteredEndpoints = endpoints.filter(e =>
    statusFilter === 'all' ? true : statusFilter === 'active' ? e.is_active : !e.is_active
  )
  const incomingUrl = incomingKey ? `${API_BASE}/api/public/webhooks/incoming/${incomingKey.key}/` : ''

  return (
    <DashboardLayout title="Webhooks">
      <p className="text-sm mb-2" style={{ color: theme.dark.muted }}>
        Envoyez les événements de votre boutique vers d'autres systèmes en temps réel — ERP, comptabilité, partenaires logistiques, ou vos propres intégrations (Zapier, Make, n8n...).
      </p>

      {loading ? <Spinner /> : (
        <>
          {/* Endpoints sortants */}
          <div className="flex items-center justify-between mt-6 mb-4">
            <div className="flex items-center gap-2">
              {['all', 'active', 'inactive'].map(f => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${statusFilter === f ? 'text-white bg-violet-600' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                  style={statusFilter === f ? undefined : { border: `1px solid ${theme.dark.border}` }}>
                  {f === 'all' ? 'Tous' : f === 'active' ? 'Actifs' : 'Inactifs'}
                </button>
              ))}
            </div>
            <button onClick={() => setModalOpen(true)} className={theme.btn.primary + ' text-sm'}>+ Ajouter un endpoint</button>
          </div>

          <div className="rounded-xl border overflow-x-auto mb-3" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-180">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">ENDPOINT</th>
                  <th className="px-4 py-3 font-medium">ÉVÉNEMENTS</th>
                  <th className="px-4 py-3 font-medium">STATUT</th>
                  <th className="px-4 py-3 font-medium">DERNIER DÉCLENCHEMENT</th>
                  <th className="px-4 py-3 font-medium">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredEndpoints.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">Aucun endpoint configuré.</td></tr>
                ) : filteredEndpoints.map(ep => (
                  <tr key={ep.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                    <td className="px-4 py-3 text-gray-200">{ep.name || '—'}<br /><span className="text-xs text-gray-500 font-mono">{ep.url}</span></td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-56 truncate" title={ep.events.join(', ') || 'Tous'}>{ep.events.length ? ep.events.join(', ') : 'Tous'}</td>
                    <td className="px-4 py-3">
                      <span className={ep.is_active ? theme.badge.success : theme.badge.neutral}>{ep.is_active ? 'Actif' : 'Inactif'}</span>
                      {ep.consecutive_failures > 0 && (
                        <span className={`${theme.badge.warning} ml-1.5`}>{ep.consecutive_failures} échec{ep.consecutive_failures !== 1 ? 's' : ''}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{ep.last_triggered_at ? new Date(ep.last_triggered_at).toLocaleString('fr-DZ') : 'jamais'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleActive(ep)} className="text-xs text-violet-300 hover:bg-white/5 px-2 py-1 rounded transition cursor-pointer">
                          {ep.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <button onClick={() => handleDelete(ep.id)} className="text-xs text-red-400 hover:bg-red-900/20 px-2 py-1 rounded transition cursor-pointer">Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mb-8" style={{ color: theme.dark.muted }}>
            Un endpoint désactivé automatiquement après 20 échecs consécutifs — réactivez-le une fois le problème corrigé.
          </p>

          {/* Webhooks entrants */}
          <h2 className="font-semibold text-gray-200 mb-3">Webhooks entrants</h2>
          <div className="rounded-xl border p-5 mb-8" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>
              Utilisez cette URL dans un outil externe (Zapier, Make, n8n...) pour lui envoyer des données — la clé secrète dans l'URL authentifie la requête.
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={incomingUrl} className="flex-1 px-3.5 py-2.5 rounded-lg border text-sm text-gray-300 bg-transparent outline-none font-mono text-xs" style={{ borderColor: theme.dark.border }} />
              <button onClick={() => navigator.clipboard.writeText(incomingUrl)} className={theme.btn.primary + ' text-sm shrink-0'}>Copier</button>
              <button onClick={regenerateKey} className="px-4 py-2.5 rounded-lg text-sm font-semibold border text-red-400 hover:bg-red-900/20 transition cursor-pointer shrink-0" style={{ borderColor: theme.dark.border }}>
                Régénérer
              </button>
            </div>
          </div>

          {/* Journal */}
          <h2 className="font-semibold text-gray-200 mb-3">Journal</h2>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
            <table className="w-full text-sm min-w-180">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
                  <th className="px-4 py-3 font-medium">SENS</th>
                  <th className="px-4 py-3 font-medium">ÉVÉNEMENT</th>
                  <th className="px-4 py-3 font-medium">STATUT</th>
                  <th className="px-4 py-3 font-medium">DÉTAIL</th>
                  <th className="px-4 py-3 font-medium">DATE</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">Aucun événement pour l'instant.</td></tr>
                ) : logs.map(l => (
                  <tr key={l.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                    <td className="px-4 py-3 text-gray-300">{l.direction_label}{l.endpoint_name && <><br /><span className="text-xs text-gray-500">{l.endpoint_name}</span></>}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{l.event || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={l.status === 'success' ? theme.badge.success : theme.badge.danger}>{l.status === 'success' ? 'Succès' : 'Erreur'}{l.status_code ? ` (${l.status_code})` : ''}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-56 truncate" title={l.message}>{l.message || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(l.created_at).toLocaleString('fr-DZ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalOpen && (
        <EndpointModal catalog={catalog} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchAll() }} />
      )}
    </DashboardLayout>
  )
}
