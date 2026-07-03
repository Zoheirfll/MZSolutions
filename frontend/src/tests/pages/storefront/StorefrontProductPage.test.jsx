import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StorefrontProductPage from '../../../pages/storefront/StorefrontProductPage'

vi.mock('../../../pages/storefront/StorefrontLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

vi.mock('../../../lib/pixels', () => ({
  trackEvent: vi.fn(),
}))

const mockCart = { addItem: vi.fn() }
vi.mock('../../../context/CartContext', () => ({
  useCart: () => mockCart,
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../api/publicApi', () => ({
  default: { get: vi.fn() },
}))
import publicApi from '../../../api/publicApi'

const PRODUCT = {
  id: 1,
  name: 'T-shirt',
  description: 'Un beau t-shirt',
  price: 1500,
  stock: 10,
  allow_out_of_stock: false,
  free_shipping: true,
  images: [],
  variants: [],
  categories: [],
  reviews: [],
  reviews_count: 0,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/store/demo/products/1']}>
      <Routes>
        <Route path="/store/:slug/products/:productId" element={<StorefrontProductPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StorefrontProductPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows product details after loading', async () => {
    publicApi.get.mockResolvedValueOnce({ data: PRODUCT })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'T-shirt' })).toBeInTheDocument()
    expect(screen.getByText('Un beau t-shirt')).toBeInTheDocument()
    expect(screen.getByText('En stock')).toBeInTheDocument()
  })

  it('adds the product to the cart when clicking "Ajouter au panier"', async () => {
    const user = userEvent.setup()
    publicApi.get.mockResolvedValueOnce({ data: PRODUCT })
    renderPage()

    await screen.findByRole('heading', { name: 'T-shirt' })
    await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }))

    expect(mockCart.addItem).toHaveBeenCalledWith('demo', expect.objectContaining({
      product: 1, quantity: 1, price: 1500,
    }))
    expect(await screen.findByText(/Ajouté/)).toBeInTheDocument()
  })

  it('shows "Produit introuvable" when the fetch fails', async () => {
    publicApi.get.mockRejectedValueOnce(new Error('not found'))
    renderPage()

    expect(await screen.findByText('Produit introuvable.')).toBeInTheDocument()
  })
})
