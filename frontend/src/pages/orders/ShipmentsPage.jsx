import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import StatusBadge from '../../components/StatusBadge'
import Select from '../../components/Select'
import EmptyState from '../../components/EmptyState'
import api from '../../api/axios'
import { theme } from '../../theme'

const STATUS_OPTIONS = [
  { value: '',          label: 'Tous les statuts' },
  { value: 'confirmed', label: 'Confirmée' },
  { value: 'shipped',   label: 'Expédiée' },
  { value: 'delivered', label: 'Livrée' },
  { value: 'returned',  label: 'Retournée' },
]

const PER_PAGE_OPTIONS = [10, 25, 50]

function DownloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

function ChevronLeftIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M9 18l6-6-6-6" />
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

function TruckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M10 17h4V5H2v12h3" />
      <path d="M20 17h2v-3.34a4 4 0 00-1.17-2.83L19 9h-5v8h1" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  )
}

export default function ShipmentsPage() {
  const navigate = useNavigate()

  const [data,       setData]       = useState({ results: [], count: 0 })
  const [carriers,   setCarriers]   = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [carrierFilter, setCarrierFilter] = useState('')
  const [search,     setSearch]     = useState('')
  const [page,       setPage]       = useState(1)
  const [perPage,    setPerPage]    = useState(10)
  const [loading,    setLoading]    = useState(true)
  const [labelError, setLabelError] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)
  const [retryingId, setRetryingId] = useState(null)
  const [syncingId, setSyncingId] = useState(null)

  useEffect(() => {
    api.get('/stores/me/carriers/').then(({ data: d }) => setCarriers(d)).catch(() => {})
  }, [])

  const fetchShipments = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, per_page: perPage })
    if (statusFilter) params.set('status', statusFilter)
    if (carrierFilter) params.set('carrier', carrierFilter)
    if (search) params.set('search', search)
    api.get(`/orders/shipments/?${params}`)
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, perPage, statusFilter, carrierFilter, search])

  useEffect(() => { fetchShipments() }, [fetchShipments])
  useEffect(() => { setPage(1) }, [statusFilter, carrierFilter, search])

  const downloadLabel = async (order) => {
    setLabelError('')
    setDownloadingId(order.id)
    try {
      const res = await api.get(`/orders/${order.id}/label/`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `etiquette-${order.id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      let detail = "Impossible de récupérer l'étiquette."
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          detail = JSON.parse(text).detail || detail
        } catch {}
      } else if (err.response?.data?.detail) {
        detail = err.response.data.detail
      }
      setLabelError(`Commande #${order.id} — ${detail}`)
    } finally {
      setDownloadingId(null)
    }
  }

  const retryShipment = async (order) => {
    setLabelError('')
    setRetryingId(order.id)
    try {
      await api.post(`/orders/${order.id}/retry-shipment/`)
      fetchShipments()
    } catch (err) {
      setLabelError(`Commande #${order.id} — ${err.response?.data?.detail || "Impossible de créer l'expédition."}`)
    } finally {
      setRetryingId(null)
    }
  }

  const syncTracking = async (order) => {
    setLabelError('')
    setSyncingId(order.id)
    try {
      await api.post(`/orders/${order.id}/sync-tracking/`)
      fetchShipments()
    } catch (err) {
      setLabelError(`Commande #${order.id} — ${err.response?.data?.detail || 'Impossible de rafraîchir le statut.'}`)
    } finally {
      setSyncingId(null)
    }
  }

  const shipments  = data.results || []
  const totalPages = Math.max(1, Math.ceil(data.count / perPage))
  const carrierOptions = [{ value: '', label: 'Tous les transporteurs' }, ...carriers.map(c => ({ value: c.id, label: c.name || c.carrier }))]

  return (
    <DashboardLayout title="Expéditions" subtitle={`Cette page suit vos commandes déjà expédiées chez le transporteur : où en est la livraison, si elle a été remise au livreur, livrée ou retournée. Vous pouvez rafraîchir le statut manuellement ("synchroniser") ou télécharger l'étiquette de livraison en PDF à coller sur le colis avant l'enlèvement.`}>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Recherche nom, téléphone, tracking"
          className="px-3 py-2 rounded-lg border text-sm text-app-primary outline-none focus:border-violet-500 transition w-full sm:w-64"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}
        />
        <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS}
          className="px-3 py-2 rounded-lg border text-app-primary text-sm"
          style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 180 }} />
        <Select value={carrierFilter} onChange={setCarrierFilter} options={carrierOptions}
          className="px-3 py-2 rounded-lg border text-app-primary text-sm"
          style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 200 }} />
      </div>

      {labelError && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm text-red-400 border border-red-800 bg-red-900/10">
          {labelError}
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto mb-4" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">COMMANDE</th>
              <th className="px-4 py-3 font-medium">CLIENT</th>
              <th className="px-4 py-3 font-medium">WILAYA</th>
              <th className="px-4 py-3 font-medium">TRANSPORTEUR</th>
              <th className="px-4 py-3 font-medium">TRACKING</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">ÉTIQUETTE</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
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
            ) : shipments.length === 0 ? (
              <tr><td colSpan={8}>
                <EmptyState title="Aucune expédition trouvée" description="Les commandes confirmées, expédiées, livrées ou retournées apparaîtront ici." />
              </td></tr>
            ) : shipments.map(o => (
              <tr
                key={o.id}
                onClick={() => navigate(`/dashboard/commandes/${o.id}`)}
                className="border-b hover:bg-violet-500/5 transition cursor-pointer"
                style={{ borderColor: theme.dark.borderRowHover }}
              >
                <td className="px-4 py-3 text-app-muted">#{o.id}</td>
                <td className="px-4 py-3 text-app-primary font-medium">{o.first_name} {o.last_name}</td>
                <td className="px-4 py-3 text-app-primary">{o.wilaya}</td>
                <td className="px-4 py-3 text-app-primary">{o.carrier_label || '—'}</td>
                <td className="px-4 py-3 text-app-muted-light font-mono text-xs">{o.carrier_tracking_number || '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.status} />
                  {o.carrier_status && o.carrier_status !== 'created' && (
                    <p className="text-[11px] mt-1" style={{ color: theme.dark.muted }}>{o.carrier_status}</p>
                  )}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  {o.carrier_tracking_number ? (
                    <button
                      onClick={() => downloadLabel(o)}
                      disabled={downloadingId === o.id}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-violet-400 border border-violet-800 hover:bg-violet-900/20 transition disabled:opacity-50"
                    >
                      <DownloadIcon /> {downloadingId === o.id ? '…' : 'Étiquette'}
                    </button>
                  ) : (
                    <span className="text-app-muted text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  {!o.carrier_tracking_number && ['confirmed', 'shipped'].includes(o.status) ? (
                    <button
                      onClick={() => retryShipment(o)}
                      disabled={retryingId === o.id}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-emerald-400 border border-emerald-800 hover:bg-emerald-900/20 transition disabled:opacity-50"
                    >
                      <TruckIcon /> {retryingId === o.id ? '…' : 'Créer l’expédition'}
                    </button>
                  ) : o.carrier_tracking_number ? (
                    <button
                      onClick={() => syncTracking(o)}
                      disabled={syncingId === o.id}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-app-primary border hover:bg-violet-500/5 transition disabled:opacity-50"
                      style={{ borderColor: theme.dark.border }}
                    >
                      <RefreshIcon /> {syncingId === o.id ? '…' : 'Actualiser'}
                    </button>
                  ) : (
                    <span className="text-app-muted text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm" style={{ color: theme.dark.muted }}>
        <p>{data.count} expédition{data.count !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            Lignes par page :
            <Select value={perPage} onChange={v => { setPerPage(Number(v)); setPage(1) }}
              options={PER_PAGE_OPTIONS.map(n => ({ value: n, label: n }))}
              className="px-2 py-1 rounded-lg border text-app-primary text-xs"
              style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 64 }} />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-violet-500/5 flex items-center justify-center">
              <ChevronLeftIcon />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className={`px-2.5 py-1 rounded text-xs transition ${page === n ? 'bg-violet-600 text-white' : ''}`}
                style={page === n ? undefined : { color: theme.dark.muted }}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded disabled:opacity-30 hover:bg-violet-500/5 flex items-center justify-center">
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
