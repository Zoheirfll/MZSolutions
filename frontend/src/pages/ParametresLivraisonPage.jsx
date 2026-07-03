import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { theme } from '../theme'

const CARRIERS = [
  { code: 'yalidine',   label: 'Yalidine' },
  { code: 'zr_express', label: 'ZR Express' },
]

export default function ParametresLivraisonPage() {
  const [accounts, setAccounts]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [modalCarrier, setModalCarrier] = useState(null)
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
      const payload = { api_id: apiId, api_token: apiToken, is_active: isActive }
      if (existing) {
        await api.put(`/stores/me/carriers/${existing.id}/`, payload)
      } else {
        await api.post('/stores/me/carriers/', { carrier: modalCarrier, ...payload })
      }
      setModalCarrier(null)
      fetchAccounts()
    } catch {} finally { setSaving(false) }
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
              <div key={c.code} className="rounded-xl border p-5 flex flex-col items-center text-center gap-3"
                style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center text-lg font-bold text-violet-300">
                  {c.label[0]}
                </div>
                <p className="font-semibold text-gray-200">{c.label}</p>
                {account ? (
                  <>
                    <span className={theme.badge.success}>Connecté</span>
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: theme.dark.muted }}>
                      <input type="checkbox" checked={account.is_default} onChange={() => toggleDefault(account)} />
                      Transporteur par défaut
                    </label>
                    <div className="flex gap-2 w-full">
                      <button onClick={() => openModal(c.code)} className={theme.btn.outline + ' flex-1 text-xs'}>Modifier</button>
                      <button onClick={() => removeAccount(account)} className={theme.btn.danger + ' flex-1 text-xs'}>Retirer</button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => openModal(c.code)} className={theme.btn.primary + ' w-full'}>Ajouter</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalCarrier && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setModalCarrier(null)}>
          <div className="rounded-xl border p-6 w-full max-w-sm relative" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setModalCarrier(null)} className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-white/10 transition">
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
            <label className={theme.labelDark}>Clé API</label>
            <input value={apiId} onChange={e => setApiId(e.target.value)} placeholder="Entrez votre clé API" className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>Jeton API</label>
            <input value={apiToken} onChange={e => setApiToken(e.target.value)} type="password" placeholder="Entrez votre jeton API" className={theme.inputDark + ' mb-3'} />
            <label className="flex items-center gap-2 text-sm text-gray-300 mb-5 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              Actif
            </label>
            <div className="flex gap-2">
              <button onClick={() => setModalCarrier(null)} className={theme.btn.secondary + ' flex-1'}>Fermer</button>
              <button onClick={saveAccount} disabled={saving} className={theme.btn.primary + ' flex-1'}>
                {saving ? '…' : (accountFor(modalCarrier) ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
