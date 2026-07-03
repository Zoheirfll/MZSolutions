import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OrdersStatsPage from '../../../../pages/orders/stats/OrdersStatsPage'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../../api/axios'

// jsdom has no layout engine, recharts' ResponsiveContainer/Bar/Pie rely on
// measured dimensions and can be flaky — stub with lightweight passthroughs.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }) => <div data-testid="pie">{JSON.stringify(data)}</div>,
  Cell: () => null,
  Legend: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
}))

const ORDERS_DATA = {
  total: 5,
  daily: [{ date: '2026-07-01', count: 3 }, { date: '2026-07-02', count: 2 }],
  by_status: [{ label: 'Confirmée', count: 3 }, { label: 'Livrée', count: 2 }],
}

function mockLayoutDefaults() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/stats/orders/')) {
      return Promise.resolve({ data: ORDERS_DATA })
    }
    return Promise.resolve({ data: { count: 0 } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersStatsPage />
    </MemoryRouter>
  )
}

describe('OrdersStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLayoutDefaults()
  })

  it('shows a spinner then renders the total, the bar chart and the status pie', async () => {
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('5 commandes sur la période.')).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('refetches with the expected query string when the period filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('5 commandes sur la période.')

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/orders/?period=week'))

    await user.click(screen.getByRole('button', { name: '30 derniers jours' }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/orders/?period=month'))
    })
  })

  it('shows the empty pie state message when by_status is empty', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/orders/')) {
        return Promise.resolve({ data: { total: 0, daily: [], by_status: [] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune commande sur cette période.')).toBeInTheDocument()
  })

  it('handles a server error gracefully without crashing (stays in the spinner state)', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/orders/')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/orders/')))
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })
})
