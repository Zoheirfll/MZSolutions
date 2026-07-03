import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import CheckboxList from '../../components/CheckboxList'
import api from '../../api/axios'
import { theme } from '../../theme'

const EMPTY_FORM = {
  name: '', code: '', discount_type: 'percentage', discount_value: '',
  starts_at: '', ends_at: '', max_uses: '', products: [], categories: [], is_active: true,
}

const DISCOUNT_TYPE_OPTIONS = [
  { value: 'percentage', label: 'Pourcentage (%)' },
  { value: 'fixed',      label: 'Montant fixe (DZD)' },
]

function TagIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
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

function CouponModal({ coupon, products, categories, onClose, onSaved }) {
  const [form, setForm] = useState(coupon?.id ? {
    name: coupon.name,
    code: coupon.code,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    starts_at: toDatetimeLocal(coupon.starts_at),
    ends_at: toDatetimeLocal(coupon.ends_at),
    max_uses: coupon.max_uses ?? '',
    products: coupon.products || [],
    categories: coupon.categories || [],
    is_active: coupon.is_active,
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
      kind: 'code',
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      max_uses: form.max_uses === '' ? null : Number(form.max_uses),
    }
    try {
      if (coupon?.id) {
        await api.put(`/products/promotions/${coupon.id}/`, payload)
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
          <h3 className="font-semibold text-gray-200">{coupon?.id ? 'Modifier le coupon' : 'Nouveau coupon'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nom *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Soldes d'été" />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Code *</label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} required className={`${inputCls} font-mono uppercase`} style={bdrStyle} placeholder="ETE2026" />
            {errors.code && <p className="text-red-400 text-xs mt-1">{errors.code}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Type de réduction</label>
              <Select value={form.discount_type} onChange={v => setForm(f => ({ ...f, discount_type: v }))} options={DISCOUNT_TYPE_OPTIONS} className={inputCls} style={bdrStyle} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Valeur *</label>
              <input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder={form.discount_type === 'percentage' ? '10' : '500'} />
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
            <label className="block text-xs text-gray-400 mb-1.5">Nombre d'utilisations maximum (optionnel)</label>
            <input type="number" min="1" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="Illimité" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Limiter à des produits (optionnel — sinon s'applique à tout le panier)</label>
            <CheckboxList items={products} selected={form.products} onToggle={toggleProduct} emptyLabel="Aucun produit disponible." />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Limiter à des catégories (optionnel)</label>
            <CheckboxList items={categories} selected={form.categories} onToggle={toggleCategory} emptyLabel="Aucune catégorie disponible." />
          </div>
          <label className="flex items-center justify-between text-sm text-gray-300">
            Actif
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-violet-600 cursor-pointer" />
          </label>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer transition">Annuler</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition">
              {saving ? '…' : coupon?.id ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CouponsPage() {
  const [coupons, setCoupons]     = useState([])
  const [products, setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [modal, setModal]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [copiedId, setCopiedId]   = useState(null)

  const fetchCoupons = () => {
    setLoading(true)
    api.get('/products/promotions/?kind=code')
      .then(({ data }) => setCoupons(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCoupons()
    api.get('/products/?per_page=200').then(({ data }) => setProducts(data.results || [])).catch(() => {})
    api.get('/products/categories/?per_page=200').then(({ data }) => setCategories(data.results || [])).catch(() => {})
  }, [])

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce coupon ?')) return
    await api.delete(`/products/promotions/${id}/`)
    fetchCoupons()
  }

  const copyCode = (c) => {
    navigator.clipboard.writeText(c.code).then(() => {
      setCopiedId(c.id)
      setTimeout(() => setCopiedId(null), 1500)
    }).catch(() => {})
  }

  return (
    <DashboardLayout title="Coupons">
      {modal !== null && (
        <CouponModal
          coupon={modal?.id ? modal : null}
          products={products}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchCoupons() }}
        />
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <p className="text-sm" style={{ color: theme.dark.muted }}>{coupons.length} coupon{coupons.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setModal({})} className={theme.btn.primary + ' text-sm shrink-0'}>
          <PlusIcon /> Ajouter un coupon
        </button>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
        <table className="w-full text-sm min-w-180">
          <thead style={{ background: theme.dark.sidebar }}>
            <tr className="text-left text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
              <th className="px-4 py-3 font-medium">NOM</th>
              <th className="px-4 py-3 font-medium">CODE</th>
              <th className="px-4 py-3 font-medium">RÉDUCTION</th>
              <th className="px-4 py-3 font-medium">CIBLE</th>
              <th className="px-4 py-3 font-medium">VALIDITÉ</th>
              <th className="px-4 py-3 font-medium">UTILISATIONS</th>
              <th className="px-4 py-3 font-medium">STATUT</th>
              <th className="px-4 py-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><Spinner /></td></tr>
            ) : coupons.length === 0 ? (
              <tr><td colSpan={8}>
                <EmptyState icon={<TagIcon />} title="Aucun coupon" subtitle="Créez votre premier code promo pour commencer." />
              </td></tr>
            ) : coupons.map(c => (
              <tr key={c.id} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.border + '44' }}>
                <td className="px-4 py-3 text-gray-200 font-medium">{c.name}</td>
                <td className="px-4 py-3">
                  <button onClick={() => copyCode(c)} className="font-mono text-xs px-2.5 py-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition cursor-pointer">
                    {copiedId === c.id ? 'Copié !' : c.code}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {c.discount_type === 'percentage' ? `${Number(c.discount_value)}%` : `${Number(c.discount_value).toLocaleString('fr-DZ')} DZD`}
                </td>
                <td className="px-4 py-3">
                  {c.product_names.length === 0 && c.category_names.length === 0 ? (
                    <span className="text-gray-600 text-xs">Tout le panier</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-w-56">
                      {c.product_names.map(n => <span key={n} className={theme.badge.info}>{n}</span>)}
                      {c.category_names.map(n => <span key={n} className={theme.badge.cyan}>{n}</span>)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {c.starts_at ? new Date(c.starts_at).toLocaleDateString('fr-DZ') : '—'} → {c.ends_at ? new Date(c.ends_at).toLocaleDateString('fr-DZ') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-400">{c.uses_count} / {c.max_uses ?? '∞'}</td>
                <td className="px-4 py-3">
                  <span className={c.is_active ? theme.badge.success : theme.badge.neutral}>{c.is_active ? 'Actif' : 'Inactif'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(c)} className="p-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition cursor-pointer" title="Modifier"><EditIcon /></button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition cursor-pointer" title="Supprimer"><TrashIcon /></button>
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
