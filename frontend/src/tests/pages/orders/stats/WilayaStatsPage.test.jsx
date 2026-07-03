import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import WilayaStatsPage from '../../../../pages/orders/stats/WilayaStatsPage'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../../api/axios'

const WILAYA_DATA = {
  results: [
    { wilaya: 'Alger', orders_count: 10, confirmed_count: 8, revenue: 45000 },
    { wilaya: 'Oran', orders_count: 4, confirmed_count: 2, revenue: 12000 },
  ],
}

function mockLayoutDefaults() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/stats/wilayas/')) {
      return Promise.resolve({ data: WILAYA_DATA })
    }
    return Promise.resolve({ data: { count: 0 } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WilayaStatsPage />
    </MemoryRouter>
  )
}

describe('WilayaStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLayoutDefaults()
  })

  it('shows a spinner then renders the per-wilaya table with formatted revenue', async () => {
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('Alger')).toBeInTheDocument()
    expect(screen.getByText('Oran')).toBeInTheDocument()
    expect(screen.getByText('45 000 DZD')).toBeInTheDocument()
  })

  it('refetches with the expected query string when the period filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Alger')

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/wilayas/?period=week'))

    await user.click(screen.getByRole('button', { name: "Aujourd'hui" }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/wilayas/?period=day'))
    })
  })

  it('shows the empty state row when there are no results', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/wilayas/')) {
        return Promise.resolve({ data: { results: [] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune commande sur cette période.')).toBeInTheDocument()
  })

  it('handles a server error gracefully by falling back to the empty table instead of crashing', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/wilayas/')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune commande sur cette période.')).toBeInTheDocument()
  })
})
