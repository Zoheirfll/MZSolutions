import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ReturnsStatsPage from '../../../../pages/orders/stats/ReturnsStatsPage'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../../api/axios'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}))

const RETURNS_DATA = {
  total_orders: 30,
  returned_count: 4,
  cancel_requested_count: 2,
  return_rate: 13,
  daily: [{ date: '2026-07-01', count: 1 }],
}

function mockLayoutDefaults() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/stats/returns/')) {
      return Promise.resolve({ data: RETURNS_DATA })
    }
    return Promise.resolve({ data: { count: 0 } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReturnsStatsPage />
    </MemoryRouter>
  )
}

describe('ReturnsStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLayoutDefaults()
  })

  it('shows a spinner then renders the stat cards and the daily bar chart', async () => {
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('30')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('13%')).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('refetches with the expected query string when the period filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('30')

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/returns/?period=week'))

    await user.click(screen.getByRole('button', { name: "Aujourd'hui" }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/returns/?period=day'))
    })
  })

  it('handles a server error gracefully without crashing (stays in the spinner state)', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/returns/')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/returns/')))
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })
})
