import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ScheduledOrdersPage from '../../../pages/orders/ScheduledOrdersPage'

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

const SCHEDULED_ORDER = {
  id: 42, first_name: 'Sami', last_name: 'K', phone: '0555111222', wilaya: 'Alger',
  total: 3600, status: 'scheduled', status_label: 'Programmée',
  scheduled_at: '2026-08-01T10:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ScheduledOrdersPage />
    </MemoryRouter>
  )
}

describe('ScheduledOrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
  })

  it('renders the list of scheduled orders', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [SCHEDULED_ORDER] } })
    renderPage()
    expect(await screen.findByText('Sami K')).toBeInTheDocument()
    expect(screen.getByText('0555111222')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=scheduled'))
  })

  it('shows an empty state when there are none', async () => {
    renderPage()
    expect(await screen.findByText('Aucune commande programmée')).toBeInTheDocument()
  })

  it('sends the order now via the status endpoint', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [SCHEDULED_ORDER] } })
    api.post.mockResolvedValue({ data: {} })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Sami K')
    await user.click(screen.getByText('Envoyer maintenant'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/42/status/', { status: 'pending' }))
  })

  it('cancels (deletes) a scheduled order after confirmation', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [SCHEDULED_ORDER] } })
    api.delete.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Sami K')
    await user.click(screen.getByText('Annuler'))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/orders/42/'))
  })

  it('edits the scheduled date via the modal', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [SCHEDULED_ORDER] } })
    api.put.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Sami K')
    await user.click(screen.getByText('Modifier'))
    expect(await screen.findByText("Modifier la date d'envoi")).toBeInTheDocument()
  })
})
