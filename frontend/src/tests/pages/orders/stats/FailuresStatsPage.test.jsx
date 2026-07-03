import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FailuresStatsPage from '../../../../pages/orders/stats/FailuresStatsPage'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../../api/axios'

const FAILURES_DATA = {
  total: 8,
  by_reason: [
    { reason_id: 1, label: 'Ne répond pas', count: 5, percentage: 62.5 },
    { reason_id: 2, label: 'Numéro erroné', count: 3, percentage: 37.5 },
  ],
}

function mockLayoutDefaults() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/stats/failures/')) {
      return Promise.resolve({ data: FAILURES_DATA })
    }
    return Promise.resolve({ data: { count: 0 } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FailuresStatsPage />
    </MemoryRouter>
  )
}

describe('FailuresStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLayoutDefaults()
  })

  it('shows a spinner then renders the failure reasons table', async () => {
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText("8 tentatives d'appel en échec sur la période.")).toBeInTheDocument()
    expect(screen.getByText('Ne répond pas')).toBeInTheDocument()
    expect(screen.getByText('Numéro erroné')).toBeInTheDocument()
  })

  it('refetches with the expected query string when the period filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Ne répond pas')

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/failures/?period=week'))

    await user.click(screen.getByRole('button', { name: '30 derniers jours' }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/failures/?period=month'))
    })
  })

  it('shows the empty state row when there are no failures', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/failures/')) {
        return Promise.resolve({ data: { total: 0, by_reason: [] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucun échec sur cette période.')).toBeInTheDocument()
  })

  it('handles a server error gracefully without crashing (stays in the spinner state)', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/stats/failures/')) {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/orders/stats/failures/')))
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })
})
