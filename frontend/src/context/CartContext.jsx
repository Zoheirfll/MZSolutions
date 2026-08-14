import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext(null)
const STORAGE_KEY = 'mz_cart'

// Prix effectif d'une ligne de panier — reproduit _apply_offer_pricing côté
// serveur (orders/views.py) : si l'article a une offre par palier de quantité
// active et que la quantité de CETTE ligne l'atteint, le prix est recalculé
// par blocs pleins + reliquat au prix normal. Le serveur reste la source de
// vérité au moment de la commande (_authoritative_item_price) — ceci n'est
// qu'un aperçu client cohérent avec ce que la commande facturera vraiment.
export function itemLineTotal(item) {
  const unit = Number(item.price) || 0
  const qty  = item.quantity
  if (item.offer_enabled && item.offer_quantity && item.offer_price != null && qty >= item.offer_quantity) {
    const fullBlocks = Math.floor(qty / item.offer_quantity)
    const remainder  = qty % item.offer_quantity
    return fullBlocks * Number(item.offer_price) + remainder * unit
  }
  return unit * qty
}

export function CartProvider({ children }) {
  const [carts, setCarts] = useState({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setCarts(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(carts))
  }, [carts])

  const getItems = slug => carts[slug] || []

  const addItem = (slug, item) => {
    setCarts(prev => {
      const items = prev[slug] || []
      const exists = items.find(i => i._key === item._key)
      const next = exists
        ? items.map(i => i._key === item._key ? { ...i, quantity: i.quantity + item.quantity } : i)
        : [...items, item]
      return { ...prev, [slug]: next }
    })
  }

  const updateQuantity = (slug, key, qty) => {
    setCarts(prev => {
      const items = prev[slug] || []
      const next = qty < 1
        ? items.filter(i => i._key !== key)
        : items.map(i => i._key === key ? { ...i, quantity: qty } : i)
      return { ...prev, [slug]: next }
    })
  }

  const removeItem = (slug, key) => {
    setCarts(prev => ({ ...prev, [slug]: (prev[slug] || []).filter(i => i._key !== key) }))
  }

  const clearCart = slug => {
    setCarts(prev => ({ ...prev, [slug]: [] }))
  }

  const getSubtotal = slug => getItems(slug).reduce((s, i) => s + itemLineTotal(i), 0)
  const getCount    = slug => getItems(slug).reduce((s, i) => s + i.quantity, 0)

  return (
    <CartContext.Provider value={{ getItems, addItem, updateQuantity, removeItem, clearCart, getSubtotal, getCount }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
