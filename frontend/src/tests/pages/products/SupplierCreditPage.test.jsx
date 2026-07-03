import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SupplierCreditPage from '../../../pages/products/SupplierCreditPage'

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
      <SupplierCreditPage />
    </MemoryRouter>
  )
}

const SUPPLIERS = [{ id: 1, first_name: 'Karim', last_name: 'B.' }]
const CREDITS = [
  { id: 1, supplier: 1, supplier_name: 'Karim B.', amount: 5000, note: 'Avance', date: '2026-01-01' },
]

describe('SupplierCreditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the credit list and total once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.resolve({ data: SUPPLIERS })
      if (url.startsWith('/products/supplier-credits/')) return Promise.resolve({ data: CREDITS })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Karim B.')).toBeInTheDocument()
    expect(screen.getAllByText('5 000 DZD').length).toBeGreaterThan(0)
  })

  it('filters credits by selected supplier', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.resolve({ data: SUPPLIERS })
      if (url.startsWith('/products/supplier-credits/')) return Promise.resolve({ data: CREDITS })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await screen.findByText('Karim B.')

    await user.click(screen.getByText('Tous les fournisseurs'))
    await user.click(await screen.findByRole('button', { name: 'Karim B.' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/products/supplier-credits/?supplier=1'))
  })

  it('shows empty message when the server call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.resolve({ data: SUPPLIERS })
      if (url.startsWith('/products/supplier-credits/')) return Promise.reject(new Error('boom'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucun crédit enregistré.')).toBeInTheDocument()
  })
})
