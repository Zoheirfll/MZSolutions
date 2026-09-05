import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import SalesForecastPage from '../../../../pages/orders/stats/SalesForecastPage'

vi.mock('../../../../api/axios', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/orders/stats/forecast/')) {
        return Promise.resolve({ data: { history_days: 30, points: [
          { date: '2026-09-06', predicted_orders: 3.2, orders_low: 1.5, orders_high: 5, predicted_revenue: 6400, revenue_low: 3000, revenue_high: 10000 },
        ] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    }),
  },
}))
vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('SalesForecastPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const api = (await import('../../../../api/axios')).default
    api.get.mockImplementation((url) => {
      if (url.includes('/orders/stats/forecast/')) {
        return Promise.resolve({ data: { history_days: 30, points: [
          { date: '2026-09-06', predicted_orders: 3.2, orders_low: 1.5, orders_high: 5, predicted_revenue: 6400, revenue_low: 3000, revenue_high: 10000 },
        ] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
  })

  it("affiche le bandeau d'avertissement et le tableau de prévision", async () => {
    render(<MemoryRouter><SalesForecastPage /></MemoryRouter>)
    expect(await screen.findByText(/estimation statistique/i)).toBeInTheDocument()
    expect(await screen.findByText('2026-09-06')).toBeInTheDocument()
  })

  it("affiche un message clair si l'historique est insuffisant", async () => {
    const api = (await import('../../../../api/axios')).default
    api.get.mockImplementation((url) => {
      if (url.includes('/orders/stats/forecast/')) {
        return Promise.reject({ response: { status: 400, data: { detail: 'Historique insuffisant pour une prévision fiable (14 jours minimum).' } } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><SalesForecastPage /></MemoryRouter>)
    expect(await screen.findByText(/Historique insuffisant/i)).toBeInTheDocument()
  })

  it("change l'horizon via le curseur et relance la requête", async () => {
    const api = (await import('../../../../api/axios')).default
    render(<MemoryRouter><SalesForecastPage /></MemoryRouter>)
    await screen.findByText('2026-09-06')
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '30' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('horizon_days=30')))
  })
})
