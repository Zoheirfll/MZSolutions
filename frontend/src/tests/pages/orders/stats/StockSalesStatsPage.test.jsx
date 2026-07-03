import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StockSalesStatsPage from '../../../../pages/orders/stats/StockSalesStatsPage'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../../api/axios'

const STOCK_SALES_DATA = {
  results: [
    { product_id: 1, product_name: 'T-shirt', units_sold: 12, movements: 5 },
    { product_id: 2, product_name: 'Pantalon', units_sold: 3, movements: 2 },
  ],
}

function mockLayoutDefaults() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/stats/stock-sales/')) {
      return Promise.resolve({ data: STOCK_SALES_DATA })
    }
    return Promise.resolve({ data: { count: 0 } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StockSalesStatsPage />
    </MemoryRouter>
  )
}

describe('StockSalesStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLayoutDefaults()
  })

  it('shows a spinner then renders the units-sold table with the computed total', async () => {
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('15 unités vendues sur la période.')).toBeInTheDocument()
    expect(screen.getByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText('Pantalon')).toBeInTheDocument()
  })

  it('refetches with the expected query string when the period filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('T-shirt')

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/stock-sales/?period=week'))

    await user.click(screen.getByRole('button', { name: "Aujourd'hui" }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/stock-sales/?period=day'))
    })
  })

  it('shows the empty state row and a zero total when there are no sales', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/stock-sales/')) {
        return Promise.resolve({ data: { results: [] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('0 unités vendues sur la période.')).toBeInTheDocument()
    expect(screen.getByText('Aucune vente sur cette période.')).toBeInTheDocument()
  })

  it('handles a server error gracefully by falling back to the empty table instead of crashing', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/stock-sales/')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune vente sur cette période.')).toBeInTheDocument()
  })
})
