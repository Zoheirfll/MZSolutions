import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const STATUS_OPTIONS = [
  { value: 'open',     label: 'En attente' },
  { value: 'approved', label: 'Approuvé' },
  { value: 'rejected', label: 'Refusé' },
]

const STATUS_BADGE = {
  open:     theme.badge.warning,
  approved: theme.badge.success,
  rejected: theme.badge.danger,
}

function BackIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

export default function ExchangeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exchange, setExchange] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [newStatus, setNewStatus] = useState('')
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border, background: theme.dark.sidebar }

  const fetchExchange = useCallback(() => {
    setLoading(true)
    api.get(`/orders/exchanges/${id}/`)
      .then(({ data }) => { setExchange(data); setNewStatus(data.status) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchExchange() }, [fetchExchange])

  const changeStatus = async () => {
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post(`/orders/exchanges/${id}/status/`, { status: newStatus, note })
      setExchange(data)
      fetchExchange()
    } catch (err) {
      setError(err.response?.data?.detail || 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Échange">
        <p className="text-center text-gray-500 py-12">Chargement…</p>
      </DashboardLayout>
    )
  }

  if (!exchange) {
    return (
      <DashboardLayout title="Échange">
        <p className="text-center text-gray-500 py-12">Échange introuvable.</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title={`Échange #${exchange.id}`}>
      <button onClick={() => navigate('/dashboard/echanges')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition mb-5">
        <BackIcon /> Retour aux échanges
      </button>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Colonne principale */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <div>
                <p className="text-xs" style={{ color: theme.dark.muted }}>
                  Commande <Link to={`/dashboard/commandes/${exchange.order}`} className="text-violet-300 hover:text-violet-200">{exchange.order_display}</Link> · {exchange.order_phone}
                </p>
                <h2 className="text-lg font-semibold text-gray-100 mt-1">{exchange.original_product}</h2>
              </div>
              <span className={STATUS_BADGE[exchange.status] || theme.badge.neutral}>{exchange.status_label}</span>
            </div>

            <div className="flex items-center gap-3 mb-4 text-sm">
              <span className="text-gray-400">Variante demandée en échange :</span>
              <span className={theme.badge.info}>{exchange.replacement_value}</span>
            </div>

            <p className="text-xs mb-1.5" style={{ color: theme.dark.muted }}>Motif du client</p>
            <p className="text-sm text-gray-300 whitespace-pre-line">{exchange.reason}</p>

            {exchange.vendor_note && (
              <>
                <p className="text-xs mt-4 mb-1.5" style={{ color: theme.dark.muted }}>Note vendeur</p>
                <p className="text-sm text-gray-300 whitespace-pre-line">{exchange.vendor_note}</p>
              </>
            )}

            <p className="text-xs mt-4" style={{ color: theme.dark.muted }}>Déposée le {new Date(exchange.created_at).toLocaleString('fr-DZ')}</p>
          </div>

          {/* Mouvements de stock */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Mouvements de stock</h3>
            {exchange.stock_movements.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: theme.dark.muted }}>
                Aucun mouvement pour l'instant — généré automatiquement une fois l'échange approuvé.
              </p>
            ) : (
              <div className="space-y-2">
                {exchange.stock_movements.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ background: theme.dark.sidebar }}>
                    <div>
                      <p className="text-sm text-gray-200">{m.reason_label}</p>
                      <p className="text-xs" style={{ color: theme.dark.muted }}>
                        {m.product_name}{m.option_value ? ` — ${m.option_value}` : ''} · {new Date(m.created_at).toLocaleString('fr-DZ')}
                      </p>
                    </div>
                    <span className={m.quantity > 0 ? theme.badge.success : theme.badge.danger}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite */}
        <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-4">
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Traiter la demande</h3>
            {exchange.status !== 'open' ? (
              <p className="text-xs" style={{ color: theme.dark.muted }}>Cette demande a déjà été traitée.</p>
            ) : (
              <>
                <Select value={newStatus} onChange={setNewStatus} options={STATUS_OPTIONS} className={inputCls + ' mb-2'} style={bdrStyle} />
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none mb-3`} style={bdrStyle} placeholder="Note (optionnel)" />
                {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
                <button onClick={changeStatus} disabled={saving || newStatus === exchange.status} className={theme.btn.primary + ' w-full disabled:opacity-50'}>
                  {saving ? '…' : 'Appliquer'}
                </button>
                {newStatus === 'approved' && (
                  <p className="text-[10px] mt-2" style={{ color: theme.dark.muted }}>
                    Approuver déclenche automatiquement les mouvements de stock (retour + sortie).
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
