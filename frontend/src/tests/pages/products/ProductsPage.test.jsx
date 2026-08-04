import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ProductsPage from '../../../pages/products/ProductsPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsPage />
    </MemoryRouter>
  )
}

const PRODUCTS_DATA = {
  results: [
    { id: 1, name: 'T-shirt', price: 1500, stock: 10, sold_count: 3, is_active: true, category_names: ['Vêtements'], images: [] },
    { id: 2, name: 'Casquette', price: 900, stock: 0, sold_count: 0, is_active: false, category_names: [], images: [] },
  ],
  count: 2, page: 1, per_page: 10,
}

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the product list once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?')) return Promise.resolve({ data: PRODUCTS_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText('Casquette')).toBeInTheDocument()
    expect(screen.getByText('2 produits')).toBeInTheDocument()
  })

  it('filters products by search input', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?')) return Promise.resolve({ data: PRODUCTS_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await screen.findByText('T-shirt')

    await user.type(screen.getByPlaceholderText('Recherche par produit'), 'shirt')

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('search=shirt')))
  })

  it('toggles product active state', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?')) return Promise.resolve({ data: PRODUCTS_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.put.mockResolvedValueOnce({})
    renderPage()
    await screen.findByText('T-shirt')

    await user.click(screen.getByText('Actif'))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/products/1/', { is_active: false }))
  })

  it('shows empty state gracefully when the server call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?')) return Promise.reject(new Error('network error'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucun produit trouvé')).toBeInTheDocument()
  })

  it('filters by category using the real category list', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?')) return Promise.resolve({ data: PRODUCTS_DATA })
      if (url.startsWith('/products/categories/')) return Promise.resolve({ data: { results: [{ id: 1, name: 'Vêtements' }] } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await screen.findByText('T-shirt')

    await user.click(screen.getByText('Toutes les catégories'))
    await user.click(screen.getByRole('button', { name: 'Vêtements' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('category=V%C3%AAtements')))
  })

  it('flags low-stock products using the store threshold', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?')) return Promise.resolve({ data: PRODUCTS_DATA })
      if (url.startsWith('/stores/me/settings/')) return Promise.resolve({ data: { low_stock_threshold: 5 } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await screen.findByText('T-shirt')

    // stock=10 (T-shirt) est au-dessus du seuil 5, stock=0 (Casquette) est en-dessous
    const stockCells = screen.getAllByText(/^(10|0)$/)
    expect(stockCells.find(el => el.textContent === '0')).toHaveClass('text-red-400')
  })

  it('selects rows and performs a bulk deactivate', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?')) return Promise.resolve({ data: PRODUCTS_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.put.mockResolvedValue({})
    renderPage()
    await screen.findByText('T-shirt')

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1]) // première ligne (index 0 = case "tout sélectionner")

    expect(screen.getByText('1 sélectionné')).toBeInTheDocument()
    await user.click(screen.getByText('Désactiver'))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/products/1/', { is_active: false }))
  })
})
