import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ExchangeDetailPage from '../../../pages/orders/ExchangeDetailPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../api/axios'

const EXCHANGE = {
  id: 5, order: 45, order_display: '#45', order_phone: '0555000000',
  original_product: 'T-shirt — M', replacement_value: 'L', status: 'open', status_label: 'En attente',
  reason: 'Trop petit', vendor_note: '', created_at: '2026-07-01T10:00:00Z', stock_movements: [],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/echanges/5']}>
      <Routes>
        <Route path="/dashboard/echanges/:id" element={<ExchangeDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ExchangeDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders exchange details once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/orders/exchanges/5/') return Promise.resolve({ data: EXCHANGE })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('T-shirt — M')).toBeInTheDocument()
    expect(screen.getByText('Trop petit')).toBeInTheDocument()
  })

  it('shows "introuvable" when the exchange fails to load', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/orders/exchanges/5/') return Promise.reject(new Error('404'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('Échange introuvable.')).toBeInTheDocument()
  })

  it('approves the exchange and refreshes the data', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/orders/exchanges/5/') return Promise.resolve({ data: EXCHANGE })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({ data: { ...EXCHANGE, status: 'approved', status_label: 'Approuvé' } })
    renderPage()

    await screen.findByText('T-shirt — M')
    await user.click(screen.getByRole('button', { name: 'En attente' }))
    await user.click(await screen.findByRole('button', { name: 'Approuvé' }))
    await user.click(screen.getByRole('button', { name: 'Appliquer' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/exchanges/5/status/', { status: 'approved', note: '' }))
  })
})
