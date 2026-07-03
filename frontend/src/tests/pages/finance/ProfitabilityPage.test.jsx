import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ProfitabilityPage from '../../../pages/finance/ProfitabilityPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfitabilityPage />
    </MemoryRouter>
  )
}

const SUMMARY = {
  orders_count: 3, revenue: 30000, product_cost: 10000, commission: 2000,
  operational_cost: 5000, marketing_cost: 1000, net_profit: 12000,
}
const ROWS_PRODUCT = [{ label: 'T-shirt', orders_count: 3, revenue: 30000, product_cost: 10000, commission: 2000, profit: 18000 }]
const ROWS_WILAYA = [{ label: 'Alger', orders_count: 3, revenue: 30000, product_cost: 10000, commission: 2000, profit: 18000 }]

function mockGet() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/finance/profitability/summary/')) return Promise.resolve({ data: SUMMARY })
    if (url.includes('group_by=wilaya')) return Promise.resolve({ data: ROWS_WILAYA })
    if (url.startsWith('/finance/profitability/')) return Promise.resolve({ data: ROWS_PRODUCT })
    return Promise.resolve({ data: {} })
  })
}

describe('ProfitabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the summary and detail table once loaded', async () => {
    mockGet()
    renderPage()
    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText(/Basé sur 3 commandes livrées/)).toBeInTheDocument()
    expect(screen.getByText('12 000 DZD')).toBeInTheDocument()
  })

  it('switches grouping to wilaya and refetches', async () => {
    const user = userEvent.setup()
    mockGet()
    renderPage()

    await screen.findByText('T-shirt')
    await user.click(screen.getByRole('button', { name: 'Par wilaya' }))

    expect(await screen.findByText('Alger')).toBeInTheDocument()
  })

  it('stays on the loading state without crashing when the request fails', async () => {
    api.get.mockRejectedValue(new Error('network error'))
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })
})
