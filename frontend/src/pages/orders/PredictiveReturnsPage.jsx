import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import EmptyState from '../../components/EmptyState'
import api from '../../api/axios'
import { theme } from '../../theme'

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 2v6h-6M3 22v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0020.49 15" />
    </svg>
  )
}

const REASON_LABELS = {
  tentative_echouee: 'Tentative échouée (transporteur)',
  client_a_risque:   'Client à risque (historique)',
}

export default function PredictiveReturnsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState({ results: [], count: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 20

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (search) params.set('search', search)
    api.get(`/orders/predictive-returns/?${params}`)
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search])

  const totalPages = Math.max(1, Math.ceil(data.count / perPage))

  return (
    <DashboardLayout title="Retour prédictif" subtitle={`Commandes en cours de livraison qui présentent un risque élevé de retour, calculé à partir de deux signaux : le client a un historique de commandes annulées/retournées (risque connu), ou le transporteur signale déjà une tentative de livraison échouée sur ce colis précis. Lecture seule — servez-vous-en pour relancer le client par téléphone avant que le colis ne revienne pour de bon.`}>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher nom, téléphone ou suivi…"
          className="px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition w-full sm:w-80"
          style={{ borderColor: theme.dark.border }}
        />
        <button onClick={fetchData} className={theme.btn.icon} title="Rafraîchir">
          <RefreshIcon />
        </button>
      </div>

      <p className="text-sm mb-3" style={{ color: theme.dark.muted }}>{data.count} commande{data.count !== 1 ? 's' : ''} à risque.</p>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-200">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">EMPLACEMENT</th>
              <th className="px-4 py-3 font-medium">COMMUNE</th>
              <th className="px-4 py-3 font-medium">PRIX TOTAL</th>
              <th className="px-4 py-3 font-medium">SUIVI</th>
              <th className="px-4 py-3 font-medium">RAISON</th>
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
                <EmptyState title="Aucune donnée" description="Aucune commande à risque de retour détectée pour l'instant." />
              </td></tr>
            ) : data.results.map(o => (
              <tr key={o.id} onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
                className="border-b hover:bg-violet-500/5 transition cursor-pointer" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-app-muted">#{o.id}</td>
                <td className="px-4 py-3 text-app-primary font-medium">{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-app-muted-light">{o.phone}</td>
                <td className="px-4 py-3 text-app-primary">{o.wilaya}</td>
                <td className="px-4 py-3 text-app-muted-light">{o.commune}</td>
                <td className="px-4 py-3 text-app-primary">{Number(o.total).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 font-mono text-xs text-app-muted-light">{o.carrier_tracking_number || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(o.risk_reasons || []).map(r => (
                      <span key={r} className={theme.badge.danger}>{REASON_LABELS[r] || r}</span>
                    ))}
                  </div>
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
