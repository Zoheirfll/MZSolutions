import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GlobalStatsPage from '../../../../pages/orders/stats/GlobalStatsPage'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../../api/axios'

const GLOBAL_DATA = {
  total_orders: 42,
  confirmation_rate: 75,
  delivered_count: 20,
  returned_count: 3,
  cancelled_count: 2,
  revenue: 123456,
  avg_basket: 2500,
}

function mockLayoutDefaults() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/stats/global/')) {
      return Promise.resolve({ data: GLOBAL_DATA })
    }
    return Promise.resolve({ data: { count: 0 } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <GlobalStatsPage />
    </MemoryRouter>
  )
}

describe('GlobalStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLayoutDefaults()
  })

  it('shows a spinner then renders the stat cards from the API response', async () => {
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('123 456 DZD')).toBeInTheDocument()
    expect(screen.getByText('2 500 DZD')).toBeInTheDocument()
  })

  it('refetches with the expected query string when the period filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('42')

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/global/?period=week'))

    await user.click(screen.getByRole('button', { name: "Aujourd'hui" }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/global/?period=day'))
    })
  })

  it('does not fetch until both custom dates are filled, then queries with date_from/date_to', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('42')
    api.get.mockClear()

    await user.click(screen.getByRole('button', { name: 'Personnalisé' }))
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/orders/stats/global/'))

    const [from, to] = screen.getAllByDisplayValue('')
    await user.type(from, '2026-01-01')
    await user.type(to, '2026-01-31')

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('date_from=2026-01-01'))
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('date_to=2026-01-31'))
    })
  })

  it('handles a server error gracefully without crashing (stays in the spinner state, no stat cards)', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/global/')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/global/')))
    // data stays null on error -> page keeps showing the spinner rather than crashing
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(screen.queryByText('42')).not.toBeInTheDocument()
  })
})
