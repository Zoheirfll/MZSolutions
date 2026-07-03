import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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

function CommissionRow({ dropshipperId, item, commission, onSaved }) {
  const [type, setType]   = useState(commission?.commission_type || 'percentage')
  const [value, setValue] = useState(commission?.value ?? '')
  const [saving, setSaving] = useState(false)

  const inputCls = 'w-28 px-2.5 py-1.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const save = async () => {
    if (value === '' || Number.isNaN(Number(value))) return
    setSaving(true)
    try {
      await api.post('/dropshipping/commissions/', {
        dropshipper: dropshipperId, product: item.product, commission_type: type, value,
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
      <td className="px-4 py-3 text-gray-200">{item.product_name}</td>
      <td className="px-4 py-3 text-gray-400">{money(item.product_price)}</td>
      <td className="px-4 py-3">
        <div className="w-44">
          <Select value={type} onChange={setType} options={COMMISSION_TYPE_OPTIONS} variant="dark" />
        </div>
      </td>
      <td className="px-4 py-3">
        <input value={value} onChange={e => setValue(e.target.value)} placeholder="0" className={inputCls} style={bdrStyle} />
      </td>
      <td className="px-4 py-3">
        <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition">
          {saving ? '…' : 'Enregistrer'}
        </button>
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

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      api.get(`/dropshipping/dropshippers/${id}/`),
      api.get(`/dropshipping/products/?dropshipper=${id}`),
      api.get(`/dropshipping/commissions/?dropshipper=${id}`),
    ]).then(([d, p, c]) => {
      setDetail(d.data)
      setProducts(p.data)
      setCommissions(c.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [id])

  const handlePay = async () => {
    if (!confirm(`Marquer ${money(detail.balance)} comme payé à ${detail.first_name} ${detail.last_name} ?`)) return
    setPaying(true)
    try {
      await api.post(`/dropshipping/dropshippers/${id}/pay/`, { note: payNote })
      setPayNote('')
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

  return (
    <DashboardLayout title={`${detail.first_name} ${detail.last_name}`}>
      <button onClick={() => navigate('/dashboard/dropshipping')} className="text-xs text-gray-500 hover:text-gray-300 transition mb-5 cursor-pointer">
        ← Retour à la liste des dropshippers
      </button>

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
      <h2 className="font-semibold text-gray-200 mb-3">Historique des commissions</h2>
      <div className="rounded-xl border overflow-x-auto mb-6" style={{ borderColor: theme.dark.border }}>
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
              <tr key={e.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-300">#{e.order_id}</td>
                <td className="px-4 py-3 text-gray-400">{e.product_name}</td>
                <td className="px-4 py-3 text-gray-200">{money(e.amount)}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(e.created_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Historique paiements */}
      <h2 className="font-semibold text-gray-200 mb-3">Historique des paiements</h2>
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
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
              <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200">{money(p.amount)}</td>
                <td className="px-4 py-3 text-gray-400">{p.note || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.paid_at).toLocaleString('fr-DZ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
