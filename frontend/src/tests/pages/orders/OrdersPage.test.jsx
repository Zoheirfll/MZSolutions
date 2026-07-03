import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OrdersPage from '../../../pages/orders/OrdersPage'

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
  id: 1, first_name: 'Ali', last_name: 'B', phone: '0555000000', wilaya: 'Alger',
  commune: 'Bab Ezzouar', total: 2500, status: 'pending', status_label: 'En attente', note: '',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>
  )
}

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
  })

  it('shows loading then renders orders list', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [ORDER] } })
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(await screen.findByText('Ali B')).toBeInTheDocument()
    expect(screen.getByText('0555000000')).toBeInTheDocument()
  })

  it('shows empty state when there are no orders', async () => {
    renderPage()
    expect(await screen.findByText('Aucune commande trouvée')).toBeInTheDocument()
  })

  it('filters by search term and refetches', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { count: 1, results: [ORDER] } })
    renderPage()
    await screen.findByText('Ali B')

    await user.type(screen.getByPlaceholderText('Recherche nom, téléphone…'), 'Ali')

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('search=Ali')))
  })

  it('handles server error gracefully and shows empty state', async () => {
    api.get.mockRejectedValue({ response: { status: 500 } })
    renderPage()
    expect(await screen.findByText('Aucune commande trouvée')).toBeInTheDocument()
  })
})
