import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DropshipperDetailPage from '../../../pages/dropshipping/DropshipperDetailPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: '7' }) }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <DropshipperDetailPage />
    </MemoryRouter>
  )
}

const DETAIL = {
  id: 7, first_name: 'Sara', last_name: 'K',
  total_earned: 10000, total_paid: 4000, balance: 6000,
  entries: [{ id: 1, order_id: 42, product_name: 'T-shirt', amount: 500, created_at: '2026-01-01T00:00:00Z' }],
  payments: [],
}
const PRODUCTS = [{ id: 1, product: 5, product_name: 'T-shirt', product_price: 1500 }]
const COMMISSIONS = []

function mockGet() {
  api.get.mockImplementation((url) => {
    if (url === '/dropshipping/dropshippers/7/') return Promise.resolve({ data: DETAIL })
    if (url.startsWith('/dropshipping/products/')) return Promise.resolve({ data: PRODUCTS })
    if (url.startsWith('/dropshipping/commissions/')) return Promise.resolve({ data: COMMISSIONS })
    return Promise.resolve({ data: {} })
  })
}

describe('DropshipperDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
  })

  it('renders dropshipper balance and history once loaded', async () => {
    mockGet()
    renderPage()
    expect((await screen.findAllByText('6 000 DZD')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('T-shirt').length).toBeGreaterThan(0)
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('pays the current balance', async () => {
    const user = userEvent.setup()
    mockGet()
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findAllByText('6 000 DZD')
    await user.click(screen.getByRole('button', { name: /Marquer.*comme payé/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dropshipping/dropshippers/7/pay/', { note: '' }))
  })

  it('shows an alert when the payment fails', async () => {
    const user = userEvent.setup()
    mockGet()
    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Erreur paiement.' } } })
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderPage()

    await screen.findAllByText('6 000 DZD')
    await user.click(screen.getByRole('button', { name: /Marquer.*comme payé/ }))

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Erreur paiement.'))
    alertSpy.mockRestore()
  })
})
