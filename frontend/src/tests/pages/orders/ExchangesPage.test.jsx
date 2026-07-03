import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ExchangesPage from '../../../pages/orders/ExchangesPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <ExchangesPage />
    </MemoryRouter>
  )
}

describe('ExchangesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
  })

  it('renders the exchange list', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/exchanges/')) {
        return Promise.resolve({ data: {
          results: [{ id: 5, order_display: '#45', order_phone: '0555000000', original_product: 'T-shirt — M', replacement_value: 'L', status: 'open', status_label: 'En attente', created_at: '2026-07-01T10:00:00Z' }],
          count: 1, page: 1, per_page: 10,
        } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('T-shirt — M')).toBeInTheDocument()
    expect(screen.getAllByText('En attente').length).toBeGreaterThan(0)
  })

  it('shows an empty state when there are no exchanges', async () => {
    renderPage()
    expect(await screen.findByText("Aucune demande d'échange")).toBeInTheDocument()
  })

  it('filters by status and navigates to the detail page on row click', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/exchanges/')) {
        return Promise.resolve({ data: {
          results: [{ id: 7, order_display: '#9', order_phone: '0666', original_product: 'Mug', replacement_value: 'Bleu', status: 'approved', status_label: 'Approuvé', created_at: '2026-07-01T10:00:00Z' }],
          count: 1, page: 1, per_page: 10,
        } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Approuvées' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=approved')))

    const row = await screen.findByText('Mug')
    await user.click(row)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/echanges/7')
  })
})
