import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import CheckboxList from '../../components/CheckboxList'
import api from '../../api/axios'
import { theme } from '../../theme'

const EMPTY_FORM = {
  name: '', discount_type: 'percentage', discount_value: '',
  starts_at: '', ends_at: '', products: [], categories: [], is_active: true,
}

const DISCOUNT_TYPE_OPTIONS = [
  { value: 'percentage', label: 'Pourcentage (%)' },
  { value: 'fixed',      label: 'Montant fixe (DZD)' },
]

function SparkleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="m12 3-1.9 4.6L5.5 9.5l4.6 1.9L12 16l1.9-4.6 4.6-1.9-4.6-1.9L12 3Z" />
      <path d="M5 3v4M3 5h4M19 17v4M17 19h4" />
    </svg>
  )
}

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

function toDatetimeLocal(value) {
  if (!value) return ''
  return value.slice(0, 16)
}

function AutoPromoModal({ promo, products, categories, onClose, onSaved }) {
  const [form, setForm] = useState(promo?.id ? {
    name: promo.name,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    starts_at: toDatetimeLocal(promo.starts_at),
    ends_at: toDatetimeLocal(promo.ends_at),
    products: promo.products || [],
    categories: promo.categories || [],
    is_active: promo.is_active,
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const toggleProduct = (id) => setForm(f => ({
    ...f, products: f.products.includes(id) ? f.products.filter(x => x !== id) : [...f.products, id],
  }))
  const toggleCategory = (id) => setForm(f => ({
    ...f, categories: f.categories.includes(id) ? f.categories.filter(x => x !== id) : [...f.categories, id],
  }))

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    const payload = {
      ...form,
      kind: 'auto',
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    }
    try {
      if (promo?.id) {
        await api.put(`/products/promotions/${promo.id}/`, payload)
      } else {
        await api.post('/products/promotions/', payload)
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
      <div className="w-full max-w-lg rounded-xl border p-6 max-h-[90vh] overflow-y-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">{promo?.id ? "Modifier l'offre" : 'Nouvelle offre automatique'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nom *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Déstockage rentrée" />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Type de réduction</label>
              <Select value={form.discount_type} onChange={v => setForm(f => ({ ...f, discount_type: v }))} options={DISCOUNT_TYPE_OPTIONS} className={inputCls} style={bdrStyle} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Valeur *</label>
              <input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder={form.discount_type === 'percentage' ? '15' : '1000'} />
              {errors.discount_value && <p className="text-red-400 text-xs mt-1">{errors.discount_value}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Début (optionnel)</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} className={inputCls} style={bdrStyle} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Fin (optionnel)</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} className={inputCls} style={bdrStyle} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Produits ciblés</label>
            <CheckboxList items={products} selected={form.products} onToggle={toggleProduct} emptyLabel="Aucun produit disponible." />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Catégories ciblées</label>
            <CheckboxList items={categories} selected={form.categories} onToggle={toggleCategory} emptyLabel="Aucune catégorie disponible." />
          </div>
          {errors.non_field_errors && <p className="text-red-400 text-xs">{errors.non_field_errors[0]}</p>}
          <label className="flex items-center justify-between text-sm text-gray-300">
            Actif
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-violet-600 cursor-pointer" />
          </label>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Annuler</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition">
              {saving ? '…' : promo?.id ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AutoPromotionsPage() {
  const [promos, setPromos]       = useState([])
  const [products, setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [modal, setModal]         = useState(null)
  const [loading, setLoading]     = useState(true)

  const fetchPromos = () => {
    setLoading(true)
    api.get('/products/promotions/?kind=auto')
      .then(({ data }) => setPromos(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPromos()
    api.get('/products/?per_page=200').then(({ data }) => setProducts(data.results || [])).catch(() => {})
    api.get('/products/categories/?per_page=200').then(({ data }) => setCategories(data.results || [])).catch(() => {})
  }, [])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette offre ?')) return
    await api.delete(`/products/promotions/${id}/`)
    fetchPromos()
  }

  return (
    <DashboardLayout title="Réductions automatiques">
      {modal !== null && (
        <AutoPromoModal
          promo={modal?.id ? modal : null}
          products={products}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchPromos() }}
        />
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{promos.length} offre{promos.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModal({})} className={theme.btn.primary + ' text-sm shrink-0'}>
          <PlusIcon /> Ajouter une offre
        </button>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">RÉDUCTION</th>
              <th className="px-4 py-3 font-medium">CIBLE</th>
              <th className="px-4 py-3 font-medium">VALIDITÉ</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><Spinner /></td></tr>
            ) : promos.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState icon={<SparkleIcon />} title="Aucune offre automatique" subtitle="Créez une réduction visible directement sur vos fiches produit." />
              </td></tr>
            ) : promos.map(p => (
              <tr key={p.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-300">
                  {p.discount_type === 'percentage' ? `${Number(p.discount_value)}%` : `${Number(p.discount_value).toLocaleString('fr-DZ')} DZD`}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-56">
                    {p.product_names.map(n => <span key={n} className={theme.badge.info}>{n}</span>)}
                    {p.category_names.map(n => <span key={n} className={theme.badge.cyan}>{n}</span>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {p.starts_at ? new Date(p.starts_at).toLocaleDateString('fr-DZ') : '—'} → {p.ends_at ? new Date(p.ends_at).toLocaleDateString('fr-DZ') : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={p.is_active ? theme.badge.success : theme.badge.neutral}>{p.is_active ? 'Actif' : 'Inactif'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(p)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition cursor-pointer" title="Modifier"><EditIcon /></button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Supprimer"><TrashIcon /></button>
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
