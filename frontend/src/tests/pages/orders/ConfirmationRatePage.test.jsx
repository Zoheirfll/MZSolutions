import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ConfirmationRatePage from '../../../pages/orders/ConfirmationRatePage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../api/axios'

const STATS = {
  confirmation_rate: 75, total_processed: 20, total_confirmed: 15,
  no_answer_total: 3, returned_total: 1, cancelled_total: 1, previous_rate: 60,
  date_from: '2026-06-27', date_to: '2026-07-03',
  daily: [{ date: '2026-07-01', processed: 5, confirmed: 4, rate: 80 }],
  by_status: [{ status: 'confirmed', label: 'Confirmée', count: 15 }],
  by_confirmateur: [{ confirmateur_id: 1, confirmateur_name: 'Yacine', processed: 10, confirmed: 8, no_answer: 1, returned: 0, cancelled: 1, rate: 80 }],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmationRatePage />
    </MemoryRouter>
  )
}

describe('ConfirmationRatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: {} })
  })

  it('renders the confirmation rate stats once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/confirmation/')) return Promise.resolve({ data: STATS })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(await screen.findByText('75%')).toBeInTheDocument()
    expect(screen.getByText('Yacine')).toBeInTheDocument()
  })

  it('switches period filter and refetches with the new period', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/confirmation/')) return Promise.resolve({ data: STATS })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    await screen.findByText('75%')

    await user.click(screen.getByText("Aujourd'hui"))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('period=day')))
  })

  it('shows an error message when the stats request fails', async () => {
    api.get.mockRejectedValue(new Error('network error'))
    renderPage()
    expect(await screen.findByText('Erreur de chargement.')).toBeInTheDocument()
  })

  it('shows the trend delta and breakdown columns', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/confirmation/')) return Promise.resolve({ data: STATS })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    await screen.findByText('75%')
    expect(screen.getByText(/vs période précédente \(60%\)/)).toBeInTheDocument()
    expect(screen.getByText('Non joignable')).toBeInTheDocument()
    expect(screen.getByText('Retournées')).toBeInTheDocument()
  })
})
