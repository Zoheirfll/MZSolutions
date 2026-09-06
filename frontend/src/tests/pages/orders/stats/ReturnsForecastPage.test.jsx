import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ReturnsForecastPage from '../../../../pages/orders/stats/ReturnsForecastPage'

vi.mock('../../../../api/axios', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/orders/stats/returns-forecast/')) {
        return Promise.resolve({ data: { history_days: 45, points: [
          { date: '2026-09-07', predicted_rate: 8.4, rate_low: 5.1, rate_high: 11.7 },
        ] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    }),
  },
}))
vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('ReturnsForecastPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const api = (await import('../../../../api/axios')).default
    api.get.mockImplementation((url) => {
      if (url.includes('/orders/stats/returns-forecast/')) {
        return Promise.resolve({ data: { history_days: 45, points: [
          { date: '2026-09-07', predicted_rate: 8.4, rate_low: 5.1, rate_high: 11.7 },
        ] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
  })

  it("affiche le bandeau d'avertissement et le tableau de prévision", async () => {
    render(<MemoryRouter><ReturnsForecastPage /></MemoryRouter>)
    expect(await screen.findByText(/estimation statistique/i)).toBeInTheDocument()
    expect(await screen.findByText('2026-09-07')).toBeInTheDocument()
    expect(screen.getByText('8.4%')).toBeInTheDocument()
  })

  it("affiche un message clair si l'historique est insuffisant", async () => {
    const api = (await import('../../../../api/axios')).default
    api.get.mockImplementation((url) => {
      if (url.includes('/orders/stats/returns-forecast/')) {
        return Promise.reject({ response: { status: 400, data: { detail: 'Historique insuffisant pour une prévision fiable (30 jours minimum).' } } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><ReturnsForecastPage /></MemoryRouter>)
    expect(await screen.findByText(/Historique insuffisant/i)).toBeInTheDocument()
  })

  it("change l'horizon via le curseur et relance la requête", async () => {
    const api = (await import('../../../../api/axios')).default
    render(<MemoryRouter><ReturnsForecastPage /></MemoryRouter>)
    await screen.findByText('2026-09-07')
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '30' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('horizon_days=30')))
  })
})
