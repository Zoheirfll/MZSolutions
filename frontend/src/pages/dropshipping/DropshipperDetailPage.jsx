import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'

const COMMISSION_TYPE_OPTIONS = [
  { value: 'percentage', label: 'Pourcentage (%)' },
  { value: 'fixed',      label: 'Montant fixe / unité' },
]

const money = v => `${Number(v || 0).toLocaleString('fr-DZ')} DZD`

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">Chargement…</span>
    </div>
  )
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function CommissionRow({ dropshipperId, item, commission, onSaved }) {
  const [type, setType]     = useState(commission?.commission_type || 'percentage')
  const [value, setValue]   = useState(commission?.value ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]   = useState('')

  const inputCls = 'w-28 px-2.5 py-1.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const save = async () => {
    if (value === '' || Number.isNaN(Number(value))) return
    setSaving(true)
    setError('')
    try {
      await api.post('/dropshipping/commissions/', {
        dropshipper: dropshipperId, product: item.product, commission_type: type, value,
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!commission || !confirm('Supprimer cette commission ?')) return
    setDeleting(true)
    try {
      await api.delete(`/dropshipping/commissions/${commission.id}/`)
      setType('percentage')
      setValue('')
      onSaved()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <tr className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
      <td className="px-4 py-3 text-gray-200">
        <Link to={`/dashboard/produits/${item.product}/modifier`} className="hover:text-violet-300 transition">{item.product_name}</Link>
      </td>
      <td className="px-4 py-3 text-gray-400">{money(item.product_price)}</td>
      <td className="px-4 py-3">
        <div className="w-44">
          <Select value={type} onChange={setType} options={COMMISSION_TYPE_OPTIONS} variant="dark" />
        </div>
      </td>
      <td className="px-4 py-3">
        <input value={value} onChange={e => setValue(e.target.value)} placeholder="0" className={inputCls} style={bdrStyle} />
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition">
            {saving ? '…' : 'Enregistrer'}
          </button>
          {commission && (
            <button onClick={remove} disabled={deleting} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer disabled:opacity-50" title="Supprimer la commission">
              <TrashIcon />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function DropshipperDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail]           = useState(null)
  const [products, setProducts]       = useState([])
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [paying, setPaying]           = useState(false)
  const [payNote, setPayNote]         = useState('')
  const [entriesPage, setEntriesPage]   = useState(1)
  const [paymentsPage, setPaymentsPage] = useState(1)

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      api.get(`/dropshipping/dropshippers/${id}/?entries_page=${entriesPage}&payments_page=${paymentsPage}`),
      api.get(`/dropshipping/products/?dropshipper=${id}`),
      api.get(`/dropshipping/commissions/?dropshipper=${id}`),
    ]).then(([d, p, c]) => {
      setDetail(d.data)
      setProducts(p.data)
      setCommissions(c.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [id, entriesPage, paymentsPage])

  const handlePay = async () => {
    if (!confirm(`Marquer ${money(detail.balance)} comme payé à ${detail.first_name} ${detail.last_name} ?`)) return
    setPaying(true)
    try {
      await api.post(`/dropshipping/dropshippers/${id}/pay/`, { note: payNote })
      setPayNote('')
      setPaymentsPage(1)
      fetchAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors du paiement.')
    } finally {
      setPaying(false)
    }
  }

  const commissionByProduct = Object.fromEntries(commissions.map(c => [c.product, c]))
  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  if (loading || !detail) {
    return <DashboardLayout title="Dropshipper"><Spinner /></DashboardLayout>
  }

  const entriesTotalPages  = Math.max(1, Math.ceil((detail.entries_count || 0) / 10))
  const paymentsTotalPages = Math.max(1, Math.ceil((detail.payments_count || 0) / 10))

  return (
    <DashboardLayout title={`${detail.first_name} ${detail.last_name}`}>
      <button onClick={() => navigate('/dashboard/dropshipping')} className="text-xs text-gray-500 hover:text-gray-300 transition mb-5 cursor-pointer">
        ← Retour à la liste des dropshippers
      </button>

      <p className="text-xs mb-5" style={{ color: theme.dark.muted }}>
        {detail.phone || 'Téléphone non renseigné'}{detail.wilaya ? ` · ${detail.wilaya}` : ''}{detail.commune ? `, ${detail.commune}` : ''}
      </p>

      {/* Solde */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>Total gagné</p>
          <p className="text-xl font-semibold text-gray-200">{money(detail.total_earned)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>Total payé</p>
          <p className="text-xl font-semibold text-gray-200">{money(detail.total_paid)}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-xs mb-1" style={{ color: theme.dark.muted }}>Solde à payer</p>
          <p className={`text-xl font-semibold ${Number(detail.balance) > 0 ? 'text-amber-400' : 'text-gray-200'}`}>{money(detail.balance)}</p>
        </div>
      </div>

      {Number(detail.balance) > 0 && (
        <div className="rounded-xl border p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Note (optionnel)" className={`${inputCls} flex-1`} style={bdrStyle} />
          <button onClick={handlePay} disabled={paying} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 cursor-pointer transition shrink-0">
            {paying ? 'Paiement…' : `Marquer ${money(detail.balance)} comme payé`}
          </button>
        </div>
      )}

      {/* Commissions par produit */}
      <h2 className="font-semibold text-gray-200 mb-3">Commissions par produit sélectionné</h2>
      <div className="rounded-xl border overflow-x-auto mb-6" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">PRIX</th>
              <th className="px-4 py-3 font-medium">TYPE</th>
              <th className="px-4 py-3 font-medium">VALEUR</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">Ce dropshipper n'a encore sélectionné aucun produit.</td></tr>
            ) : products.map(item => (
              <CommissionRow key={item.id} dropshipperId={id} item={item} commission={commissionByProduct[item.product]} onSaved={fetchAll} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Historique commissions */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-200">Historique des commissions</h2>
        {detail.entries_count > 0 && <span className="text-xs" style={{ color: theme.dark.muted }}>{detail.entries_count} entrée{detail.entries_count !== 1 ? 's' : ''}</span>}
      </div>
      <div className="rounded-xl border overflow-x-auto mb-2" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-140">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">COMMANDE</th>
              <th className="px-4 py-3 font-medium">PRODUIT</th>
              <th className="px-4 py-3 font-medium">MONTANT</th>
              <th className="px-4 py-3 font-medium">DATE</th>
            </tr>
          </thead>
          <tbody>
            {detail.entries.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Aucune commission calculée pour l'instant.</td></tr>
            ) : detail.entries.map(e => (
              <tr key={e.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-gray-300">
                  <button onClick={() => navigate(`/dashboard/commandes/${e.order_id}`)} className="hover:text-violet-300 transition cursor-pointer">#{e.order_id}</button>
                </td>
                <td className="px-4 py-3 text-gray-400">{e.product_name}</td>
                <td className="px-4 py-3 text-gray-200">{money(e.amount)}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(e.created_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail.entries_count > 10 && (
        <div className="flex items-center justify-end gap-2 mb-6 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setEntriesPage(p => Math.max(1, p - 1))} disabled={entriesPage === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">← Précédent</button>
          <span className={theme.badge.info}>{entriesPage}/{entriesTotalPages}</span>
          <button onClick={() => setEntriesPage(p => Math.min(entriesTotalPages, p + 1))} disabled={entriesPage >= entriesTotalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">Suivant →</button>
        </div>
      )}

      {/* Historique paiements */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-200">Historique des paiements</h2>
        {detail.payments_count > 0 && <span className="text-xs" style={{ color: theme.dark.muted }}>{detail.payments_count} paiement{detail.payments_count !== 1 ? 's' : ''}</span>}
      </div>
      <div className="rounded-xl border overflow-x-auto mb-2" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-140">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">MONTANT</th>
              <th className="px-4 py-3 font-medium">NOTE</th>
              <th className="px-4 py-3 font-medium">DATE</th>
            </tr>
          </thead>
          <tbody>
            {detail.payments.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">Aucun paiement enregistré.</td></tr>
            ) : detail.payments.map(p => (
              <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                <td className="px-4 py-3 text-gray-200">{money(p.amount)}</td>
                <td className="px-4 py-3 text-gray-400">{p.note || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.paid_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail.payments_count > 10 && (
        <div className="flex items-center justify-end gap-2 text-sm" style={{ color: theme.dark.muted }}>
          <button onClick={() => setPaymentsPage(p => Math.max(1, p - 1))} disabled={paymentsPage === 1} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">← Précédent</button>
          <span className={theme.badge.info}>{paymentsPage}/{paymentsTotalPages}</span>
          <button onClick={() => setPaymentsPage(p => Math.min(paymentsTotalPages, p + 1))} disabled={paymentsPage >= paymentsTotalPages} className="px-3 py-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5 transition">Suivant →</button>
        </div>
      )}
    </DashboardLayout>
  )
}
