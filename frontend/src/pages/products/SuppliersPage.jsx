import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const EMPTY_FORM = { first_name: '', last_name: '', email: '', phone: '', address: '' }

function SupplierModal({ supplier, onClose, onSaved }) {
  const [form, setForm]     = useState(supplier?.id ? {
    first_name: supplier.first_name,
    last_name:  supplier.last_name,
    email:      supplier.email,
    phone:      supplier.phone,
    address:    supplier.address,
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition`
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      if (supplier?.id) {
        await api.put(`/products/suppliers/${supplier.id}/`, form)
      } else {
        await api.post('/products/suppliers/', form)
      }
      onSaved()
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">{supplier?.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Prénom *</label>
              <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Prénom" />
              {errors.first_name && <p className="text-red-400 text-xs mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Nom *</label>
              <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Nom" />
              {errors.last_name && <p className="text-red-400 text-xs mt-1">{errors.last_name}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="email@example.com" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Téléphone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="+213…" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Adresse</label>
            <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={3} className={`${inputCls} resize-none`} style={bdrStyle} placeholder="Adresse complète…" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Annuler</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: '#7c3aed' }}>
              {saving ? '…' : supplier?.id ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [modal, setModal]         = useState(null)
  const [loading, setLoading]     = useState(true)

  const fetchSuppliers = () => {
    setLoading(true)
    api.get('/products/suppliers/')
      .then(({ data }) => setSuppliers(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchSuppliers() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce fournisseur ?')) return
    await api.delete(`/products/suppliers/${id}/`)
    fetchSuppliers()
  }

  return (
    <DashboardLayout title="Fournisseurs">
      {modal !== null && (
        <SupplierModal
          supplier={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchSuppliers() }}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{suppliers.length} fournisseur{suppliers.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#7c3aed' }}
        >
          Ajouter une nouveau +
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">PRÉNOM</th>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">EMAIL</th>
              <th className="px-4 py-3 font-medium">TÉLÉPHONE</th>
              <th className="px-4 py-3 font-medium">SOLDE</th>
              <th className="px-4 py-3 font-medium">DATE</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">Chargement…</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">Aucun fournisseur.</td></tr>
            ) : suppliers.map(s => (
              <tr key={s.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200">{s.first_name}</td>
                <td className="px-4 py-3 text-gray-200">{s.last_name}</td>
                <td className="px-4 py-3 text-gray-400">{s.email || '—'}</td>
                <td className="px-4 py-3 text-gray-400">{s.phone || '—'}</td>
                <td className="px-4 py-3 font-semibold text-sm">
                  <span className={s.balance >= 0 ? 'text-red-300' : 'text-emerald-400'}>
                    {Number(s.balance || 0).toLocaleString('fr-DZ')} DZD
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(s.created_at).toLocaleDateString('fr-DZ')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(s)} className="text-xs px-2.5 py-1 rounded text-violet-300 hover:bg-violet-600/20 transition">✏️</button>
                    <button onClick={() => handleDelete(s.id)} className="text-xs px-2.5 py-1 rounded text-red-400 hover:bg-red-900/20 transition">🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
