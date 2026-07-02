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
      await api.post('/products/supplier-credits/', {
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
          <h3 className="font-semibold text-gray-200">Ajouter un crédit fournisseur</h3>
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
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: '#7c3aed' }}>
              {saving ? '…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SupplierCreditPage() {
  const [credits, setCredits]     = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [filterSup, setFilterSup] = useState('')
  const [modal, setModal]         = useState(false)
  const [loading, setLoading]     = useState(true)

  const totalAmount = credits.reduce((sum, c) => sum + Number(c.amount), 0)

  const fetchCredits = useCallback(() => {
    setLoading(true)
    const params = filterSup ? `?supplier=${filterSup}` : ''
    api.get(`/products/supplier-credits/${params}`)
      .then(({ data }) => setCredits(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterSup])

  useEffect(() => {
    api.get('/products/suppliers/').then(({ data }) => setSuppliers(data)).catch(() => {})
  }, [])

  useEffect(() => { fetchCredits() }, [fetchCredits])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce crédit ?')) return
    // find supplier id from credit
    const credit = credits.find(c => c.id === id)
    await api.delete(`/products/suppliers/${credit.supplier}/credits/${id}/`)
    fetchCredits()
  }

  return (
    <DashboardLayout title="Crédit Fournisseur">
      {modal && (
        <AddModal
          suppliers={suppliers}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchCredits() }}
        />
      )}

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border px-5 py-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-2xl font-bold text-violet-300">{totalAmount.toLocaleString('fr-DZ')} DZD</p>
          <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>Total crédits ({credits.length})</p>
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
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#7c3aed' }}>
          Ajouter un crédit +
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
            ) : credits.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">Aucun crédit enregistré.</td></tr>
            ) : credits.map(c => (
              <tr key={c.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{c.supplier_name}</td>
                <td className="px-4 py-3 text-red-300 font-semibold">{Number(c.amount).toLocaleString('fr-DZ')} DZD</td>
                <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{c.note || '—'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(c.date).toLocaleDateString('fr-DZ')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(c.id)} className="text-xs px-2.5 py-1 rounded text-red-400 hover:bg-red-900/20 transition">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
