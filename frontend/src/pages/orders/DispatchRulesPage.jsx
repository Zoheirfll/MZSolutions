import { useEffect, useState, useCallback, useRef } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import EmptyState from '../../components/EmptyState'
import api from '../../api/axios'
import { theme } from '../../theme'
import { WILAYAS } from '../../data/wilayas'

// Règles de dispatch automatique (équivalent RiseCart "Dispatch Commandes") —
// à la création d'une commande, une règle correspondante (produit ou wilaya)
// route directement vers le confirmateur/transporteur ciblé, en priorité sur
// le round-robin/transporteur par défaut habituel. Composant partagé entre
// les 3 pages (par confirmateur / par société de livraison / par wilaya),
// paramétré par `matchType` et les cibles autorisées.
export default function DispatchRulesPage({ title, subtitle, matchType, allowConfirmateur, allowCarrier, matchLabel }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmateurs, setConfirmateurs] = useState([])
  const [carriers, setCarriers] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [matchValue, setMatchValue] = useState('')
  const [confirmateurId, setConfirmateurId] = useState('')
  const [carrierId, setCarrierId] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState([])
  const [productSearching, setProductSearching] = useState(false)
  const searchTimer = useRef(null)

  const fetchRules = useCallback(() => {
    setLoading(true)
    api.get(`/stores/me/dispatch-rules/?match_type=${matchType}`)
      .then(({ data }) => setRules(allowConfirmateur && !allowCarrier ? data.filter(r => r.confirmateur) : allowCarrier && !allowConfirmateur ? data.filter(r => r.carrier) : data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [matchType, allowConfirmateur, allowCarrier])

  useEffect(() => { fetchRules() }, [fetchRules])
  useEffect(() => {
    if (allowConfirmateur) api.get('/team/members/?role=confirmateur').then(({ data }) => setConfirmateurs(data)).catch(() => {})
    if (allowCarrier) api.get('/stores/me/carriers/').then(({ data }) => setCarriers(data.filter(c => c.is_active))).catch(() => {})
  }, [allowConfirmateur, allowCarrier])

  const openModal = () => {
    setMatchValue('')
    setProductSearch('')
    setProductResults([])
    setConfirmateurId('')
    setCarrierId('')
    setModalOpen(true)
  }

  // Recherche produit en direct (comme "Nouvelle commande") — l'ancien champ
  // texte libre laissait croire à une recherche cassée puisque rien ne
  // s'affichait ; ici on interroge vraiment le catalogue.
  useEffect(() => {
    if (matchType !== 'product') return
    clearTimeout(searchTimer.current)
    if (!productSearch.trim()) { setProductResults([]); return }
    setProductSearching(true)
    searchTimer.current = setTimeout(() => {
      api.get(`/products/?search=${encodeURIComponent(productSearch)}&per_page=8`)
        .then(({ data }) => setProductResults(data.results || []))
        .catch(() => {})
        .finally(() => setProductSearching(false))
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [productSearch, matchType])

  const save = async () => {
    if (!matchValue || (!confirmateurId && !carrierId)) return
    setSaving(true)
    try {
      await api.post('/stores/me/dispatch-rules/', {
        match_type: matchType,
        match_value: matchValue,
        confirmateur: confirmateurId || null,
        carrier: carrierId || null,
      })
      setModalOpen(false)
      fetchRules()
      setToast({ type: 'success', message: 'Règle ajoutée.' })
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || Object.values(err.response?.data || {})[0] || "Échec de l'ajout." })
    } finally { setSaving(false) }
  }

  const toggleActive = async (rule) => {
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
    try {
      await api.put(`/stores/me/dispatch-rules/${rule.id}/`, { is_active: !rule.is_active })
    } catch { fetchRules() }
  }

  const remove = async (rule) => {
    if (!confirm('Supprimer cette règle ?')) return
    await api.delete(`/stores/me/dispatch-rules/${rule.id}/`)
    fetchRules()
  }

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      <div className="flex justify-end mb-5">
        <button onClick={openModal} className={theme.btn.primary + ' cursor-pointer'}>Ajouter</button>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-160">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">{matchLabel.toUpperCase()}</th>
              {allowConfirmateur && <th className="px-4 py-3 font-medium">CONFIRMATEUR</th>}
              {allowCarrier && <th className="px-4 py-3 font-medium">TRANSPORTEUR</th>}
              <th className="px-4 py-3 font-medium">ACTIF</th>
              <th className="px-4 py-3 font-medium text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-app-muted">Chargement…</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={6}><EmptyState title="Aucune donnée trouvée" description="Ajoutez une règle pour router automatiquement les commandes correspondantes." /></td></tr>
            ) : rules.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-muted">#{r.id}</td>
                <td className="px-4 py-3 text-app-primary font-medium">{r.match_value}</td>
                {allowConfirmateur && <td className="px-4 py-3 text-app-muted-light">{r.confirmateur_name || '—'}</td>}
                {allowCarrier && <td className="px-4 py-3 text-app-muted-light">{r.carrier_label || '—'}</td>}
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(r)} role="switch" aria-checked={r.is_active}
                    className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer"
                    style={{ background: r.is_active ? '#7c3aed' : theme.dark.border }}>
                    <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" style={{ transform: r.is_active ? 'translateX(18px)' : 'translateX(3px)' }} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(r)} className={theme.btn.icon + ' hover:text-red-400 hover:bg-red-500/10'} title="Supprimer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setModalOpen(false)}>
          <div className="rounded-xl border p-6 w-full max-w-sm" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-app-primary mb-5">{title}</h3>

            {matchType === 'product' ? (
              <div className="mb-3">
                <label className={theme.labelDark}>Recherche de produit</label>
                {matchValue ? (
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm text-app-primary" style={bdrStyle}>
                    <span className="truncate">{matchValue}</span>
                    <button type="button" onClick={() => { setMatchValue(''); setProductSearch('') }} className="text-app-muted-light hover:text-app-primary transition cursor-pointer shrink-0 ml-2">✕</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Tapez le nom d'un produit…"
                      className={inputCls} style={bdrStyle}
                    />
                    {(productResults.length > 0 || productSearching) && (
                      <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border overflow-hidden shadow-xl max-h-48 overflow-y-auto"
                        style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
                        {productSearching && <p className="px-3.5 py-2 text-xs text-app-muted">Recherche…</p>}
                        {productResults.map(p => (
                          <button key={p.id} type="button"
                            onClick={() => { setMatchValue(p.name); setProductResults([]) }}
                            className="w-full text-left px-3.5 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <label className={theme.labelDark}>Wilaya</label>
                <Select value={matchValue} onChange={setMatchValue} options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
                  placeholder="Choisissez une wilaya" className={inputCls + ' mb-3'} style={{ ...bdrStyle, background: theme.dark.sidebar }} />
              </>
            )}

            {allowConfirmateur && (
              <>
                <label className={theme.labelDark}>Confirmateur</label>
                <Select value={confirmateurId} onChange={setConfirmateurId}
                  options={[{ value: '', label: 'Aucun' }, ...confirmateurs.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name}` }))]}
                  className={inputCls + ' mb-3'} style={{ ...bdrStyle, background: theme.dark.sidebar }} />
              </>
            )}
            {allowCarrier && (
              <>
                <label className={theme.labelDark}>Entreprise de livraison</label>
                <Select value={carrierId} onChange={setCarrierId}
                  options={[{ value: '', label: 'Aucune' }, ...carriers.map(c => ({ value: c.id, label: c.carrier_label }))]}
                  className={inputCls + ' mb-4'} style={{ ...bdrStyle, background: theme.dark.sidebar }} />
              </>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModalOpen(false)} className={theme.btn.secondary + ' flex-1 cursor-pointer'}>Fermer</button>
              <button onClick={save} disabled={saving || !matchValue || (!confirmateurId && !carrierId)} className={theme.btn.primary + ' flex-1 cursor-pointer disabled:opacity-50'}>
                {saving ? '…' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </DashboardLayout>
  )
}
