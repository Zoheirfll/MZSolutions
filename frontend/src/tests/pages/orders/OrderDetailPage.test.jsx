import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OrderDetailPage from '../../../pages/orders/OrderDetailPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: '1' }) }
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
  commune: 'Bab Ezzouar', total: 2500, subtotal: 2000, shipping_cost: 500,
  status: 'pending', status_label: 'En attente', note: '',
  delivery_type: 'Domicile', payment_method_label: 'COD', created_at: '2026-01-01T00:00:00Z',
  items: [{ id: 1, product_name: 'T-shirt', price: 2000, quantity: 1 }],
  history: [], assignment: null,
}

function mockGet(overrides = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/orders/1/') return Promise.resolve({ data: { ...ORDER, ...overrides } })
    if (url === '/team/members/?role=confirmateur') return Promise.resolve({ data: [] })
    if (url === '/stores/me/carriers/') return Promise.resolve({ data: [] })
    return Promise.resolve({ data: {} })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrderDetailPage />
    </MemoryRouter>
  )
}

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading then renders order details', async () => {
    mockGet()
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(await screen.findByText('Ali B')).toBeInTheDocument()
    expect(screen.getByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText('0555000000')).toBeInTheDocument()
  })

  it('changes status and calls the status endpoint', async () => {
    const user = userEvent.setup()
    mockGet()
    api.post.mockResolvedValueOnce({ data: {} })
    renderPage()
    await screen.findByText('Ali B')

    await user.click(screen.getByText('En attente de confirmation'))
    await user.click(await screen.findByText('Confirmée'))

    const applyBtn = screen.getByRole('button', { name: 'Appliquer' })
    await waitFor(() => expect(applyBtn).not.toBeDisabled())
    await user.click(applyBtn)

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/1/status/', expect.objectContaining({ status: 'confirmed' })))
  })

  it('redirects to orders list when the order fails to load', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/orders/1/') return Promise.reject(new Error('not found'))
      return Promise.resolve({ data: [] })
    })
    renderPage()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/commandes'))
  })
})
