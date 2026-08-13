import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import EmptyState from '../../components/EmptyState'
import api from '../../api/axios'
import { theme } from '../../theme'

const TABS = [
  { key: 'pending',   label: "Ticket en attente d'impression" },
  { key: 'generated', label: 'PDF généré' },
  { key: 'printed',   label: 'Ticket imprimé' },
]

function PrinterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
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

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function LabelsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const [data, setData] = useState({ results: [], count: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [printing, setPrinting] = useState(false)
  const [markingId, setMarkingId] = useState(null)
  const [error, setError] = useState('')
  const perPage = 20

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ state: tab, page, per_page: perPage })
    if (search) params.set('search', search)
    api.get(`/orders/labels/?${params}`)
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

  const printSelected = async () => {
    const ids = selected.length ? selected : data.results.map(o => o.id)
    if (!ids.length) return
    setError('')
    setPrinting(true)
    try {
      const res = await api.get(`/orders/labels/print-all/?ids=${ids.join(',')}`, { responseType: 'blob' })
      downloadBlob(new Blob([res.data], { type: 'application/pdf' }), 'etiquettes.pdf')
      setSelected([])
      fetchData()
    } catch (err) {
      let detail = "Impossible de générer les étiquettes."
      if (err.response?.data instanceof Blob) {
        try { detail = JSON.parse(await err.response.data.text()).detail || detail } catch {}
      }
      setError(detail)
    } finally {
      setPrinting(false)
    }
  }

  const markPrinted = async (id) => {
    setMarkingId(id)
    try {
      await api.post(`/orders/${id}/label/mark-printed/`)
      fetchData()
    } catch {} finally { setMarkingId(null) }
  }

  const markSelectedPrinted = async () => {
    if (!selected.length) return
    setMarkingId('bulk')
    try {
      await Promise.all(selected.map(id => api.post(`/orders/${id}/label/mark-printed/`)))
      setSelected([])
      fetchData()
    } catch {} finally { setMarkingId(null) }
  }

  return (
    <DashboardLayout title="Étiquettes" subtitle={`Pipeline d'impression des étiquettes de livraison, en 3 étapes : les commandes expédiées attendent d'abord leur étiquette (${"Ticket en attente d'impression"}), puis passent à "PDF généré" dès que l'étiquette a été téléchargée au moins une fois, et enfin à "Ticket imprimé" une fois que vous confirmez l'avoir collée sur le colis. Sélectionnez plusieurs lignes pour imprimer ou marquer imprimé en groupe.`}>
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm text-red-400 border border-red-800 bg-red-900/10">{error}</div>
      )}

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
          {tab !== 'printed' && (
            <button onClick={printSelected} disabled={printing || !data.results.length} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-50 cursor-pointer">
              <PrinterIcon />
              {printing ? 'Génération…' : selected.length ? `Imprimer (${selected.length})` : 'Print All'}
            </button>
          )}
          {tab === 'generated' && (
            <button onClick={markSelectedPrinted} disabled={!selected.length || markingId === 'bulk'} className={theme.btn.secondary + ' flex items-center gap-2 disabled:opacity-40'}>
              <CheckIcon />
              {markingId === 'bulk' ? '…' : 'Marquer imprimé'}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{data.count} commande{data.count !== 1 ? 's' : ''}.</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-violet-600 w-4 h-4 cursor-pointer" />
              </th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">EMPLACEMENT</th>
              <th className="px-4 py-3 font-medium">PRIX TOTAL</th>
              <th className="px-4 py-3 font-medium">SUIVI</th>
              {tab === 'generated' && <th className="px-4 py-3 font-medium text-right">ACTION</th>}
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
                <EmptyState title="Aucune donnée" description="Rien à afficher dans cette étape du pipeline pour l'instant." />
              </td></tr>
            ) : data.results.map(o => (
              <tr key={o.id} className="border-b hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleOne(o.id)} className="accent-violet-600 w-4 h-4 cursor-pointer" />
                </td>
                <td className="px-4 py-3 text-app-muted cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${o.id}`)}>#{o.id}</td>
                <td className="px-4 py-3 text-app-primary font-medium cursor-pointer" onClick={() => navigate(`/dashboard/commandes/${o.id}`)}>{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-app-muted-light">{o.phone}</td>
                <td className="px-4 py-3 text-app-primary">{o.wilaya}</td>
                <td className="px-4 py-3 text-app-primary">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 font-mono text-xs text-violet-300">{o.carrier_tracking_number || '—'}</td>
                {tab === 'generated' && (
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button onClick={() => markPrinted(o.id)} disabled={markingId === o.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-emerald-400 border border-emerald-800 hover:bg-emerald-900/20 transition disabled:opacity-50 cursor-pointer">
                      <CheckIcon /> {markingId === o.id ? '…' : 'Marquer imprimé'}
                    </button>
                  </td>
                )}
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
