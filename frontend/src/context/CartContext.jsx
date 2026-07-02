import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext(null)
const STORAGE_KEY = 'mz_cart'

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

  const getSubtotal = slug => getItems(slug).reduce((s, i) => s + i.price * i.quantity, 0)
  const getCount    = slug => getItems(slug).reduce((s, i) => s + i.quantity, 0)

  return (
    <CartContext.Provider value={{ getItems, addItem, updateQuantity, removeItem, clearCart, getSubtotal, getCount }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
