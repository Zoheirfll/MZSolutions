import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ProductsStatsPage from '../../../../pages/orders/stats/ProductsStatsPage'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../../api/axios'

const PRODUCTS_DATA = {
  results: [
    { product_id: 1, product_name: 'T-shirt', best_wilaya: 'Alger', best_source: 'Boutique en ligne', orders_count: 10, confirmed_count: 7 },
  ],
}

function mockLayoutDefaults() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/stats/products/')) {
      return Promise.resolve({ data: PRODUCTS_DATA })
    }
    return Promise.resolve({ data: { count: 0 } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsStatsPage />
    </MemoryRouter>
  )
}

describe('ProductsStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLayoutDefaults()
  })

  it('shows a spinner then renders the per-product stats table', async () => {
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText('Alger')).toBeInTheDocument()
    expect(screen.getByText('Boutique en ligne')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('refetches with the expected query string when the period filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('T-shirt')

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/products/?period=week'))

    await user.click(screen.getByRole('button', { name: '30 derniers jours' }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/products/?period=month'))
    })
  })

  it('shows the empty state row when there are no results', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/products/')) {
        return Promise.resolve({ data: { results: [] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune commande sur cette période.')).toBeInTheDocument()
  })

  it('handles a server error gracefully by falling back to the empty table instead of crashing', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/products/')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune commande sur cette période.')).toBeInTheDocument()
  })
})
