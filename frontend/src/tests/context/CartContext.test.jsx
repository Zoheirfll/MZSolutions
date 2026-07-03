import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { CartProvider, useCart } from '../../context/CartContext'

function wrapper({ children }) {
  return <CartProvider>{children}</CartProvider>
}

describe('CartContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty for a store slug', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.getItems('shop-a')).toEqual([])
    expect(result.current.getCount('shop-a')).toBe(0)
  })

  it('adds an item to the correct store cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem('shop-a', { _key: 'p1', price: 1000, quantity: 1 }))
    expect(result.current.getItems('shop-a')).toHaveLength(1)
    expect(result.current.getSubtotal('shop-a')).toBe(1000)
  })

  it('increments quantity when the same item is added twice', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem('shop-a', { _key: 'p1', price: 1000, quantity: 1 }))
    act(() => result.current.addItem('shop-a', { _key: 'p1', price: 1000, quantity: 2 }))
    expect(result.current.getItems('shop-a')).toHaveLength(1)
    expect(result.current.getCount('shop-a')).toBe(3)
  })

  it('updateQuantity below 1 removes the item', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem('shop-a', { _key: 'p1', price: 1000, quantity: 1 }))
    act(() => result.current.updateQuantity('shop-a', 'p1', 0))
    expect(result.current.getItems('shop-a')).toHaveLength(0)
  })

  it('removeItem removes only the targeted line', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem('shop-a', { _key: 'p1', price: 100, quantity: 1 }))
    act(() => result.current.addItem('shop-a', { _key: 'p2', price: 200, quantity: 1 }))
    act(() => result.current.removeItem('shop-a', 'p1'))
    expect(result.current.getItems('shop-a').map(i => i._key)).toEqual(['p2'])
  })

  it('clearCart empties only the given store', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem('shop-a', { _key: 'p1', price: 100, quantity: 1 }))
    act(() => result.current.addItem('shop-b', { _key: 'p1', price: 100, quantity: 1 }))
    act(() => result.current.clearCart('shop-a'))
    expect(result.current.getItems('shop-a')).toHaveLength(0)
    expect(result.current.getItems('shop-b')).toHaveLength(1)
  })

  it('carts are scoped independently per store slug', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem('shop-a', { _key: 'p1', price: 100, quantity: 1 }))
    expect(result.current.getItems('shop-b')).toHaveLength(0)
  })

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem('shop-a', { _key: 'p1', price: 100, quantity: 1 }))
    const stored = JSON.parse(localStorage.getItem('mz_cart'))
    expect(stored['shop-a']).toHaveLength(1)
  })
})
