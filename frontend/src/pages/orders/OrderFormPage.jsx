import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'
import { WILAYAS } from '../../data/wilayas'
import { useAuth } from '../../context/AuthContext'

const DELIVERY_OPTIONS = [
  { value: 'store',     label: 'Vendu depuis le magasin' },
  { value: 'insurance', label: 'Assurance' },
  { value: 'free',      label: 'Livraison gratuite' },
  { value: 'exchange',  label: 'Échange' },
]

const EMPTY_CLIENT = {
  first_name: '', last_name: '', phone: '',
  wilaya: '', commune: '', address: '',
}

export default function OrderFormPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isDropshipper = user?.team_role === 'dropshipper'
  const [client,       setClient]       = useState(EMPTY_CLIENT)
  const [cartItems,    setCartItems]    = useState([])
  const [shippingCost, setShippingCost] = useState(0)
  const [deliveryType, setDeliveryType] = useState('')
  const [note,         setNote]         = useState('')
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})

  // Recherche produit
  const [search,    setSearch]    = useState('')
  const [products,  setProducts]  = useState([])
  const [searching, setSearching] = useState(false)
  const [allowedProductIds, setAllowedProductIds] = useState(null)
  const searchTimer = useRef(null)

  useEffect(() => {
    if (isDropshipper) {
      api.get('/dropshipping/products/')
        .then(({ data }) => setAllowedProductIds(new Set(data.map(d => d.product))))
        .catch(() => setAllowedProductIds(new Set()))
    }
  }, [isDropshipper])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!search.trim()) { setProducts([]); return }
    if (isDropshipper && !allowedProductIds) { return }
    setSearching(true)
    searchTimer.current = setTimeout(() => {
      api.get(`/products/?search=${encodeURIComponent(search)}&per_page=8`)
        .then(({ data }) => {
          const results = data.results ?? []
          setProducts(isDropshipper ? results.filter(p => allowedProductIds.has(p.id)) : results)
        })
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [search, isDropshipper, allowedProductIds])

  const addProduct = (p, variantOption = null) => {
    const price = variantOption ? Number(variantOption.price || p.price) : Number(p.price)
    const key   = variantOption ? `v${variantOption.id}` : `p${p.id}`
    setCartItems(prev => {
      const exists = prev.find(i => i._key === key)
      if (exists) return prev.map(i => i._key === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, {
        _key:          key,
        product:       p.id,
        variant_option: variantOption?.id || null,
        product_name:  variantOption ? `${p.name} — ${variantOption.value}` : p.name,
        price,
        quantity:      1,
      }]
    })
    setSearch('')
    setProducts([])
  }

  const updateQty = (key, qty) => {
    if (qty < 1) { setCartItems(prev => prev.filter(i => i._key !== key)); return }
    setCartItems(prev => prev.map(i => i._key === key ? { ...i, quantity: qty } : i))
  }

  const removeItem = key => setCartItems(prev => prev.filter(i => i._key !== key))

  const subtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const total    = subtotal + Number(shippingCost || 0)

  const handleSubmit = async () => {
    setSaving(true)
    setErrors({})
    try {
      await api.post('/orders/', {
        ...client,
        shipping_cost: shippingCost,
        delivery_type: deliveryType,
        note,
        items: cartItems.map(({ _key, ...i }) => i),
      })
      navigate('/dashboard/commandes')
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title="Nouvelle commande">
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── Colonne gauche ── */}
        <div className="flex-1 w-full space-y-5 min-w-0">

          {/* Articles */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-gray-200 mb-4">Articles</h2>

            {/* Recherche produit */}
            <div className="relative mb-4">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Recherche de produit"
                className={inputCls}
                style={bdrStyle}
              />
              {(products.length > 0 || searching) && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border overflow-hidden shadow-xl"
                  style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
                  {searching && <p className="px-4 py-3 text-xs text-gray-500">Recherche…</p>}
                  {products.map(p => {
                    const allOptions = (p.variants || []).flatMap(v => v.options || [])
                    return (
                      <div key={p.id} className="border-b last:border-0" style={{ borderColor: theme.dark.border }}>
                        {/* Produit direct si pas d'options de variante */}
                        {allOptions.length === 0 && (
                          <button
                            onClick={() => addProduct(p)}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 transition flex items-center justify-between"
                          >
                            <span>{p.name}</span>
                            <span className="text-violet-300 text-xs">{Number(p.price).toLocaleString('fr-DZ')} DZD</span>
                          </button>
                        )}
                        {/* Options de variante */}
                        {allOptions.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => addProduct(p, opt)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/5 transition flex items-center justify-between"
                          >
                            <span>{p.name} — {opt.value}</span>
                            <span className="text-violet-300 text-xs">{Number(opt.price || p.price).toLocaleString('fr-DZ')} DZD</span>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Articles ajoutés */}
            {cartItems.length === 0 ? (
              <div className={theme.emptyState}>
                <svg className="w-10 h-10 mb-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
                </svg>
                <p>Aucun article ajouté</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-105">
                  <thead>
                    <tr className="text-xs border-b" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                      <th className="pb-2 text-left font-medium">PRODUIT</th>
                      <th className="pb-2 text-right font-medium">PRIX</th>
                      <th className="pb-2 text-center font-medium w-24">QTÉ</th>
                      <th className="pb-2 text-right font-medium">TOTAL</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartItems.map(item => (
                      <tr key={item._key} className="border-b" style={{ borderColor: theme.dark.border + '44' }}>
                        <td className="py-2.5 pr-3 text-gray-200">{item.product_name}</td>
                        <td className="py-2.5 text-right text-gray-300">{Number(item.price).toLocaleString('fr-DZ')}</td>
                        <td className="py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updateQty(item._key, item.quantity - 1)} className="w-6 h-6 rounded border text-gray-400 hover:text-gray-200 text-xs" style={{ borderColor: theme.dark.border }}>−</button>
                            <span className="w-6 text-center text-gray-200">{item.quantity}</span>
                            <button onClick={() => updateQty(item._key, item.quantity + 1)} className="w-6 h-6 rounded border text-gray-400 hover:text-gray-200 text-xs" style={{ borderColor: theme.dark.border }}>+</button>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-gray-200 font-medium">
                          {(item.price * item.quantity).toLocaleString('fr-DZ')}
                        </td>
                        <td className="py-2.5 text-center">
                          <button onClick={() => removeItem(item._key)} className="text-red-400 hover:text-red-300 transition" title="Retirer">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Information Client */}
          <div className="rounded-xl border p-5 space-y-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-gray-200">Information Client</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Prénom *</label>
                <input value={client.first_name} onChange={e => setClient(c => ({ ...c, first_name: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Prénom" />
                {errors.first_name && <p className="text-red-400 text-xs mt-1">{errors.first_name}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Nom</label>
                <input value={client.last_name} onChange={e => setClient(c => ({ ...c, last_name: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="Nom" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Téléphone *</label>
                <input value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Téléphone" />
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Wilaya *</label>
                <Select
                  value={client.wilaya}
                  onChange={v => setClient(c => ({ ...c, wilaya: v }))}
                  options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
                  placeholder="Choisissez une Wilaya"
                  className={inputCls}
                  style={{ ...bdrStyle, background: theme.dark.sidebar }}
                />
                {errors.wilaya && <p className="text-red-400 text-xs mt-1">{errors.wilaya}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Commune</label>
                <input value={client.commune} onChange={e => setClient(c => ({ ...c, commune: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="Commune" />
              </div>
            </div>
          </div>

          {/* Livraison */}
          <div className="rounded-xl border p-5 space-y-3" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-gray-200">Livraison</h2>
            {DELIVERY_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="delivery_type"
                  value={opt.value}
                  checked={deliveryType === opt.value}
                  onChange={() => setDeliveryType(opt.value)}
                  className="accent-violet-600 w-4 h-4"
                />
                <span className="text-sm text-gray-300">{opt.label}</span>
              </label>
            ))}
          </div>

          {/* Remarque */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-gray-200 mb-3">Remarque</h2>
            <label className="block text-xs text-gray-400 mb-1.5">Remarque</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
              className="w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition resize-none"
              style={bdrStyle}
              placeholder="Ajouter une note…"
            />
          </div>
        </div>

        {/* ── Panier (colonne droite fixe) ── */}
        <div className="w-full lg:w-72 shrink-0 lg:sticky lg:top-4">
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-gray-200 mb-4 text-center">Panier</h2>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.dark.muted }}>Total des articles</span>
                <span className="text-gray-200">{subtotal.toLocaleString('fr-DZ')} <span className="text-xs text-gray-500">DZD</span></span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.dark.muted }}>Frais de livraison</span>
                <span className="text-gray-200">{Number(shippingCost || 0).toLocaleString('fr-DZ')} <span className="text-xs text-gray-500">DZD</span></span>
              </div>
              <div className="border-t pt-2 mt-2" style={{ borderColor: theme.dark.border }}>
                <div className="flex justify-between font-semibold">
                  <span className="text-sm text-gray-300">Montant à payer à la livraison</span>
                  <span className="text-white">{total.toLocaleString('fr-DZ')} <span className="text-xs text-gray-400">DZD</span></span>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1.5">Frais de livraison</label>
              <input
                type="number"
                min="0"
                value={shippingCost}
                onChange={e => setShippingCost(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500"
                style={bdrStyle}
              />
            </div>

            {errors.detail && <p className="text-red-400 text-xs mb-3">{errors.detail}</p>}

            <button
              onClick={handleSubmit}
              disabled={saving || cartItems.length === 0 || !client.first_name || !client.phone || !client.wilaya}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>

            <button onClick={() => navigate('/dashboard/commandes')} className="w-full mt-2 py-2 text-xs text-gray-400 hover:text-gray-200 transition flex items-center justify-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Retour
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
