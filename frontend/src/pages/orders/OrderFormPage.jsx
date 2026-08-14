import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import Select from '../../components/Select'
import DeskMapPreview from '../../components/DeskMapPreview'
import api from '../../api/axios'
import { theme } from '../../theme'
import { WILAYAS, getWilayaIdByName } from '../../data/wilayas'
import { getCommunesForWilaya } from '../../data/communes'
import { useAuth } from '../../context/AuthContext'
import { itemLineTotal } from '../../context/CartContext'

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
  const [shippingCostEdited, setShippingCostEdited] = useState(false) // évite d'écraser une valeur modifiée à la main
  const [deliveryTypes, setDeliveryTypes] = useState([]) // plusieurs combinables (ex: Assurance + Échange)
  const [stopDesk, setStopDesk] = useState(false) // false = domicile, true = point relais
  const [stationCode, setStationCode] = useState('')
  const [desks, setDesks] = useState([])
  const [carrierAccounts, setCarrierAccounts] = useState([])
  const [selectedCarrierId, setSelectedCarrierId] = useState('')
  const [rateInfo, setRateInfo] = useState(null) // {tarif, tarif_stopdesk} ou null
  const [rateLoading, setRateLoading] = useState(false)
  const [insuranceFee, setInsuranceFee] = useState(0)
  const [promoCode,    setPromoCode]    = useState('')
  const [promoApplied, setPromoApplied] = useState(null) // {code, discount_amount} ou null
  const [promoError,   setPromoError]   = useState('')
  const [promoChecking, setPromoChecking] = useState(false)
  const [note,         setNote]         = useState('')
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduledAt,     setScheduledAt]     = useState('')

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
    api.get('/stores/me/carriers/').then(({ data }) => {
      const active = data.filter(a => a.is_active)
      setCarrierAccounts(active)
      const def = active.find(a => a.is_default)
      if (def) setSelectedCarrierId(def.id)
    }).catch(() => {})
    api.get('/stores/me/settings/').then(({ data }) => setInsuranceFee(Number(data.insurance_fee || 0))).catch(() => {})
  }, [])

  // Récupère le tarif résolu (grille vendeur Wilaya/Commune en priorité, sinon
  // tarif transporteur en temps réel — même logique que le checkout public)
  // dès que la wilaya est connue. Remplace la valeur si le vendeur n'a pas
  // déjà tapé un montant à la main.
  useEffect(() => {
    if (!client.wilaya || shippingCostEdited) { setRateInfo(null); return }
    setRateLoading(true)
    const params = new URLSearchParams({ wilaya: client.wilaya })
    if (client.commune) params.set('commune', client.commune)
    api.get(`/stores/me/shipping-rate/?${params.toString()}`)
      .then(({ data }) => {
        setRateInfo(data)
        const base = (stopDesk && data.tarif_stopdesk != null) ? data.tarif_stopdesk : data.tarif
        setShippingCost(base)
      })
      .catch(() => setRateInfo(null))
      .finally(() => setRateLoading(false))
  }, [client.wilaya, client.commune, stopDesk, shippingCostEdited])

  // "Vendu depuis le magasin"/"Livraison gratuite" forcent les frais à 0 ;
  // "Assurance" ajoute le supplément configuré — appliqué par-dessus le tarif
  // résolu ci-dessus, sauf si le vendeur a déjà tapé un montant à la main.
  // Un produit du panier avec livraison gratuite/spécifique écrase tout le
  // reste — même cascade de priorité que le checkout public (CheckoutPage.jsx).
  const cartFreeShipping = cartItems.some(i => i.free_shipping)
  const cartSpecificShipping = cartItems.find(i => i.specific_shipping_enabled)
  useEffect(() => {
    if (shippingCostEdited) return
    if (cartFreeShipping) {
      setShippingCost(0)
    } else if (cartSpecificShipping) {
      const specificPrice = stopDesk ? cartSpecificShipping.specific_shipping_desk_price : cartSpecificShipping.specific_shipping_home_price
      if (specificPrice != null) setShippingCost(specificPrice)
    } else if (deliveryTypes.includes('store') || deliveryTypes.includes('free')) {
      setShippingCost(0)
    } else if (deliveryTypes.includes('insurance') && rateInfo) {
      const base = (stopDesk && rateInfo.tarif_stopdesk != null) ? rateInfo.tarif_stopdesk : rateInfo.tarif
      setShippingCost(Number(base || 0) + insuranceFee)
    } else if (rateInfo) {
      const base = (stopDesk && rateInfo.tarif_stopdesk != null) ? rateInfo.tarif_stopdesk : rateInfo.tarif
      setShippingCost(base)
    }
  }, [deliveryTypes, rateInfo, insuranceFee, stopDesk, shippingCostEdited, cartFreeShipping, cartSpecificShipping])

  // Bureaux/points relais réels du transporteur — nécessaire pour choisir un
  // `station_code` valide quand la livraison se fait en point relais.
  useEffect(() => {
    setStationCode('')
    if (!stopDesk || !selectedCarrierId || !client.wilaya) { setDesks([]); return }
    api.get(`/stores/me/carriers/${selectedCarrierId}/desks/?wilaya=${encodeURIComponent(client.wilaya)}`)
      .then(({ data }) => setDesks(data || []))
      .catch(() => setDesks([]))
  }, [stopDesk, selectedCarrierId, client.wilaya])

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

  const addProduct = (p, variantOption = null, subOption = null) => {
    // Prix de base éventuellement réduit par une offre automatique (Promotion
    // kind='auto') — une variante sans prix propre hérite du prix produit,
    // donc doit aussi hériter de sa remise (sinon 4000 au lieu de 3600 affiché).
    const basePrice = p.active_promotion ? Number(p.active_promotion.discounted_price) : Number(p.price)
    // Dropshipper avec un prix minimum de vente configuré : il choisit son propre
    // prix de vente (≥ minimum), sa marge étant prix choisi − prix coûtant (dropshipping_price).
    const minSellingPrice = (!variantOption && isDropshipper && p.minimum_selling_price != null)
      ? Number(p.minimum_selling_price) : null
    const optionPrice = variantOption?.price != null ? Number(variantOption.price) : basePrice
    const price = subOption ? Number(subOption.price != null ? subOption.price : optionPrice)
      : variantOption ? optionPrice
      : (minSellingPrice != null ? minSellingPrice : basePrice)
    // Offre par palier de quantité — même règle que côté serveur : ne
    // s'applique pas si la (sous-)option a son propre prix explicite.
    const offerEligible = !(subOption?.price != null || variantOption?.price != null)
    const key = subOption ? `s${subOption.id}` : variantOption ? `v${variantOption.id}` : `p${p.id}`
    const label = subOption ? `${p.name} — ${variantOption.value} / ${subOption.value}`
      : variantOption ? `${p.name} — ${variantOption.value}` : p.name
    setCartItems(prev => {
      const exists = prev.find(i => i._key === key)
      if (exists) return prev.map(i => i._key === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, {
        _key:          key,
        product:       p.id,
        variant_option: variantOption?.id || null,
        variant_sub_option: subOption?.id || null,
        product_name:  label,
        price,
        minimum_selling_price: minSellingPrice,
        offer_enabled:  offerEligible ? p.offer_enabled : false,
        offer_quantity: offerEligible ? p.offer_quantity : null,
        offer_price:    offerEligible ? p.offer_price : null,
        free_shipping: p.free_shipping,
        specific_shipping_enabled: p.specific_shipping_enabled,
        specific_shipping_home_price: p.specific_shipping_home_price,
        specific_shipping_desk_price: p.specific_shipping_desk_price,
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

  const updatePrice = (key, value) => {
    setCartItems(prev => prev.map(i => i._key === key ? { ...i, price: value } : i))
  }

  const removeItem = key => setCartItems(prev => prev.filter(i => i._key !== key))

  const communeOptions = getCommunesForWilaya(getWilayaIdByName(client.wilaya)).map(name => ({ value: name, label: name }))

  const subtotal = cartItems.reduce((s, i) => s + itemLineTotal(i), 0)
  const discountAmount = promoApplied ? Number(promoApplied.discount_amount) : 0
  const total    = Math.max(subtotal - discountAmount, 0) + Number(shippingCost || 0)

  const applyPromoCode = async () => {
    const code = promoCode.trim()
    if (!code) return
    setPromoChecking(true)
    setPromoError('')
    try {
      const { data } = await api.post('/products/promotions/validate/', {
        code, items: cartItems.map(({ _key, minimum_selling_price, ...i }) => i),
      })
      setPromoApplied(data)
    } catch (err) {
      setPromoApplied(null)
      setPromoError(err.response?.data?.detail || "Code promo invalide.")
    } finally {
      setPromoChecking(false)
    }
  }

  const removePromoCode = () => { setPromoApplied(null); setPromoCode(''); setPromoError('') }

  const handleSubmit = async () => {
    setSaving(true)
    setErrors({})
    const belowMinimum = cartItems.find(i => i.minimum_selling_price != null && Number(i.price) < i.minimum_selling_price)
    if (belowMinimum) {
      setErrors({ detail: `Le prix de vente de « ${belowMinimum.product_name} » doit être d'au moins ${belowMinimum.minimum_selling_price} DA.` })
      setSaving(false)
      return
    }
    try {
      await api.post('/orders/', {
        ...client,
        shipping_cost: shippingCost,
        delivery_types: deliveryTypes,
        stop_desk: stopDesk,
        station_code: stationCode,
        note,
        items: cartItems.map(({ _key, minimum_selling_price, ...i }) => i),
        ...(promoApplied ? { promo_code: promoApplied.code } : {}),
        ...(scheduleEnabled && scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
      })
      navigate(scheduleEnabled && scheduledAt ? '/dashboard/commandes/programmees' : '/dashboard/commandes')
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally {
      setSaving(false)
    }
  }

  const minScheduleValue = new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <DashboardLayout title="Nouvelle commande" subtitle="Utilisez cette page quand un client vous passe commande directement (par téléphone, en magasin, sur les réseaux sociaux...) plutôt que via votre boutique en ligne. Choisissez les produits, la quantité, la wilaya/commune du client, et le transporteur — le tarif de livraison se remplit automatiquement selon la destination. Vous pouvez aussi programmer l'envoi à une date future si le client ne veut pas être livré tout de suite : la commande ne consommera votre quota et votre stock qu'au moment de son activation.">
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── Colonne gauche ── */}
        <div className="flex-1 w-full space-y-5 min-w-0">

          {/* Articles */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-app-primary mb-4">Articles</h2>

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
                  {searching && <p className="px-4 py-3 text-xs text-app-muted">Recherche…</p>}
                  {products.map(p => {
                    const allOptions = (p.variants || []).flatMap(v => v.options || [])
                    const basePrice = p.active_promotion ? Number(p.active_promotion.discounted_price) : Number(p.price)
                    return (
                      <div key={p.id} className="border-b last:border-0" style={{ borderColor: theme.dark.border }}>
                        {/* Produit direct si pas d'options de variante */}
                        {allOptions.length === 0 && (
                          <button
                            onClick={() => addProduct(p)}
                            className="w-full text-left px-4 py-2.5 text-sm text-app-primary hover:bg-violet-500/5 transition flex items-center justify-between"
                          >
                            <span>{p.name}</span>
                            <span className="text-violet-300 text-xs">{basePrice.toLocaleString('fr-DZ')} DZD</span>
                          </button>
                        )}
                        {/* Options de variante — si l'option a des sous-options (2e niveau,
                            ex: pointures sous une couleur), on liste directement chaque
                            sous-option plutôt que l'option elle-même (choix obligatoire). */}
                        {allOptions.map(opt => (
                          opt.sub_options?.length > 0 ? (
                            opt.sub_options.map(sub => (
                              <button
                                key={sub.id}
                                onClick={() => addProduct(p, opt, sub)}
                                className="w-full text-left px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition flex items-center justify-between"
                              >
                                <span>{p.name} — {opt.value} / {sub.value}</span>
                                <span className="text-violet-300 text-xs">{Number(sub.price != null ? sub.price : (opt.price != null ? opt.price : basePrice)).toLocaleString('fr-DZ')} DZD</span>
                              </button>
                            ))
                          ) : (
                            <button
                              key={opt.id}
                              onClick={() => addProduct(p, opt)}
                              className="w-full text-left px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition flex items-center justify-between"
                            >
                              <span>{p.name} — {opt.value}</span>
                              <span className="text-violet-300 text-xs">{Number(opt.price != null ? opt.price : basePrice).toLocaleString('fr-DZ')} DZD</span>
                            </button>
                          )
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
                      <tr key={item._key} className="border-b" style={{ borderColor: theme.dark.borderRowHover }}>
                        <td className="py-2.5 pr-3 text-app-primary">{item.product_name}</td>
                        <td className="py-2.5 text-right text-app-primary">
                          {item.minimum_selling_price != null ? (
                            <div className="flex flex-col items-end">
                              <input
                                type="number" min={item.minimum_selling_price} step="0.01" value={item.price}
                                onChange={e => updatePrice(item._key, e.target.value)}
                                className="w-24 px-2 py-1 rounded border text-right text-sm bg-transparent outline-none focus:border-violet-500"
                                style={bdrStyle}
                              />
                              <span className="text-[10px] mt-0.5" style={{ color: theme.dark.muted }}>min. {item.minimum_selling_price}</span>
                            </div>
                          ) : Number(item.price).toLocaleString('fr-DZ')}
                          {item.offer_enabled && item.offer_quantity && item.quantity >= item.offer_quantity && (
                            <div className="text-[10px] mt-0.5" style={{ color: '#6ee7b7' }}>Offre : {item.offer_quantity} pour {Number(item.offer_price).toLocaleString('fr-DZ')}</div>
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updateQty(item._key, item.quantity - 1)} className="w-6 h-6 rounded border text-app-muted-light hover:text-app-primary text-xs" style={{ borderColor: theme.dark.border }}>−</button>
                            <span className="w-6 text-center text-app-primary">{item.quantity}</span>
                            <button onClick={() => updateQty(item._key, item.quantity + 1)} className="w-6 h-6 rounded border text-app-muted-light hover:text-app-primary text-xs" style={{ borderColor: theme.dark.border }}>+</button>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-app-primary font-medium">
                          {itemLineTotal(item).toLocaleString('fr-DZ')}
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
            <h2 className="font-semibold text-app-primary">Information Client</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-app-muted-light mb-1.5">Prénom *</label>
                <input value={client.first_name} onChange={e => setClient(c => ({ ...c, first_name: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Prénom" />
                {errors.first_name && <p className="text-red-400 text-xs mt-1">{errors.first_name}</p>}
              </div>
              <div>
                <label className="block text-xs text-app-muted-light mb-1.5">Nom</label>
                <input value={client.last_name} onChange={e => setClient(c => ({ ...c, last_name: e.target.value }))} className={inputCls} style={bdrStyle} placeholder="Nom" />
              </div>
              <div>
                <label className="block text-xs text-app-muted-light mb-1.5">Téléphone *</label>
                <input value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} required className={inputCls} style={bdrStyle} placeholder="Téléphone" />
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-app-muted-light mb-1.5">Wilaya *</label>
                <Select
                  value={client.wilaya}
                  onChange={v => setClient(c => ({ ...c, wilaya: v, commune: '' }))}
                  options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
                  placeholder="Choisissez une Wilaya"
                  className={inputCls}
                  style={{ ...bdrStyle, background: theme.dark.sidebar }}
                />
                {errors.wilaya && <p className="text-red-400 text-xs mt-1">{errors.wilaya}</p>}
              </div>
              <div>
                <label className="block text-xs text-app-muted-light mb-1.5">Commune</label>
                <Select
                  value={client.commune}
                  onChange={v => setClient(c => ({ ...c, commune: v }))}
                  options={communeOptions}
                  placeholder={client.wilaya ? 'Choisissez une commune' : "Choisissez d'abord une wilaya"}
                  disabled={!client.wilaya}
                  className={inputCls}
                  style={{ ...bdrStyle, background: theme.dark.sidebar }}
                />
              </div>
            </div>
          </div>

          {/* Livraison */}
          <div className="rounded-xl border p-5 space-y-3" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-app-primary">Livraison</h2>
            <p className="text-xs" style={{ color: theme.dark.muted }}>Plusieurs types combinables (ex: Assurance + Échange).</p>
            {DELIVERY_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deliveryTypes.includes(opt.value)}
                  onChange={() => {
                    setShippingCostEdited(false)
                    setDeliveryTypes(prev => prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value])
                  }}
                  className="accent-violet-600 w-4 h-4"
                />
                <span className="text-sm text-app-primary">{opt.label}</span>
              </label>
            ))}
            {deliveryTypes.includes('store') && (
              <p className="text-xs text-emerald-400">Frais de livraison à 0 — aucune expédition transporteur ne sera créée à la confirmation.</p>
            )}
            {deliveryTypes.includes('free') && !deliveryTypes.includes('store') && (
              <p className="text-xs text-emerald-400">Frais de livraison à 0 pour le client — l'expédition transporteur reste créée normalement.</p>
            )}
            {deliveryTypes.includes('insurance') && !deliveryTypes.includes('store') && (
              <p className="text-xs text-emerald-400">+{insuranceFee.toLocaleString('fr-DZ')} DZD d'assurance ajoutés aux frais de livraison.</p>
            )}
          </div>

          {/* Remarque */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-app-primary mb-3">Remarque</h2>
            <label className="block text-xs text-app-muted-light mb-1.5">Remarque</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
              className="w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition resize-none"
              style={bdrStyle}
              placeholder="Ajouter une note…"
            />
          </div>

          {/* Programmation */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <label className="flex items-center gap-3 cursor-pointer select-none mb-3">
              <button
                type="button"
                role="switch"
                aria-checked={scheduleEnabled}
                onClick={() => setScheduleEnabled(v => !v)}
                className="w-10 h-6 rounded-full relative transition-colors shrink-0"
                style={{ background: scheduleEnabled ? '#7c3aed' : theme.dark.border }}
              >
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: scheduleEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
              </button>
              <span className="font-semibold text-app-primary">Programmer l'envoi</span>
            </label>
            {scheduleEnabled && (
              <>
                <label className="block text-xs text-app-muted-light mb-1.5">Date et heure d'envoi</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={minScheduleValue}
                  onChange={e => setScheduledAt(e.target.value)}
                  className={inputCls}
                  style={bdrStyle}
                />
                <p className="text-xs mt-1.5" style={{ color: theme.dark.muted }}>
                  La commande sera créée avec le statut "Programmée" et activée automatiquement à cette date (stock, quota et assignation appliqués à ce moment-là).
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Panier (colonne droite fixe) ── */}
        <div className="w-full lg:w-72 shrink-0 lg:sticky lg:top-4">
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h2 className="font-semibold text-app-primary mb-4 text-center">Panier</h2>

            <div className="mb-4">
              <label className="block text-xs text-app-muted-light mb-1.5">Code promo</label>
              {promoApplied ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm" style={bdrStyle}>
                  <span className="text-emerald-400 font-medium">{promoApplied.code}</span>
                  <button type="button" onClick={removePromoCode} className="text-app-muted-light hover:text-app-primary transition text-xs cursor-pointer">Retirer</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyPromoCode() } }}
                    placeholder="Code"
                    className={`${inputCls} flex-1`}
                    style={bdrStyle}
                  />
                  <button
                    type="button"
                    onClick={applyPromoCode}
                    disabled={promoChecking || !promoCode.trim() || cartItems.length === 0}
                    className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition cursor-pointer disabled:opacity-60"
                  >
                    {promoChecking ? '…' : 'Appliquer'}
                  </button>
                </div>
              )}
              {promoError && <p className="text-red-400 text-xs mt-1">{promoError}</p>}
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.dark.muted }}>Total des articles</span>
                <span className="text-app-primary">{subtotal.toLocaleString('fr-DZ')} <span className="text-xs text-app-muted">DZD</span></span>
              </div>
              {promoApplied && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: theme.dark.muted }}>Réduction ({promoApplied.code})</span>
                  <span className="text-emerald-400">-{discountAmount.toLocaleString('fr-DZ')} <span className="text-xs">DZD</span></span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.dark.muted }}>Frais de livraison</span>
                <span className="text-app-primary">{Number(shippingCost || 0).toLocaleString('fr-DZ')} <span className="text-xs text-app-muted">DZD</span></span>
              </div>
              <div className="border-t pt-2 mt-2" style={{ borderColor: theme.dark.border }}>
                <div className="flex justify-between font-semibold">
                  <span className="text-sm text-app-primary">Montant à payer à la livraison</span>
                  <span className="text-white">{total.toLocaleString('fr-DZ')} <span className="text-xs text-app-muted-light">DZD</span></span>
                </div>
              </div>
            </div>

            {carrierAccounts.length > 0 && !deliveryTypes.includes('store') && (
              <div className="mb-4">
                <label className="block text-xs text-app-muted-light mb-1.5">Société de livraison</label>
                <Select
                  value={selectedCarrierId}
                  onChange={v => { setSelectedCarrierId(v); setShippingCostEdited(false) }}
                  options={carrierAccounts.map(a => ({ value: a.id, label: a.carrier_label }))}
                  placeholder="Aucun (frais manuels)"
                  className={inputCls}
                  style={{ ...bdrStyle, background: theme.dark.sidebar }}
                />
              </div>
            )}

            {!deliveryTypes.includes('store') && (
              <div className="mb-4">
                <label className="block text-xs text-app-muted-light mb-1.5">Mode de livraison</label>
                <div className="flex rounded-lg border overflow-hidden" style={bdrStyle}>
                  <button
                    type="button"
                    onClick={() => { setStopDesk(false); setShippingCostEdited(false) }}
                    className={`flex-1 py-2 text-sm cursor-pointer transition ${!stopDesk ? 'bg-violet-600 text-white' : 'text-app-muted-light hover:text-app-primary'}`}
                  >
                    Domicile
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStopDesk(true); setShippingCostEdited(false) }}
                    className={`flex-1 py-2 text-sm cursor-pointer transition ${stopDesk ? 'bg-violet-600 text-white' : 'text-app-muted-light hover:text-app-primary'}`}
                  >
                    Point relais
                  </button>
                </div>
                {stopDesk && desks.length > 0 && (
                  <div className="mt-2">
                    <Select
                      value={stationCode}
                      onChange={setStationCode}
                      options={desks.map(d => ({ value: d.code, label: `${d.name} — ${d.address}` }))}
                      placeholder="Choisissez un point relais"
                      className={inputCls}
                      style={{ ...bdrStyle, background: theme.dark.sidebar }}
                    />
                    {stationCode && (() => {
                      const desk = desks.find(d => String(d.code) === String(stationCode))
                      return desk ? <DeskMapPreview name={desk.name} address={desk.address} wilaya={client.wilaya} /> : null
                    })()}
                  </div>
                )}
                {stopDesk && selectedCarrierId && desks.length === 0 && (
                  <p className="text-xs mt-1.5" style={{ color: theme.dark.muted }}>Aucun point relais disponible pour cette wilaya/transporteur.</p>
                )}
              </div>
            )}

            <div className="mb-1">
              <label className="block text-xs text-app-muted-light mb-1.5">Frais de livraison</label>
              <input
                type="number"
                min="0"
                value={shippingCost}
                onChange={e => { setShippingCost(e.target.value); setShippingCostEdited(true) }}
                className="w-full px-3 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500"
                style={bdrStyle}
              />
            </div>
            <div className="mb-4 min-h-4">
              {cartFreeShipping && (
                <p className="text-xs mt-1 text-emerald-400">Livraison gratuite (article du panier marqué "Livraison gratuite").</p>
              )}
              {!cartFreeShipping && cartSpecificShipping && (
                <p className="text-xs mt-1 text-violet-400">
                  Tarif spécifique ({cartSpecificShipping.product_name}) : {Number(stopDesk ? cartSpecificShipping.specific_shipping_desk_price : cartSpecificShipping.specific_shipping_home_price).toLocaleString('fr-DZ')} DZD
                </p>
              )}
              {!cartFreeShipping && !cartSpecificShipping && rateLoading && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>Récupération du tarif…</p>}
              {!cartFreeShipping && !cartSpecificShipping && !rateLoading && rateInfo && !shippingCostEdited && !deliveryTypes.includes('store') && (
                <p className="text-xs mt-1 text-emerald-400">
                  Tarif {stopDesk ? 'point relais' : 'domicile'} : {(stopDesk && rateInfo.tarif_stopdesk != null ? rateInfo.tarif_stopdesk : rateInfo.tarif).toLocaleString('fr-DZ')} DZD
                  {deliveryTypes.includes('insurance') && ` (+ ${insuranceFee.toLocaleString('fr-DZ')} DZD assurance)`}
                </p>
              )}
              {shippingCostEdited && (
                <button onClick={() => setShippingCostEdited(false)} className="text-xs text-violet-400 hover:text-violet-300 transition cursor-pointer mt-1">
                  Revenir au tarif automatique
                </button>
              )}
            </div>

            {errors.detail && <p className="text-red-400 text-xs mb-3">{errors.detail}</p>}

            <button
              onClick={handleSubmit}
              disabled={saving || cartItems.length === 0 || !client.first_name || !client.phone || !client.wilaya || (scheduleEnabled && !scheduledAt)}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>

            <button onClick={() => navigate('/dashboard/commandes')} className="w-full mt-2 py-2 text-xs text-app-muted-light hover:text-app-primary transition flex items-center justify-center gap-1.5">
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
