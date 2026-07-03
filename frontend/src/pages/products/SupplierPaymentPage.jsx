import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function AddModal({ suppliers, onClose, onSaved }) {
  const [form, setForm]     = useState({ supplier: '', amount: '', note: '', date: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition`
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      await api.post('/products/supplier-payments/', {
        supplier: form.supplier,
        amount:   form.amount,
        note:     form.note,
        date:     form.date,
      })
      onSaved()
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">Ajouter un versement fournisseur</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Fournisseur *</label>
            <select value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} required className={inputCls} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
              <option value="">Sélectionner un fournisseur</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
            {errors.supplier && <p className="text-red-400 text-xs mt-1">{errors.supplier}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Montant * <span className="text-gray-600">DZD</span></label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="0" />
              {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} style={bdrStyle} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Note</label>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={3} className={`${inputCls} resize-none`} style={bdrStyle} placeholder="Motif, référence…" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Annuler</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60">
              {saving ? '…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SupplierPaymentPage() {
  const [payments, setPayments]   = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [filterSup, setFilterSup] = useState('')
  const [modal, setModal]         = useState(false)
  const [loading, setLoading]     = useState(true)

  const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  const fetchPayments = useCallback(() => {
    setLoading(true)
    const params = filterSup ? `?supplier=${filterSup}` : ''
    api.get(`/products/supplier-payments/${params}`)
      .then(({ data }) => setPayments(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterSup])

  useEffect(() => {
    api.get('/products/suppliers/').then(({ data }) => setSuppliers(data)).catch(() => {})
  }, [])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce versement ?')) return
    const payment = payments.find(p => p.id === id)
    await api.delete(`/products/suppliers/${payment.supplier}/payments/${id}/`)
    fetchPayments()
  }

  return (
    <DashboardLayout title="Versement Fournisseur">
      {modal && (
        <AddModal
          suppliers={suppliers}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchPayments() }}
        />
      )}

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border px-5 py-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-2xl font-bold text-emerald-400">{totalAmount.toLocaleString('fr-DZ')} DZD</p>
          <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>Total versements ({payments.length})</p>
        </div>
      </div>

      {/* Filtres + actions */}
      <div className="flex items-center justify-between mb-5">
        <select
          value={filterSup}
          onChange={e => setFilterSup(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm text-gray-200 outline-none focus:border-violet-500 transition"
          style={{ background: theme.dark.card, borderColor: theme.dark.border, minWidth: 200 }}
        >
          <option value="">Tous les fournisseurs</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
        </select>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition">
          Ajouter un versement +
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">FOURNISSEUR</th>
              <th className="px-4 py-3 font-medium">MONTANT</th>
              <th className="px-4 py-3 font-medium">NOTE</th>
              <th className="px-4 py-3 font-medium">DATE</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">Chargement…</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">Aucun versement enregistré.</td></tr>
            ) : payments.map(p => (
              <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{p.supplier_name}</td>
                <td className="px-4 py-3 text-emerald-400 font-semibold">{Number(p.amount).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{p.note || '—'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(p.date).toLocaleDateString('fr-DZ')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(p.id)} className="text-xs px-2.5 py-1 rounded text-red-400 hover:bg-red-900/20 transition">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
