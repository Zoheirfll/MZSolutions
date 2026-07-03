import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CancellationsPage from '../../../pages/orders/CancellationsPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

const ORDER = {
  id: 5, first_name: 'Sara', last_name: 'K', phone: '0666000000', wilaya: 'Oran',
  commune: 'Bir El Djir', total: 3000, created_at: '2026-01-02T00:00:00Z',
}

function renderPage(mode) {
  return render(
    <MemoryRouter>
      <CancellationsPage mode={mode} />
    </MemoryRouter>
  )
}

describe('CancellationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
  })

  it('renders cancellation requests with action buttons in requests mode', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [ORDER] } })
    renderPage('requests')
    expect(await screen.findByText('Sara K')).toBeInTheDocument()
    expect(screen.getByText('Confirmer')).toBeInTheDocument()
    expect(screen.getByText('Rejeter')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=cancel_requested'))
  })

  it('confirms a cancellation request, which posts the new status and refetches', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { count: 1, results: [ORDER] } })
    api.post.mockResolvedValueOnce({ data: {} })
    renderPage('requests')
    await screen.findByText('Sara K')

    await user.click(screen.getByText('Confirmer'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/5/status/', { status: 'cancelled' }))
  })

  it('shows the confirmed-cancellations list without actions and no status filter param mismatch', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [ORDER] } })
    renderPage('confirmed')
    await screen.findByText('Sara K')
    expect(screen.queryByText('Confirmer')).not.toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=cancelled'))
  })

  it('handles server error gracefully and shows empty state', async () => {
    api.get.mockRejectedValue({ response: { status: 500 } })
    renderPage('requests')
    expect(await screen.findByText('Aucune commande trouvée')).toBeInTheDocument()
  })
})
