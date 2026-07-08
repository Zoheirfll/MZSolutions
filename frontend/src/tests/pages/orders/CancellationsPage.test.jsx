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

  it('opens a modal to confirm a cancellation, then posts the new status with the note', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { count: 1, results: [ORDER] } })
    api.post.mockResolvedValueOnce({ data: {} })
    renderPage('requests')
    await screen.findByText('Sara K')

    await user.click(screen.getByText('Confirmer'))
    expect(await screen.findByRole('heading', { name: "Confirmer l'annulation" })).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/remboursement effectué/), 'Remboursé par virement')
    await user.click(screen.getByRole('button', { name: "Confirmer l'annulation" }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/5/status/', { status: 'cancelled', note: 'Remboursé par virement' }))
  })

  it('opens a modal to reject a cancellation request, restoring the prior status server-side', async () => {
    const user = userEvent.setup()
    const orderWithReason = { ...ORDER, cancellation_note: 'Le client a changé d’avis' }
    api.get.mockResolvedValue({ data: { count: 1, results: [orderWithReason] } })
    api.post.mockResolvedValueOnce({ data: {} })
    renderPage('requests')
    await screen.findByText('Sara K')

    await user.click(screen.getByText('Rejeter'))
    expect(await screen.findByText("Rejeter la demande d'annulation")).toBeInTheDocument()
    expect(screen.getByText(/Motif de la demande : Le client a changé d’avis/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rejeter la demande' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/5/reject-cancellation/', { note: '' }))
  })

  it('shows the cancellation reason column when present', async () => {
    const orderWithReason = { ...ORDER, cancellation_note: 'Prix trop élevé' }
    api.get.mockResolvedValue({ data: { count: 1, results: [orderWithReason] } })
    renderPage('requests')
    expect(await screen.findByText('Prix trop élevé')).toBeInTheDocument()
  })

  it('includes the search term in the orders request', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
    renderPage('requests')
    await user.type(screen.getByPlaceholderText('Recherche nom, téléphone…'), 'Sara')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('search=Sara')))
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
