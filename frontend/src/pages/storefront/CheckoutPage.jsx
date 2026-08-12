import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import Select from '../../components/Select'
import publicApi from '../../api/publicApi'
import { useCart } from '../../context/CartContext'
import { trackEvent } from '../../lib/pixels'
import { WILAYAS, getWilayaIdByName } from '../../data/wilayas'
import { getCommunesForWilaya } from '../../data/communes'

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  )
}

function PackageIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}

function CartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

function MinusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" />
    </svg>
  )
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  )
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  )
}

const EMPTY_CLIENT = {
  first_name: '', last_name: '', phone: '', email: '',
  wilaya: '', commune: '', address: '',
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-colors'
const inputStyle = { background: 'var(--sf-body-bg)', border: '1px solid var(--sf-header-border)', color: 'var(--sf-text)' }
const panelCls = 'rounded-2xl p-5'
const panelStyle = { background: 'var(--sf-card-bg)', border: '1px solid var(--sf-header-border)' }

function radioLabelStyle(active) {
  return active
    ? { border: '1px solid var(--sf-primary)', background: 'var(--sf-primary-light)' }
    : { border: '1px solid var(--sf-header-border)' }
}

export default function CheckoutPage() {
  const { slug } = useParams()
  const { getItems, updateQuantity, removeItem, clearCart, getSubtotal } = useCart()
  const cartItems = getItems(slug)
  const subtotal   = getSubtotal(slug)

  const [client,        setClient]        = useState(EMPTY_CLIENT)
  const [note,          setNote]          = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [confirmedId,   setConfirmedId]   = useState(null)
  const [promoCode,     setPromoCode]     = useState('')
  const [appliedPromo,  setAppliedPromo]  = useState(null)
  const [promoError,    setPromoError]    = useState('')
  const [checkingPromo, setCheckingPromo] = useState(false)
  const [shippingRate,   setShippingRate]   = useState(null) // {tarif, tarif_stopdesk} ou null
  const [shippingOption, setShippingOption] = useState('domicile') // 'domicile' | 'stopdesk'
  const [shippingLoading, setShippingLoading] = useState(false)
  const [desks,          setDesks]          = useState([])
  const [desksLoading,   setDesksLoading]   = useState(false)
  const [stationCode,    setStationCode]    = useState('')
  const abandonedTimerRef = useRef(null)

  const discountAmount = appliedPromo ? Number(appliedPromo.discount_amount) : 0
  const shippingCost = shippingRate
    ? (shippingOption === 'stopdesk' && shippingRate.tarif_stopdesk != null ? shippingRate.tarif_stopdesk : shippingRate.tarif)
    : 0
  const total = subtotal - discountAmount + shippingCost

  // Tarif réel du transporteur par défaut de la boutique, dès que la wilaya est choisie
  useEffect(() => {
    if (!client.wilaya) { setShippingRate(null); return }
    setShippingLoading(true)
    publicApi.get(`/store/${slug}/shipping-rate/?wilaya=${encodeURIComponent(client.wilaya)}`)
      .then(({ data }) => setShippingRate(data))
      .catch(() => setShippingRate(null))
      .finally(() => setShippingLoading(false))
  }, [client.wilaya, slug])

  // Liste des bureaux réels dès que le client choisit "point relais"
  useEffect(() => {
    setStationCode('')
    if (!client.wilaya || shippingOption !== 'stopdesk') { setDesks([]); return }
    setDesksLoading(true)
    publicApi.get(`/store/${slug}/desks/?wilaya=${encodeURIComponent(client.wilaya)}`)
      .then(({ data }) => setDesks(data))
      .catch(() => setDesks([]))
      .finally(() => setDesksLoading(false))
  }, [client.wilaya, shippingOption, slug])

  // InitiateCheckout (US-8.3.2) — une fois par arrivée sur le tunnel avec un panier non vide
  useEffect(() => {
    if (cartItems.length > 0) {
      trackEvent('InitiateCheckout', {
        value: subtotal, currency: 'DZD', num_items: cartItems.length,
        content_ids: cartItems.map(i => i.product),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPromo = async () => {
    if (!promoCode.trim()) return
    setCheckingPromo(true)
    setPromoError('')
    try {
      const { data } = await publicApi.post(`/store/${slug}/promo/${encodeURIComponent(promoCode.trim())}/`, {
        items: cartItems.map(({ _key, image_url, ...i }) => i),
      })
      setAppliedPromo(data)
    } catch (err) {
      setAppliedPromo(null)
      setPromoError(err.response?.data?.detail || 'Code promo invalide.')
    } finally {
      setCheckingPromo(false)
    }
  }

  const removePromo = () => {
    setAppliedPromo(null)
    setPromoCode('')
    setPromoError('')
  }

  // Debounce : sauvegarde le panier abandonné 2s après que le téléphone est rempli
  useEffect(() => {
    if (client.phone.length < 8 || cartItems.length === 0) return
    clearTimeout(abandonedTimerRef.current)
    abandonedTimerRef.current = setTimeout(() => {
      publicApi.post('/abandoned-carts/', {
        store_slug: slug,
        first_name: client.first_name,
        last_name:  client.last_name,
        phone:      client.phone,
        email:      client.email,
        wilaya:     client.wilaya,
        items:      cartItems.map(({ _key, image_url, ...i }) => i),
        total:      subtotal,
      }).catch(() => {})
    }, 2000)
    return () => clearTimeout(abandonedTimerRef.current)
  }, [client.phone, client.email, client.first_name, client.wilaya, cartItems.length])

  const handleSubmit = async e => {
    e.preventDefault()
    if (shippingOption === 'stopdesk' && desks.length > 0 && !stationCode) {
      setError('Choisissez un bureau de retrait.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data } = await publicApi.post('/orders/', {
        store_slug: slug,
        ...client,
        note,
        payment_method: paymentMethod,
        items: cartItems.map(({ _key, image_url, ...i }) => i),
        promo_code: appliedPromo?.code || undefined,
        shipping_cost: shippingCost,
        stop_desk: shippingOption === 'stopdesk',
        station_code: shippingOption === 'stopdesk' ? stationCode : '',
      })
      trackEvent('Purchase', {
        value: total, currency: 'DZD', order_id: data.id,
        content_ids: cartItems.map(i => i.product), num_items: cartItems.length,
      })
      if (data.payment_url) {
        clearCart(slug)
        window.location.href = data.payment_url
        return
      }
      clearCart(slug)
      // Marquer le panier comme récupéré
      publicApi.post('/abandoned-carts/recover/', { store_slug: slug, phone: client.phone }).catch(() => {})
      setConfirmedId(data.id)
    } catch (err) {
      setError(err.response?.data?.detail || "Une erreur est survenue lors de la commande.")
    } finally {
      setSaving(false)
    }
  }

  if (confirmedId) {
    return (
      <StorefrontLayout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <div className="inline-flex w-16 h-16 rounded-full items-center justify-center mb-4 ring-1 ring-inset ring-emerald-400/40" style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>
            <CheckIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sf-text)' }}>Merci pour votre commande !</h1>
          <p className="mb-6" style={{ color: 'var(--sf-text-muted)' }}>Commande #{confirmedId} reçue. Nous vous contacterons bientôt.</p>
          <Link to={`/store/${slug}/products`} className="inline-flex px-6 py-3 rounded-xl text-sm font-semibold text-white transition" style={{ background: 'var(--sf-primary)' }}>
            Continuer mes achats
          </Link>
          <p className="text-xs mt-6" style={{ color: 'var(--sf-text-muted)' }}>
            Un problème avec votre commande ? <Link to={`/store/${slug}/reclamation?order=${confirmedId}`} className="hover:underline" style={{ color: 'var(--sf-primary)' }}>Déposer une réclamation</Link>
          </p>
        </div>
      </StorefrontLayout>
    )
  }

  if (cartItems.length === 0) {
    return (
      <StorefrontLayout>
        <div className="flex flex-col items-center justify-center text-center py-20 px-6" style={{ color: 'var(--sf-text-muted)' }}>
          <CartIcon className="w-12 h-12 mb-3 opacity-30" />
          <p className="mb-4">Votre panier est vide.</p>
          <Link to={`/store/${slug}/products`} className="px-5 py-2.5 rounded-lg text-sm font-medium transition" style={{ border: '1px solid var(--sf-header-border)', color: 'var(--sf-text)' }}>
            Voir les produits
          </Link>
        </div>
      </StorefrontLayout>
    )
  }

  const sectionTitle = (num, label) => (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style={{ background: 'var(--sf-primary)' }}>{num}</span>
      <h2 className="font-semibold" style={{ color: 'var(--sf-text)' }}>{label}</h2>
    </div>
  )

  return (
    <StorefrontLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold mb-8" style={{ color: 'var(--sf-text)' }}>Finaliser la commande</h1>

        <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <div className="flex-1 min-w-0 w-full space-y-6">
            {/* Étape 1 — Articles */}
            <div className={panelCls} style={panelStyle}>
              {sectionTitle(1, 'Panier')}
              <div className="space-y-3">
                {cartItems.map(item => (
                  <div key={item._key} className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 flex items-center justify-center opacity-60"
                      style={{ background: 'var(--sf-primary-light)', border: '1px solid var(--sf-header-border)' }}>
                      {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <PackageIcon className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--sf-text)' }}>{item.product_name}</p>
                      <p className="text-xs" style={{ color: 'var(--sf-text-muted)' }}>Prix unitaire : {Number(item.price).toLocaleString('fr-DZ')} DZD</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => updateQuantity(slug, item._key, item.quantity - 1)} className="w-7 h-7 rounded flex items-center justify-center transition"
                        style={{ border: '1px solid var(--sf-header-border)', color: 'var(--sf-text-muted)' }}>
                        <MinusIcon className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm" style={{ color: 'var(--sf-text)' }}>{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(slug, item._key, item.quantity + 1)} className="w-7 h-7 rounded flex items-center justify-center transition"
                        style={{ border: '1px solid var(--sf-header-border)', color: 'var(--sf-text-muted)' }}>
                        <PlusIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="w-20 text-right text-sm font-semibold hidden sm:block" style={{ color: 'var(--sf-text)' }}>
                      {(item.price * item.quantity).toLocaleString('fr-DZ')}
                    </p>
                    <button type="button" onClick={() => removeItem(slug, item._key)} className="shrink-0 transition" style={{ color: '#f87171' }}>
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Étape 2 — Infos client */}
            <div className={panelCls} style={panelStyle}>
              {sectionTitle(2, 'Informations client')}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Prénom *</label>
                    <input value={client.first_name} onChange={e => setClient(c => ({ ...c, first_name: e.target.value }))} required className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Nom</label>
                    <input value={client.last_name} onChange={e => setClient(c => ({ ...c, last_name: e.target.value }))} className={inputCls} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Téléphone *</label>
                  <input type="tel" value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} required className={inputCls} style={inputStyle} placeholder="06xx xxx xxx" />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Email <span className="font-normal" style={{ color: 'var(--sf-text-muted)' }}>(optionnel — pour recevoir un rappel)</span></label>
                  <input type="email" value={client.email} onChange={e => setClient(c => ({ ...c, email: e.target.value }))} className={inputCls} style={inputStyle} placeholder="votre@email.com" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Wilaya *</label>
                    <Select
                      value={client.wilaya}
                      onChange={v => setClient(c => ({ ...c, wilaya: v, commune: '' }))}
                      options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
                      className={inputCls}
                      style={inputStyle}
                      variant="dark"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Commune</label>
                    <Select
                      value={client.commune}
                      onChange={v => setClient(c => ({ ...c, commune: v }))}
                      options={getCommunesForWilaya(getWilayaIdByName(client.wilaya)).map(name => ({ value: name, label: name }))}
                      placeholder={client.wilaya ? 'Choisissez une commune' : "Choisissez d'abord une wilaya"}
                      disabled={!client.wilaya}
                      className={inputCls}
                      style={inputStyle}
                      variant="dark"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Adresse</label>
                  <textarea value={client.address} onChange={e => setClient(c => ({ ...c, address: e.target.value }))} rows={2} className={`${inputCls} resize-none`} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Note (optionnel)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Étape 3 — Paiement */}
            <div className={panelCls} style={panelStyle}>
              {sectionTitle(3, 'Paiement')}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer rounded-xl p-3.5 transition" style={radioLabelStyle(paymentMethod === 'cod')}>
                  <input type="radio" name="payment_method" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} className="accent-violet-600 w-4 h-4" />
                  <span className="text-sm" style={{ color: 'var(--sf-text)' }}>Paiement à la livraison</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer rounded-xl p-3.5 transition" style={radioLabelStyle(paymentMethod === 'chargily')}>
                  <input type="radio" name="payment_method" checked={paymentMethod === 'chargily'} onChange={() => setPaymentMethod('chargily')} className="accent-violet-600 w-4 h-4" />
                  <span className="text-sm" style={{ color: 'var(--sf-text)' }}>Paiement en ligne (Chargily)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Résumé */}
          <div className="w-full lg:w-72 shrink-0 lg:sticky lg:top-24">
            <div className={panelCls} style={panelStyle}>
              <h2 className="font-semibold mb-4 text-center" style={{ color: 'var(--sf-text)' }}>Résumé</h2>

              {/* Code promo */}
              <div className="mb-4">
                {appliedPromo ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg ring-1 ring-inset ring-emerald-400/40" style={{ background: 'rgba(16,185,129,0.12)' }}>
                    <span className="text-sm font-medium" style={{ color: '#6ee7b7' }}>Code {appliedPromo.code} appliqué</span>
                    <button type="button" onClick={removePromo} className="text-xs underline cursor-pointer" style={{ color: '#6ee7b7' }}>Retirer</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Code promo"
                      className={`${inputCls} flex-1`}
                      style={inputStyle}
                    />
                    <button type="button" onClick={applyPromo} disabled={checkingPromo || !promoCode.trim()} className="shrink-0 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition"
                      style={{ border: '1px solid var(--sf-header-border)', color: 'var(--sf-text)' }}>
                      {checkingPromo ? '…' : 'Appliquer'}
                    </button>
                  </div>
                )}
                {promoError && <p className="text-sm mt-1.5" style={{ color: '#f87171' }}>{promoError}</p>}
              </div>

              {shippingRate && shippingRate.tarif_stopdesk != null && (
                <div className="mb-4 space-y-2">
                  <label className="flex items-center justify-between gap-3 cursor-pointer rounded-xl p-3 transition" style={radioLabelStyle(shippingOption === 'domicile')}>
                    <span className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--sf-text)' }}>
                      <input type="radio" name="shipping_option" checked={shippingOption === 'domicile'} onChange={() => setShippingOption('domicile')} className="accent-violet-600 w-4 h-4" />
                      Livraison à domicile
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>{Number(shippingRate.tarif).toLocaleString('fr-DZ')} DZD</span>
                  </label>
                  <label className="flex items-center justify-between gap-3 cursor-pointer rounded-xl p-3 transition" style={radioLabelStyle(shippingOption === 'stopdesk')}>
                    <span className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--sf-text)' }}>
                      <input type="radio" name="shipping_option" checked={shippingOption === 'stopdesk'} onChange={() => setShippingOption('stopdesk')} className="accent-violet-600 w-4 h-4" />
                      Retrait en point relais
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>{Number(shippingRate.tarif_stopdesk).toLocaleString('fr-DZ')} DZD</span>
                  </label>
                </div>
              )}

              {shippingOption === 'stopdesk' && (
                <div className="mb-4">
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--sf-text-muted)' }}>Bureau de retrait</label>
                  <Select
                    value={stationCode}
                    onChange={setStationCode}
                    options={desks.map(d => ({ value: d.code, label: `${d.name} — ${d.address}` }))}
                    placeholder={desksLoading ? 'Chargement des bureaux…' : desks.length ? 'Choisissez un bureau' : 'Aucun bureau disponible pour cette wilaya'}
                    disabled={desksLoading || desks.length === 0}
                    className={inputCls}
                    style={inputStyle}
                    variant="dark"
                  />
                </div>
              )}

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--sf-text-muted)' }}>Sous-total</span>
                  <span style={{ color: 'var(--sf-text)' }}>{subtotal.toLocaleString('fr-DZ')} DZD</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between" style={{ color: '#6ee7b7' }}>
                    <span>Réduction</span>
                    <span>-{discountAmount.toLocaleString('fr-DZ')} DZD</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: 'var(--sf-text-muted)' }}>Frais de livraison</span>
                  <span style={{ color: 'var(--sf-text)' }}>
                    {shippingLoading ? '…' : `${shippingCost.toLocaleString('fr-DZ')} DZD`}
                  </span>
                </div>
                <div className="pt-2 mt-2 flex justify-between font-semibold" style={{ borderTop: '1px solid var(--sf-header-border)' }}>
                  <span style={{ color: 'var(--sf-text)' }}>Total</span>
                  <span style={{ color: 'var(--sf-primary)' }}>{total.toLocaleString('fr-DZ')} DZD</span>
                </div>
              </div>

              {error && <p className="text-sm mb-2" style={{ color: '#f87171' }}>{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full mt-1 py-3 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: 'var(--sf-primary)' }}
              >
                {saving ? 'Envoi…' : 'Confirmer la commande'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </StorefrontLayout>
  )
}
