import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import EmptyState from '../../components/EmptyState'
import api from '../../api/axios'
import { theme } from '../../theme'

const TABS = [
  { key: 'pending',  label: 'À préparer' },
  { key: 'prepared', label: 'Préparées' },
]

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 2v6h-6M3 22v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0020.49 15" />
    </svg>
  )
}

export default function PreparedOrdersPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const [data, setData] = useState({ results: [], count: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [marking, setMarking] = useState(false)
  const perPage = 20

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ state: tab, page, per_page: perPage })
    if (search) params.set('search', search)
    api.get(`/orders/prepared/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tab, page, search])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1); setSelected([]) }, [tab, search])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const allSelected = data.results.length > 0 && selected.length === data.results.length
  const toggleAll = () => setSelected(allSelected ? [] : data.results.map(o => o.id))
  const toggleOne = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const markSelectedPrepared = async () => {
    if (!selected.length) return
    setMarking(true)
    try {
      await api.post('/orders/prepared/mark/', { ids: selected })
      setSelected([])
      fetchData()
    } catch {} finally { setMarking(false) }
  }

  return (
    <DashboardLayout title="Commandes préparées" subtitle={`Marquez les commandes confirmées comme "préparées" une fois le colis emballé, avant remise au transporteur — indépendant de l'impression de l'étiquette. Sélectionnez plusieurs lignes puis "Update selected state" pour marquer un lot d'un coup.`}>
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher nom, téléphone ou suivi (scan)…"
          autoFocus
          className="px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition w-full sm:w-80"
          style={{ borderColor: theme.dark.border }}
        />
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className={theme.btn.icon} title="Rafraîchir">
            <RefreshIcon />
          </button>
          {tab === 'pending' && (
            <button onClick={markSelectedPrepared} disabled={!selected.length || marking} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-50 cursor-pointer">
              <CheckIcon />
              {marking ? '…' : `Update selected state${selected.length ? ` (${selected.length})` : ''}`}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{data.count} commande{data.count !== 1 ? 's' : ''}.</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              {tab === 'pending' && (
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-violet-600 w-4 h-4 cursor-pointer" />
                </th>
              )}
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">EMPLACEMENT</th>
              <th className="px-4 py-3 font-medium">PRIX TOTAL</th>
              <th className="px-4 py-3 font-medium">SUIVI</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-16">
                <div className="flex items-center justify-center gap-2 text-app-muted">
                  <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Chargement…
                </div>
              </td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState title="Aucune donnée" description="Rien à afficher dans cette étape pour l'instant." />
              </td></tr>
            ) : data.results.map(o => (
              <tr key={o.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                {tab === 'pending' && (
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleOne(o.id)} className="accent-violet-600 w-4 h-4 cursor-pointer" />
                  </td>
                )}
                <td className="px-4 py-3 text-app-muted cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${o.id}`)}>#{o.id}</td>
                <td className="px-4 py-3 text-app-primary font-medium cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${o.id}`)}>{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-app-muted-light">{o.phone}</td>
                <td className="px-4 py-3 text-app-primary">{o.wilaya}</td>
                <td className="px-4 py-3 text-app-primary">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 font-mono text-xs text-violet-300">{o.carrier_tracking_number || '—'}</td>
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
