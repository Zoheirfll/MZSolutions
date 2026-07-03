import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SupplierPaymentPage from '../../../pages/products/SupplierPaymentPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <SupplierPaymentPage />
    </MemoryRouter>
  )
}

const SUPPLIERS = [{ id: 1, first_name: 'Karim', last_name: 'B.' }]
const PAYMENTS = [
  { id: 1, supplier: 1, supplier_name: 'Karim B.', amount: 3000, note: 'Versement', date: '2026-01-05' },
]

describe('SupplierPaymentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the payment list and total once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.resolve({ data: SUPPLIERS })
      if (url.startsWith('/products/supplier-payments/')) return Promise.resolve({ data: PAYMENTS })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Karim B.')).toBeInTheDocument()
    expect(screen.getAllByText('3 000 DZD').length).toBeGreaterThan(0)
  })

  it('opens the add modal and submits a new payment', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.resolve({ data: SUPPLIERS })
      if (url.startsWith('/products/supplier-payments/')) return Promise.resolve({ data: PAYMENTS })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({})
    renderPage()
    await screen.findByText('Karim B.')

    await user.click(screen.getByText('Ajouter un versement +'))
    await user.click(screen.getByText('Sélectionner un fournisseur'))
    await user.click(await screen.findByRole('button', { name: 'Karim B.' }))
    await user.type(screen.getByPlaceholderText('0'), '1500')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/products/supplier-payments/', expect.objectContaining({
      supplier: 1, amount: '1500',
    })))
  })

  it('shows empty message when the server call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.resolve({ data: SUPPLIERS })
      if (url.startsWith('/products/supplier-payments/')) return Promise.reject(new Error('boom'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucun versement enregistré.')).toBeInTheDocument()
  })
})
