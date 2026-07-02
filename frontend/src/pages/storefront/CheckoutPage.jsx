import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'
import { useCart } from '../../context/CartContext'
import { WILAYAS } from '../../data/wilayas'

const EMPTY_CLIENT = {
  first_name: '', last_name: '', phone: '',
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
      })
      if (data.payment_url) {
        clearCart(slug)
        window.location.href = data.payment_url
        return
      }
      clearCart(slug)
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
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Merci pour votre commande !</h1>
          <p className="text-gray-500 mb-6">Commande #{confirmedId} reçue. Nous vous contacterons bientôt.</p>
          <Link to={`/store/${slug}/products`} className="inline-block px-5 py-2.5 rounded-lg font-semibold text-white" style={{ background: '#7c3aed' }}>
            Continuer mes achats
          </Link>
        </div>
      </StorefrontLayout>
    )
  }

  if (cartItems.length === 0) {
    return (
      <StorefrontLayout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center text-gray-400">
          <p className="mb-4">Votre panier est vide.</p>
          <Link to={`/store/${slug}/products`} className="text-violet-600 font-medium hover:underline">
            Voir les produits
          </Link>
        </div>
      </StorefrontLayout>
    )
  }

  const inputCls = 'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition bg-white'

  return (
    <StorefrontLayout>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Finaliser la commande</h1>

        <form onSubmit={handleSubmit} className="flex gap-8 items-start">
          <div className="flex-1 min-w-0 space-y-6">
            {/* Articles */}
            <div className="border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Articles</h2>
              <div className="space-y-3">
                {cartItems.map(item => (
                  <div key={item._key} className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-xl text-gray-300">
                      {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-500">Prix unitaire : {Number(item.price).toLocaleString('fr-DZ')} DZD</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => updateQuantity(slug, item._key, item.quantity - 1)} className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:text-gray-800 text-xs">−</button>
                      <span className="w-6 text-center text-sm">{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(slug, item._key, item.quantity + 1)} className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:text-gray-800 text-xs">+</button>
                    </div>
                    <p className="w-20 text-right text-sm font-semibold text-gray-900">
                      {(item.price * item.quantity).toLocaleString('fr-DZ')}
                    </p>
                    <button type="button" onClick={() => removeItem(slug, item._key)} className="text-red-400 hover:text-red-500 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Infos client */}
            <div className="border border-gray-200 rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Vos informations</h2>
              <div className="grid grid-cols-2 gap-4">
                <input value={client.first_name} onChange={e => setClient(c => ({ ...c, first_name: e.target.value }))} required className={inputCls} placeholder="Prénom *" />
                <input value={client.last_name} onChange={e => setClient(c => ({ ...c, last_name: e.target.value }))} className={inputCls} placeholder="Nom" />
              </div>
              <input value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} required className={inputCls} placeholder="Téléphone *" />
              <div className="grid grid-cols-2 gap-4">
                <select value={client.wilaya} onChange={e => setClient(c => ({ ...c, wilaya: e.target.value }))} required className={inputCls}>
                  <option value="">Wilaya *</option>
                  {WILAYAS.map(w => <option key={w.id} value={w.name}>{w.id} — {w.name}</option>)}
                </select>
                <input value={client.commune} onChange={e => setClient(c => ({ ...c, commune: e.target.value }))} className={inputCls} placeholder="Commune" />
              </div>
              <textarea value={client.address} onChange={e => setClient(c => ({ ...c, address: e.target.value }))} rows={2} className={inputCls} placeholder="Adresse" />
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputCls} placeholder="Note (optionnel)" />
            </div>

            {/* Paiement */}
            <div className="border border-gray-200 rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-gray-900">Mode de paiement</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="payment_method" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} className="accent-violet-600 w-4 h-4" />
                <span className="text-sm text-gray-700">Paiement à la livraison</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="payment_method" checked={paymentMethod === 'chargily'} onChange={() => setPaymentMethod('chargily')} className="accent-violet-600 w-4 h-4" />
                <span className="text-sm text-gray-700">Paiement en ligne (Chargily)</span>
              </label>
            </div>
          </div>

          {/* Résumé */}
          <div className="w-72 shrink-0 sticky top-24">
            <div className="border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4 text-center">Résumé</h2>
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Sous-total</span>
                  <span className="text-gray-900">{subtotal.toLocaleString('fr-DZ')} DZD</span>
                </div>
                <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="text-violet-700">{subtotal.toLocaleString('fr-DZ')} DZD</span>
                </div>
              </div>

              {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
                style={{ background: '#7c3aed' }}
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
