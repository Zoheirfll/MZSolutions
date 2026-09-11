import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CheckoutPage from '../../../pages/storefront/CheckoutPage'

vi.mock('../../../pages/storefront/StorefrontLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

vi.mock('../../../lib/pixels', () => ({
  trackEvent: vi.fn(),
}))

const CART_ITEM = {
  _key: 'p1', product: 1, product_name: 'T-shirt', price: 1500, quantity: 2,
}

const mockCart = {
  getItems: vi.fn(() => [CART_ITEM]),
  getSubtotal: vi.fn(() => 3000),
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
  clearCart: vi.fn(),
}
vi.mock('../../../context/CartContext', () => ({
  useCart: () => mockCart,
  // Reproduit la vraie logique (prix × quantité, avec offre par palier si
  // applicable) — CheckoutPage l'importe directement depuis ce module.
  itemLineTotal: (item) => {
    const unit = Number(item.price) || 0
    const qty = item.quantity
    if (item.offer_enabled && item.offer_quantity && item.offer_price != null && qty >= item.offer_quantity) {
      const fullBlocks = Math.floor(qty / item.offer_quantity)
      const remainder = qty % item.offer_quantity
      return fullBlocks * Number(item.offer_price) + remainder * unit
    }
    return unit * qty
  },
}))

vi.mock('../../../api/publicApi', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}))
import publicApi from '../../../api/publicApi'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/store/demo/checkout']}>
      <Routes>
        <Route path="/store/:slug/checkout" element={<CheckoutPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicApi.post.mockReset()
    publicApi.get.mockReset()
    // Le composant vérifie systématiquement au montage si la boutique est en
    // pause (`GET /store/:slug/`) — non pausée par défaut dans les tests.
    publicApi.get.mockResolvedValue({ data: { is_paused: false } })
    mockCart.getItems.mockReturnValue([CART_ITEM])
    mockCart.getSubtotal.mockReturnValue(3000)
  })

  it('shows an empty-cart state when there are no items', () => {
    mockCart.getItems.mockReturnValue([])
    mockCart.getSubtotal.mockReturnValue(0)
    renderPage()
    expect(screen.getByText('Votre panier est vide.')).toBeInTheDocument()
  })

  it('affiche la section "Souvent achetés ensemble" quand des recommandations existent', async () => {
    publicApi.get.mockImplementation((url) => {
      if (url.includes('/cart-recommendations/')) {
        return Promise.resolve({ data: { results: [
          { id: 42, slug: 'reco', name: 'Produit suggéré', price: '900', image_url: null },
        ] } })
      }
      return Promise.resolve({ data: { is_paused: false } })
    })
    renderPage()
    expect(await screen.findByText('Produit suggéré')).toBeInTheDocument()
  })

  it('applies a promo code and reduces the total', async () => {
    const user = userEvent.setup()
    publicApi.post.mockResolvedValueOnce({ data: { code: 'PROMO10', discount_amount: 300 } })
    renderPage()

    await user.type(screen.getByPlaceholderText('Code promo'), 'promo10')
    await user.click(screen.getByRole('button', { name: 'Appliquer' }))

    expect(await screen.findByText('Code PROMO10 appliqué')).toBeInTheDocument()
    expect(screen.getByText('-300 DZD')).toBeInTheDocument()
    expect(screen.getByText('2 700 DZD')).toBeInTheDocument()
  })

  it('shows an error when the promo code is invalid', async () => {
    const user = userEvent.setup()
    publicApi.post.mockRejectedValueOnce({ response: { data: { detail: 'Code promo invalide.' } } })
    renderPage()

    await user.type(screen.getByPlaceholderText('Code promo'), 'BADCODE')
    await user.click(screen.getByRole('button', { name: 'Appliquer' }))

    expect(await screen.findByText('Code promo invalide.')).toBeInTheDocument()
  })

  it('submits the order (COD) and shows the confirmation screen, clearing the cart', async () => {
    const user = userEvent.setup()
    publicApi.post.mockImplementation((url) => {
      if (url === '/orders/') return Promise.resolve({ data: { id: 99 } })
      return Promise.resolve({ data: {} })
    })
    renderPage()

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'Ali')
    await user.type(document.querySelector('input[type="tel"]'), '0555000000')

    await user.click(screen.getByRole('button', { name: 'Confirmer la commande' }))

    await waitFor(() => expect(publicApi.post).toHaveBeenCalledWith('/orders/', expect.objectContaining({
      store_slug: 'demo',
      payment_method: 'cod',
      items: [expect.objectContaining({ product: 1, price: 1500, quantity: 2 })],
    })))
    expect(await screen.findByText('Merci pour votre commande !')).toBeInTheDocument()
    expect(mockCart.clearCart).toHaveBeenCalledWith('demo')
  })

  it('redirects to the Chargily payment URL when payment_method is chargily', async () => {
    const user = userEvent.setup()
    publicApi.post.mockImplementation((url) => {
      if (url === '/orders/') return Promise.resolve({ data: { id: 100, payment_url: 'https://pay.chargily.test/x' } })
      return Promise.resolve({ data: {} })
    })
    renderPage()

    await user.type(screen.getAllByRole('textbox')[0], 'Ali')
    await user.type(document.querySelector('input[type="tel"]'), '0555000000')
    await user.click(screen.getByText('Paiement en ligne (Chargily)'))
    await user.click(screen.getByRole('button', { name: 'Confirmer la commande' }))

    await waitFor(() => expect(publicApi.post).toHaveBeenCalledWith('/orders/', expect.objectContaining({ payment_method: 'chargily' })))
    await waitFor(() => expect(mockCart.clearCart).toHaveBeenCalledWith('demo'))
  })

  it('shows a server error message and does not clear the cart on failure', async () => {
    const user = userEvent.setup()
    publicApi.post.mockRejectedValueOnce({ response: { data: { detail: 'Ce numéro est bloqué.' } } })
    renderPage()

    await user.type(screen.getAllByRole('textbox')[0], 'Ali')
    await user.type(document.querySelector('input[type="tel"]'), '0555000000')
    await user.click(screen.getByRole('button', { name: 'Confirmer la commande' }))

    expect(await screen.findByText('Ce numéro est bloqué.')).toBeInTheDocument()
    expect(mockCart.clearCart).not.toHaveBeenCalled()
  })
})
