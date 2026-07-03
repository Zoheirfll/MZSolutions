import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StorefrontProductsPage from '../../../pages/storefront/StorefrontProductsPage'

vi.mock('../../../pages/storefront/StorefrontLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

vi.mock('../../../api/publicApi', () => ({
  default: { get: vi.fn() },
}))
import publicApi from '../../../api/publicApi'

const CATEGORIES = [{ id: 1, name: 'Vêtements' }]
const PRODUCTS_PAGE1 = {
  results: [{ id: 1, name: 'T-shirt', price: 1500, image_url: null }],
  count: 1,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/store/demo/products']}>
      <Routes>
        <Route path="/store/:slug/products" element={<StorefrontProductsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StorefrontProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists products and categories after loading', async () => {
    publicApi.get.mockImplementation((url) => {
      if (url === '/store/demo/categories/') return Promise.resolve({ data: CATEGORIES })
      return Promise.resolve({ data: PRODUCTS_PAGE1 })
    })
    renderPage()

    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText('Vêtements')).toBeInTheDocument()
    expect(screen.getByText('1 produit')).toBeInTheDocument()
  })

  it('filters by min price and refetches products', async () => {
    const user = userEvent.setup()
    publicApi.get.mockImplementation((url) => {
      if (url === '/store/demo/categories/') return Promise.resolve({ data: CATEGORIES })
      return Promise.resolve({ data: PRODUCTS_PAGE1 })
    })
    renderPage()
    await screen.findByText('T-shirt')
    publicApi.get.mockClear()

    await user.type(screen.getByPlaceholderText('Min'), '500')

    await waitFor(() => {
      const calledWithMin = publicApi.get.mock.calls.some(([url]) => url.includes('min_price=500'))
      expect(calledWithMin).toBe(true)
    })
  })

  it('shows an empty state when the product search fails', async () => {
    publicApi.get.mockImplementation((url) => {
      if (url === '/store/demo/categories/') return Promise.resolve({ data: CATEGORIES })
      return Promise.reject(new Error('server error'))
    })
    renderPage()

    expect(await screen.findByText('Aucun produit trouvé.')).toBeInTheDocument()
  })
})
