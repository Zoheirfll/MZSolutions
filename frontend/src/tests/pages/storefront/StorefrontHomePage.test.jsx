import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StorefrontHomePage from '../../../pages/storefront/StorefrontHomePage'

vi.mock('../../../pages/storefront/StorefrontLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

vi.mock('../../../api/publicApi', () => ({
  default: { get: vi.fn() },
}))
import publicApi from '../../../api/publicApi'

const STORE = { id: 1, name: 'Ma Boutique', description: 'La meilleure boutique', logo_url: null }
const PRODUCTS = {
  results: [
    { id: 1, name: 'T-shirt', price: 1500, image_url: null, free_shipping: true },
    { id: 2, name: 'Casquette', price: 800, image_url: null, compare_price: 1000 },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/store/demo']}>
      <Routes>
        <Route path="/store/:slug" element={<StorefrontHomePage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StorefrontHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows products after loading', async () => {
    publicApi.get.mockImplementation((url) => {
      if (url === '/store/demo/') return Promise.resolve({ data: STORE })
      return Promise.resolve({ data: PRODUCTS })
    })
    renderPage()

    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText('Casquette')).toBeInTheDocument()
    expect(screen.getByText('Ma Boutique')).toBeInTheDocument()
  })

  it('navigates to the products listing via the "Voir tous les produits" link', async () => {
    publicApi.get.mockImplementation((url) => {
      if (url === '/store/demo/') return Promise.resolve({ data: STORE })
      return Promise.resolve({ data: PRODUCTS })
    })
    renderPage()

    await screen.findByText('T-shirt')
    const link = screen.getByText('Voir tous les produits').closest('a')
    expect(link).toHaveAttribute('href', '/store/demo/products')
  })

  it('shows the empty state when the API call fails', async () => {
    publicApi.get.mockRejectedValue(new Error('network error'))
    renderPage()

    expect(await screen.findByText('Aucun produit disponible pour le moment.')).toBeInTheDocument()
  })
})
