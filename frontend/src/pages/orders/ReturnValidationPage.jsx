import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import EmptyState from '../../components/EmptyState'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const SUBSTATUS_OPTIONS = [
  { value: '',                    label: 'Tous les sous-statuts' },
  { value: 'pending_processing',  label: 'En attente de traitement' },
  { value: 'accepted',            label: 'Accepté' },
  { value: 'cancelled',           label: 'Annulé' },
  { value: 'unreachable',         label: 'Injoignable' },
]

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 2v6h-6M3 22v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0020.49 15" />
    </svg>
  )
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export default function ReturnValidationPage() {
  const navigate = useNavigate()
  const [data, setData] = useState({ results: [], count: 0 })
  const [search, setSearch] = useState('')
  const [substatus, setSubstatus] = useState('')
  const [showValidated, setShowValidated] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [validatingId, setValidatingId] = useState(null)
  const [restockChecked, setRestockChecked] = useState({})
  const perPage = 20

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage, validated: showValidated ? '1' : '0' })
    if (search) params.set('search', search)
    if (substatus) params.set('substatus', substatus)
    api.get(`/orders/returns/?${params}`)
      .then(({ data }) => {
        setData(data)
        // Case "remettre en stock" cochée par défaut pour chaque nouvelle ligne
        setRestockChecked(prev => {
          const next = { ...prev }
          for (const o of data.results) if (!(o.id in next)) next[o.id] = true
          return next
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search, substatus, showValidated])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, substatus, showValidated])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  const validateReturn = async (id) => {
    setValidatingId(id)
    try {
      await api.post(`/orders/${id}/validate-return/`, { restock: !!restockChecked[id] })
      fetchData()
    } catch {} finally { setValidatingId(null) }
  }

  return (
    <DashboardLayout title="Validation des retours" subtitle={`Commandes réellement retournées par le transporteur (pas simplement annulées) — confirmez ici que vous avez physiquement reçu et vérifié le colis. La case "Remettre en stock" (cochée par défaut) recrédite automatiquement les articles ; décochez-la si la marchandise revient abîmée ou invendable. Le filtre "sous-statut" reprend le même tag manuel que la page Suivi transporteur.`}>
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        <button onClick={() => setShowValidated(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${!showValidated ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}>
          À valider
        </button>
        <button onClick={() => setShowValidated(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${showValidated ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}>
          Validés
        </button>
      </div>

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher nom, téléphone ou suivi…"
            className="px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition w-full sm:w-72"
            style={{ borderColor: theme.dark.border }}
          />
          <div style={{ width: 210 }}>
            <Select
              value={substatus}
              onChange={setSubstatus}
              options={SUBSTATUS_OPTIONS}
              className="px-3 py-2 rounded-lg border text-sm text-app-primary"
              style={{ background: 'transparent', borderColor: theme.dark.border }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className={theme.btn.icon} title="Rafraîchir">
            <RefreshIcon />
          </button>
          <button onClick={() => navigate('/dashboard/commandes/nouvelle')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition">
            + Créer une commande
          </button>
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{data.count} commande{data.count !== 1 ? 's' : ''}.</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-200">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">EMPLACEMENT</th>
              <th className="px-4 py-3 font-medium">PRIX TOTAL</th>
              <th className="px-4 py-3 font-medium">SUIVI</th>
              <th className="px-4 py-3 font-medium">SOCIÉTÉ</th>
              <th className="px-4 py-3 font-medium text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={8}>
                <EmptyState title="Aucune donnée" description="Rien à valider pour l'instant." />
              </td></tr>
            ) : data.results.map(o => (
              <tr key={o.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-muted cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${o.id}`)}>#{o.id}</td>
                <td className="px-4 py-3 text-app-primary font-medium cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${o.id}`)}>{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-app-muted-light">{o.phone}</td>
                <td className="px-4 py-3 text-app-primary">{o.wilaya}</td>
                <td className="px-4 py-3 text-app-primary">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 font-mono text-xs text-violet-300">{o.carrier_tracking_number || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light">{o.carrier_label || '—'}</td>
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  {o.return_validated_at ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className={theme.badge.success}>Validé</span>
                      {o.restocked_at && <span className="text-[11px]" style={{ color: theme.dark.muted }}>Remis en stock</span>}
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: theme.dark.muted }}>
                        <input
                          type="checkbox"
                          checked={!!restockChecked[o.id]}
                          onChange={e => setRestockChecked(prev => ({ ...prev, [o.id]: e.target.checked }))}
                          className="accent-violet-600 w-3.5 h-3.5 cursor-pointer"
                        />
                        Remettre en stock
                      </label>
                      <button onClick={() => validateReturn(o.id)} disabled={validatingId === o.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-emerald-400 border border-emerald-800 hover:bg-emerald-900/20 transition disabled:opacity-50 cursor-pointer">
                        <CheckIcon /> {validatingId === o.id ? '…' : 'Confirmer réception'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.count > perPage && (
        <div className="flex items-center justify-end gap-2 mt-4 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">← Précédent</button>
          <span className={theme.badge.info}>{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-violet-500/5 transition">Suivant →</button>
        </div>
      )}
    </DashboardLayout>
  )
}
