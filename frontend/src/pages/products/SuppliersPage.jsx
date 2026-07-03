import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const EMPTY_FORM = { first_name: '', last_name: '', email: '', phone: '', address: '' }

function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
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

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TruckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 3v5h-7V8Z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  )
}

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function Spinner({ label = 'Chargement…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">{label}</span>
    </div>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-gray-500">
      {icon && <div className="mb-3 text-gray-600">{icon}</div>}
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{subtitle}</p>}
    </div>
  )
}

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

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
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
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Annuler</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition">
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

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{suppliers.length} fournisseur{suppliers.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setModal({})}
          className={theme.btn.primary + ' text-sm shrink-0'}
        >
          <PlusIcon /> Ajouter un fournisseur
        </button>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
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
              <tr><td colSpan={7}><Spinner /></td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState icon={<TruckIcon />} title="Aucun fournisseur" subtitle="Ajoutez votre premier fournisseur pour commencer." />
              </td></tr>
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
                    <button onClick={() => setModal(s)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition cursor-pointer" title="Modifier"><EditIcon /></button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Supprimer"><TrashIcon /></button>
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
