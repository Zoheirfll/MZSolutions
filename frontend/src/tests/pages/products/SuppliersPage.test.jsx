import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SuppliersPage from '../../../pages/products/SuppliersPage'

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
      <SuppliersPage />
    </MemoryRouter>
  )
}

const SUPPLIERS = [
  { id: 1, first_name: 'Karim', last_name: 'B.', email: 'karim@test.dz', phone: '0555', balance: 1000, created_at: '2026-01-01T00:00:00Z' },
]

describe('SuppliersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the supplier list once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.resolve({ data: SUPPLIERS })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Karim')).toBeInTheDocument()
    expect(screen.getByText('karim@test.dz')).toBeInTheDocument()
  })

  it('creates a new supplier via the modal', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.resolve({ data: SUPPLIERS })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({})
    renderPage()
    await screen.findByText('Karim')

    await user.click(screen.getByText('Ajouter un fournisseur'))
    await user.type(screen.getByPlaceholderText('Prénom'), 'Yacine')
    await user.type(screen.getByPlaceholderText('Nom'), 'Z.')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/products/suppliers/', expect.objectContaining({
      first_name: 'Yacine', last_name: 'Z.',
    })))
  })

  it('shows empty state when the server call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/suppliers/') return Promise.reject(new Error('boom'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucun fournisseur')).toBeInTheDocument()
  })
})
