import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { theme } from '../theme'
import { WILAYAS } from '../data/wilayas'

const CARRIERS = [
  { code: 'yalidine',   label: 'Yalidine' },
  { code: 'zr_express', label: 'ZR Express' },
]

const TABS = [
  { key: 'browse',    label: 'Sociétés de livraison' },
  { key: 'connected', label: 'Mes Sociétés de livraison' },
]

function CopyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  )
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-xs" style={{ color: theme.dark.muted }}>—</span>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer
        ${copied ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
      title={label}
    >
      <span className="max-w-28 truncate">{value}</span>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

function StatusToggle({ active, onChange }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={active}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer shrink-0
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400
        ${active ? 'bg-violet-600' : 'bg-white/10'}`}
    >
      <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform duration-200
        ${active ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export default function ParametresLivraisonPage() {
  const [tab, setTab]                   = useState('browse')
  const [accounts, setAccounts]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [modalCarrier, setModalCarrier] = useState(null)
  const [name, setName]                 = useState('')
  const [departureWilaya, setDepartureWilaya] = useState('')
  const [apiId, setApiId]               = useState('')
  const [apiToken, setApiToken]         = useState('')
  const [isActive, setIsActive]         = useState(true)
  const [saving, setSaving]             = useState(false)

  const fetchAccounts = () => {
    setLoading(true)
    api.get('/stores/me/carriers/')
      .then(({ data }) => setAccounts(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAccounts() }, [])

  const accountFor = (code) => accounts.find(a => a.carrier === code)

  const openModal = (code) => {
    const existing = accountFor(code)
    setName(existing?.name || '')
    setDepartureWilaya(existing?.departure_wilaya || '')
    setApiId(existing?.api_id || '')
    setApiToken('')
    setIsActive(existing ? existing.is_active : true)
    setModalCarrier(code)
  }

  const saveAccount = async () => {
    if (!modalCarrier) return
    setSaving(true)
    try {
      const existing = accountFor(modalCarrier)
      const payload = { name, departure_wilaya: departureWilaya, api_id: apiId, api_token: apiToken, is_active: isActive }
      if (existing) {
        await api.put(`/stores/me/carriers/${existing.id}/`, payload)
      } else {
        await api.post('/stores/me/carriers/', { carrier: modalCarrier, ...payload })
      }
      setModalCarrier(null)
      fetchAccounts()
    } catch {} finally { setSaving(false) }
  }

  const toggleActive = async (account) => {
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: !a.is_active } : a))
    try {
      await api.put(`/stores/me/carriers/${account.id}/`, { is_active: !account.is_active })
    } catch {
      fetchAccounts()
    }
  }

  const toggleDefault = async (account) => {
    await api.put(`/stores/me/carriers/${account.id}/`, { is_default: !account.is_default })
    fetchAccounts()
  }

  const removeAccount = async (account) => {
    await api.delete(`/stores/me/carriers/${account.id}/`)
    fetchAccounts()
  }

  return (
    <DashboardLayout title="Paramètres livraison">
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
              ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={theme.skeleton + ' h-48'} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CARRIERS.map(c => {
                const account = accountFor(c.code)
                return (
                  <div key={c.code} className="rounded-xl border p-5 flex flex-col items-center text-center gap-3 transition-colors duration-150 hover:border-white/20"
                    style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center text-lg font-bold text-violet-600 shadow">
                      {c.label[0]}
                    </div>
                    <p className="font-semibold text-gray-200">{c.label}</p>
                    {account ? (
                      <>
                        <span className={theme.badge.success}>Connecté</span>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: theme.dark.muted }}>
                          <input type="checkbox" checked={account.is_default} onChange={() => toggleDefault(account)} className="cursor-pointer accent-violet-600" />
                          Transporteur par défaut
                        </label>
                        <div className="flex gap-2 w-full">
                          <button onClick={() => openModal(c.code)} className={theme.btn.outline + ' flex-1 text-xs cursor-pointer'}>Modifier</button>
                          <button onClick={() => removeAccount(account)} className={theme.btn.danger + ' flex-1 text-xs cursor-pointer'}>Retirer</button>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => openModal(c.code)} className={theme.btn.primary + ' w-full cursor-pointer'}>Ajouter</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'connected' && (
        <div className={theme.table.wrap}>
          <table className="w-full text-sm">
            <thead className={theme.table.head}>
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Société</th>
                <th className="px-4 py-3 text-left">Ville de départ</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-left">Clé API</th>
                <th className="px-4 py-3 text-left">Jeton API</th>
                <th className="px-4 py-3 text-left">Défaut</th>
                <th className="px-4 py-3 text-left">Créé à</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(2)].map((_, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: theme.dark.border + '44' }}>
                    <td colSpan={9} className="px-4 py-4"><div className={theme.skeleton + ' h-5 w-full'} /></td>
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className={theme.emptyState}>
                      <p className="text-sm">Aucun transporteur connecté pour l'instant.</p>
                      <button onClick={() => setTab('browse')} className={theme.btn.ghost + ' mt-2 cursor-pointer'}>
                        Aller dans "Sociétés de livraison"
                      </button>
                    </div>
                  </td>
                </tr>
              ) : accounts.map(a => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                  <td className="px-4 py-3 text-gray-400">{a.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-xs font-bold text-violet-600 shrink-0">
                        {a.carrier_label?.[0]}
                      </div>
                      <div>
                        <p className="text-gray-200 font-medium leading-tight">{a.name || a.carrier_label}</p>
                        <p className="text-xs leading-tight" style={{ color: theme.dark.muted }}>{a.carrier_label}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{a.departure_wilaya || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusToggle active={a.is_active} onChange={() => toggleActive(a)} />
                  </td>
                  <td className="px-4 py-3"><CopyButton value={a.api_id} label="Copier la clé API" /></td>
                  <td className="px-4 py-3"><CopyButton value={a.api_token_masked} label="Le jeton complet n'est jamais renvoyé" /></td>
                  <td className="px-4 py-3">
                    {a.is_default ? (
                      <span className={theme.badge.info}>Par défaut</span>
                    ) : (
                      <button onClick={() => toggleDefault(a)} className="text-xs text-violet-400 hover:text-violet-300 cursor-pointer transition">
                        Définir par défaut
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(a.created_at).toLocaleDateString('fr-DZ')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openModal(a.carrier)} className={theme.btn.icon} title="Modifier">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button onClick={() => removeAccount(a)} className={theme.btn.icon + ' hover:text-red-400 hover:bg-red-500/10'} title="Retirer">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalCarrier && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setModalCarrier(null)}>
          <div className="rounded-xl border p-6 w-full max-w-sm relative" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setModalCarrier(null)} className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-white/10 transition cursor-pointer">
              ✕
            </button>
            <h3 className="font-semibold text-gray-200 mb-5 text-center">
              {accountFor(modalCarrier) ? 'Modifier' : 'Connecter'} {CARRIERS.find(c => c.code === modalCarrier)?.label}
            </h3>
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-lg font-bold text-violet-600 shadow">
                {CARRIERS.find(c => c.code === modalCarrier)?.label[0]}
              </div>
            </div>
            <label className={theme.labelDark}>Sélectionnez la ville de départ</label>
            <select value={departureWilaya} onChange={e => setDepartureWilaya(e.target.value)} className={theme.inputDark + ' mb-3 cursor-pointer'}>
              <option value="">Sélectionnez la ville de départ</option>
              {WILAYAS.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
            </select>
            <label className={theme.labelDark}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Entrez le nom de l'entreprise" className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>Entrez votre clé API</label>
            <input value={apiId} onChange={e => setApiId(e.target.value)} placeholder="Entrez votre clé API" className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>Entrez votre jeton API</label>
            <input value={apiToken} onChange={e => setApiToken(e.target.value)} type="password" placeholder="Entrez votre jeton API" className={theme.inputDark + ' mb-3'} />
            <label className="flex items-center justify-between text-sm text-gray-300 mb-5">
              Actif
              <StatusToggle active={isActive} onChange={() => setIsActive(v => !v)} />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setModalCarrier(null)} className={theme.btn.secondary + ' flex-1 cursor-pointer'}>Fermer</button>
              <button onClick={saveAccount} disabled={saving} className={theme.btn.primary + ' flex-1 cursor-pointer'}>
                {saving ? '…' : (accountFor(modalCarrier) ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
