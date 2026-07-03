import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SourceStatsPage from '../../../../pages/orders/stats/SourceStatsPage'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../../api/axios'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }) => <div data-testid="pie">{JSON.stringify(data)}</div>,
  Cell: () => null,
  Legend: () => null,
  Tooltip: () => null,
}))

const SOURCE_DATA = {
  results: [
    { source: 'Boutique en ligne', orders_count: 10, confirmed_count: 7, revenue: 30000 },
    { source: 'Vente manuelle', orders_count: 3, confirmed_count: 3, revenue: 9000 },
  ],
}

function mockLayoutDefaults() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/stats/sources/')) {
      return Promise.resolve({ data: SOURCE_DATA })
    }
    return Promise.resolve({ data: { count: 0 } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SourceStatsPage />
    </MemoryRouter>
  )
}

describe('SourceStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLayoutDefaults()
  })

  it('shows a spinner then renders the pie chart and the source table', async () => {
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('Boutique en ligne')).toBeInTheDocument()
    expect(screen.getByText('Vente manuelle')).toBeInTheDocument()
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    expect(screen.getByText('30 000 DZD')).toBeInTheDocument()
  })

  it('refetches with the expected query string when the period filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Boutique en ligne')

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/sources/?period=week'))

    await user.click(screen.getByRole('button', { name: '30 derniers jours' }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/sources/?period=month'))
    })
  })

  it('shows the empty state (both pie placeholder and table row) when there are no results', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/sources/')) {
        return Promise.resolve({ data: { results: [] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune commande sur cette période.')).toBeInTheDocument()
  })

  it('handles a server error gracefully by falling back to the empty state instead of crashing', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/sources/')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune commande sur cette période.')).toBeInTheDocument()
  })
})
