import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StorefrontLayout from '../../../pages/storefront/StorefrontLayout'

vi.mock('../../../storefront-themes', () => ({
  injectTheme: vi.fn(),
  cleanupTheme: vi.fn(),
}))

vi.mock('../../../lib/pixels', () => ({
  loadPixelScripts: vi.fn(),
  trackEvent: vi.fn(),
}))

const mockCart = { getCount: vi.fn(() => 0) }
vi.mock('../../../context/CartContext', () => ({
  useCart: () => mockCart,
}))

vi.mock('../../../api/publicApi', () => ({
  default: { get: vi.fn() },
}))
import publicApi from '../../../api/publicApi'

const STORE = { id: 1, name: 'Ma Boutique', logo_url: null, pixels: [] }

function renderPage(initialPath = '/store/demo') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/store/:slug" element={<StorefrontLayout><div>Contenu</div></StorefrontLayout>} />
        <Route path="/store/:slug/products" element={<div>Page Produits</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StorefrontLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCart.getCount.mockReturnValue(0)
  })

  it('renders the store name and children once loaded', async () => {
    publicApi.get.mockResolvedValueOnce({ data: STORE })
    renderPage()

    expect((await screen.findAllByText('Ma Boutique')).length).toBeGreaterThan(0)
    expect(screen.getByText('Contenu')).toBeInTheDocument()
  })

  it('shows the cart badge when the cart has items', async () => {
    mockCart.getCount.mockReturnValue(3)
    publicApi.get.mockResolvedValueOnce({ data: STORE })
    renderPage()

    await screen.findAllByText('Ma Boutique')
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('navigates to the products page when submitting a search', async () => {
    const user = userEvent.setup()
    publicApi.get.mockResolvedValueOnce({ data: STORE })
    renderPage()

    await screen.findAllByText('Ma Boutique')
    await user.type(screen.getByPlaceholderText('Rechercher un produit…'), 'chaussures')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Page Produits')).toBeInTheDocument()
  })

  it('opens a mobile menu listing the store links, and closes it again', async () => {
    const user = userEvent.setup()
    publicApi.get.mockResolvedValueOnce({ data: STORE })
    renderPage()

    await screen.findAllByText('Ma Boutique')
    expect(document.getElementById('storefront-mobile-menu')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    const menu = document.getElementById('storefront-mobile-menu')
    expect(menu).not.toBeNull()
    expect(menu.textContent).toMatch(/Accueil/)
    expect(menu.textContent).toMatch(/Produits/)

    await user.click(screen.getByRole('button', { name: 'Fermer le menu' }))
    expect(document.getElementById('storefront-mobile-menu')).toBeNull()
  })

  it('still renders the layout when the store fetch fails', async () => {
    publicApi.get.mockRejectedValueOnce(new Error('network error'))
    renderPage()

    expect(await screen.findByText('Contenu')).toBeInTheDocument()
  })
})
