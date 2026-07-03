import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ComplaintsPage from '../../../pages/orders/ComplaintsPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../api/axios'

const COMPLAINT = {
  id: 7, order_display: '#42', order_phone: '0555111222', subject: 'Article endommagé',
  messages_count: 2, status: 'open', status_label: 'Ouverte', created_at: '2026-07-01T10:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ComplaintsPage />
    </MemoryRouter>
  )
}

describe('ComplaintsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
  })

  it('renders loading then the list of complaints', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [COMPLAINT] } })
    renderPage()
    expect(await screen.findByText('Article endommagé')).toBeInTheDocument()
    expect(screen.getByText('Ouverte')).toBeInTheDocument()
  })

  it('filters by status when clicking a filter tab', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { count: 1, results: [COMPLAINT] } })
    renderPage()
    await screen.findByText('Article endommagé')

    await user.click(screen.getByText('Résolues'))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=resolved')))
  })

  it('shows empty state on server error', async () => {
    api.get.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText('Aucune réclamation')).toBeInTheDocument()
  })
})
