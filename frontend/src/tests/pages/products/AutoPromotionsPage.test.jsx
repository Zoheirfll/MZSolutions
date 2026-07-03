import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AutoPromotionsPage from '../../../pages/products/AutoPromotionsPage'

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
      <AutoPromotionsPage />
    </MemoryRouter>
  )
}

const PROMOS = [
  { id: 1, name: 'Déstockage', discount_type: 'percentage', discount_value: 15, product_names: ['T-shirt'], category_names: [], starts_at: null, ends_at: null, is_active: true },
]

describe('AutoPromotionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the automatic promotion list once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/promotions/?kind=auto') return Promise.resolve({ data: PROMOS })
      if (url.startsWith('/products/?')) return Promise.resolve({ data: { results: [] } })
      if (url.startsWith('/products/categories/?')) return Promise.resolve({ data: { results: [] } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Déstockage')).toBeInTheDocument()
    expect(screen.getByText('15%')).toBeInTheDocument()
  })

  it('deletes a promotion after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.get.mockImplementation((url) => {
      if (url === '/products/promotions/?kind=auto') return Promise.resolve({ data: PROMOS })
      if (url.startsWith('/products/?')) return Promise.resolve({ data: { results: [] } })
      if (url.startsWith('/products/categories/?')) return Promise.resolve({ data: { results: [] } })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.delete.mockResolvedValueOnce({})
    renderPage()
    await screen.findByText('Déstockage')

    await user.click(screen.getByTitle('Supprimer'))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/products/promotions/1/'))
    window.confirm.mockRestore()
  })

  it('shows empty state when the server call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/promotions/?kind=auto') return Promise.reject(new Error('boom'))
      if (url.startsWith('/products/?')) return Promise.resolve({ data: { results: [] } })
      if (url.startsWith('/products/categories/?')) return Promise.resolve({ data: { results: [] } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune offre automatique')).toBeInTheDocument()
  })
})
