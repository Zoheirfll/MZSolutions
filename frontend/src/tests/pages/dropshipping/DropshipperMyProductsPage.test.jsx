import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DropshipperMyProductsPage from '../../../pages/dropshipping/DropshipperMyProductsPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'dropshipper', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <DropshipperMyProductsPage />
    </MemoryRouter>
  )
}

const PRODUCT = { id: 5, name: 'T-shirt', price: 1500 }
const SELECTED = { id: 1, product: 5 }

function mockGet({ selected = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/dropshipping/products/') return Promise.resolve({ data: selected })
    if (url.startsWith('/products/')) return Promise.resolve({ data: { results: [PRODUCT] } })
    return Promise.resolve({ data: {} })
  })
}

describe('DropshipperMyProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the product catalog once loaded', async () => {
    mockGet()
    renderPage()
    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
  })

  it('adds a product to the dropshipper selection', async () => {
    const user = userEvent.setup()
    mockGet()
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('T-shirt')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dropshipping/products/', { product: 5 }))
  })

  it('removes an already-selected product', async () => {
    const user = userEvent.setup()
    mockGet({ selected: [SELECTED] })
    api.delete.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('T-shirt')
    await user.click(screen.getByRole('button', { name: 'Retirer' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/dropshipping/products/1/'))
  })

  it('shows no results when the catalog is empty', async () => {
    // Note: DropshipperMyProductsPage has no .catch() on its initial
    // Promise.all() load — a rejected request produces an unhandled
    // promise rejection instead of an empty/error state. Exercised here
    // with a resolved-but-empty response to avoid that pre-existing bug.
    mockGet({ selected: [] })
    api.get.mockImplementation((url) => {
      if (url === '/dropshipping/products/') return Promise.resolve({ data: [] })
      if (url.startsWith('/products/')) return Promise.resolve({ data: { results: [] } })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    expect(await screen.findByText('Aucun produit trouvé.')).toBeInTheDocument()
  })
})
