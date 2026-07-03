import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FailureReasonsPage from '../../../pages/orders/FailureReasonsPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

const REASON = { id: 1, label: 'Numéro invalide', is_active: true, order: 0 }

function renderPage() {
  return render(
    <MemoryRouter>
      <FailureReasonsPage />
    </MemoryRouter>
  )
}

describe('FailureReasonsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: [] })
  })

  it('renders loading then the list of reasons', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/orders/failure-reasons/') return Promise.resolve({ data: [REASON] })
      return Promise.resolve({ data: [] })
    })
    renderPage()
    expect(await screen.findByText('Numéro invalide')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('creates a new reason via the modal form', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/orders/failure-reasons/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
    api.post.mockResolvedValueOnce({ data: {} })
    renderPage()

    await screen.findByText('Aucune raison définie')
    await user.click(screen.getByText('Ajouter une raison'))
    await user.type(screen.getByPlaceholderText('ex: Numéro invalide'), 'Client injoignable')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/failure-reasons/', expect.objectContaining({ label: 'Client injoignable' })))
  })

  it('shows server-side validation errors without closing the modal', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/orders/failure-reasons/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
    api.post.mockRejectedValueOnce({ response: { data: { label: 'Ce libellé existe déjà.' } } })
    renderPage()

    await screen.findByText('Aucune raison définie')
    await user.click(screen.getByText('Ajouter une raison'))
    await user.type(screen.getByPlaceholderText('ex: Numéro invalide'), 'Dupliqué')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    expect(await screen.findByText('Ce libellé existe déjà.')).toBeInTheDocument()
  })
})
