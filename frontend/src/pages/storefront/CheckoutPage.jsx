import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import Select from '../../components/Select'
import publicApi from '../../api/publicApi'
import { useCart } from '../../context/CartContext'
import { WILAYAS } from '../../data/wilayas'
import { theme } from '../../theme'

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
  const abandonedTimerRef = useRef(null)

  const discountAmount = appliedPromo ? Number(appliedPromo.discount_amount) : 0
  const total = subtotal - discountAmount

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
          <div className={`${theme.badge.success} inline-flex! w-16! h-16! rounded-full! p-0! items-center justify-center mb-4`}>
            <CheckIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Merci pour votre commande !</h1>
          <p className="text-gray-500 mb-6">Commande #{confirmedId} reçue. Nous vous contacterons bientôt.</p>
          <Link to={`/store/${slug}/products`} className={theme.btn.primary}>
            Continuer mes achats
          </Link>
          <p className="text-xs text-gray-400 mt-6">
            Un problème avec votre commande ? <Link to={`/store/${slug}/reclamation?order=${confirmedId}`} className="text-violet-600 hover:underline">Déposer une réclamation</Link>
          </p>
        </div>
      </StorefrontLayout>
    )
  }

  if (cartItems.length === 0) {
    return (
      <StorefrontLayout>
        <div className={theme.emptyState}>
          <CartIcon className="w-12 h-12 text-gray-300 mb-3" />
          <p className="mb-4">Votre panier est vide.</p>
          <Link to={`/store/${slug}/products`} className={theme.btn.outline}>
            Voir les produits
          </Link>
        </div>
      </StorefrontLayout>
    )
  }

  const sectionTitle = (num, label) => (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{num}</span>
      <h2 className="font-semibold text-gray-900">{label}</h2>
    </div>
  )

  return (
    <StorefrontLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Finaliser la commande</h1>

        <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <div className="flex-1 min-w-0 w-full space-y-6">
            {/* Étape 1 — Articles */}
            <div className={theme.panel}>
              {sectionTitle(1, 'Panier')}
              <div className="space-y-3">
                {cartItems.map(item => (
                  <div key={item._key} className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-gray-300">
                      {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <PackageIcon className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-500">Prix unitaire : {Number(item.price).toLocaleString('fr-DZ')} DZD</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => updateQuantity(slug, item._key, item.quantity - 1)} className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:text-gray-800 flex items-center justify-center">
                        <MinusIcon className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm">{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(slug, item._key, item.quantity + 1)} className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:text-gray-800 flex items-center justify-center">
                        <PlusIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="w-20 text-right text-sm font-semibold text-gray-900 hidden sm:block">
                      {(item.price * item.quantity).toLocaleString('fr-DZ')}
                    </p>
                    <button type="button" onClick={() => removeItem(slug, item._key)} className="text-red-400 hover:text-red-500 shrink-0">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Étape 2 — Infos client */}
            <div className={theme.panel}>
              {sectionTitle(2, 'Informations client')}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={theme.label}>Prénom *</label>
                    <input value={client.first_name} onChange={e => setClient(c => ({ ...c, first_name: e.target.value }))} required className={theme.input} />
                  </div>
                  <div>
                    <label className={theme.label}>Nom</label>
                    <input value={client.last_name} onChange={e => setClient(c => ({ ...c, last_name: e.target.value }))} className={theme.input} />
                  </div>
                </div>
                <div>
                  <label className={theme.label}>Téléphone *</label>
                  <input type="tel" value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} required className={theme.input} placeholder="06xx xxx xxx" />
                </div>
                <div>
                  <label className={theme.label}>Email <span className="text-gray-400 font-normal">(optionnel — pour recevoir un rappel)</span></label>
                  <input type="email" value={client.email} onChange={e => setClient(c => ({ ...c, email: e.target.value }))} className={theme.input} placeholder="votre@email.com" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={theme.label}>Wilaya *</label>
                    <Select
                      value={client.wilaya}
                      onChange={v => setClient(c => ({ ...c, wilaya: v }))}
                      options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
                      className={theme.input}
                      variant="light"
                    />
                  </div>
                  <div>
                    <label className={theme.label}>Commune</label>
                    <input value={client.commune} onChange={e => setClient(c => ({ ...c, commune: e.target.value }))} className={theme.input} />
                  </div>
                </div>
                <div>
                  <label className={theme.label}>Adresse</label>
                  <textarea value={client.address} onChange={e => setClient(c => ({ ...c, address: e.target.value }))} rows={2} className={theme.input} />
                </div>
                <div>
                  <label className={theme.label}>Note (optionnel)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={theme.input} />
                </div>
              </div>
            </div>

            {/* Étape 3 — Paiement */}
            <div className={theme.panel}>
              {sectionTitle(3, 'Paiement')}
              <div className="space-y-3">
                <label className={`flex items-center gap-3 cursor-pointer rounded-xl border p-3.5 transition ${paymentMethod === 'cod' ? 'border-violet-500 bg-violet-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="payment_method" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} className="accent-violet-600 w-4 h-4" />
                  <span className="text-sm text-gray-700">Paiement à la livraison</span>
                </label>
                <label className={`flex items-center gap-3 cursor-pointer rounded-xl border p-3.5 transition ${paymentMethod === 'chargily' ? 'border-violet-500 bg-violet-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="payment_method" checked={paymentMethod === 'chargily'} onChange={() => setPaymentMethod('chargily')} className="accent-violet-600 w-4 h-4" />
                  <span className="text-sm text-gray-700">Paiement en ligne (Chargily)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Résumé */}
          <div className="w-full lg:w-72 shrink-0 lg:sticky lg:top-24">
            <div className={theme.panel}>
              <h2 className="font-semibold text-gray-900 mb-4 text-center">Résumé</h2>

              {/* Code promo */}
              <div className="mb-4">
                {appliedPromo ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <span className="text-sm text-emerald-700 font-medium">Code {appliedPromo.code} appliqué</span>
                    <button type="button" onClick={removePromo} className="text-xs text-emerald-600 hover:text-emerald-800 underline cursor-pointer">Retirer</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Code promo"
                      className={`${theme.input} flex-1`}
                    />
                    <button type="button" onClick={applyPromo} disabled={checkingPromo || !promoCode.trim()} className={`${theme.btn.outline} shrink-0 disabled:opacity-50`}>
                      {checkingPromo ? '…' : 'Appliquer'}
                    </button>
                  </div>
                )}
                {promoError && <p className={theme.errorText}>{promoError}</p>}
              </div>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Sous-total</span>
                  <span className="text-gray-900">{subtotal.toLocaleString('fr-DZ')} DZD</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Réduction</span>
                    <span>-{discountAmount.toLocaleString('fr-DZ')} DZD</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="text-violet-700">{total.toLocaleString('fr-DZ')} DZD</span>
                </div>
              </div>

              {error && <p className={theme.errorText}>{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className={`${theme.btn.primary} w-full mt-1`}
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
