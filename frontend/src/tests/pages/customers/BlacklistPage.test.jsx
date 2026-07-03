import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BlacklistPage from '../../../pages/customers/BlacklistPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <BlacklistPage />
    </MemoryRouter>
  )
}

const ENTRY = {
  id: 1, phone: '0555000000', message: 'Client problématique',
  blocked_attempts: 2, last_attempt_at: '2026-01-05T10:00:00Z', created_at: '2026-01-01T00:00:00Z',
}

describe('BlacklistPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
  })

  it('renders the blocked numbers list once loaded', async () => {
    api.get.mockResolvedValue({ data: [ENTRY] })
    renderPage()
    expect(await screen.findByText('0555000000')).toBeInTheDocument()
    expect(screen.getByText('Client problématique')).toBeInTheDocument()
    expect(screen.getByText('1 numéro bloqué')).toBeInTheDocument()
  })

  it('opens modal and blocks a new phone number', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: [] })
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('Aucun numéro bloqué')
    await user.click(screen.getByRole('button', { name: /Ajouter/ }))

    await user.type(screen.getByPlaceholderText('Entrez un numéro de téléphone à bloquer'), '0666111222')
    await user.click(screen.getByRole('button', { name: /Bloquer/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/blacklist/', {
      phone: '0666111222', message: '',
    }))
  })

  it('shows a server-side field error when blocking fails', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: [] })
    api.post.mockRejectedValueOnce({ response: { data: { phone: 'Numéro déjà bloqué.' } } })
    renderPage()

    await screen.findByText('Aucun numéro bloqué')
    await user.click(screen.getByRole('button', { name: /Ajouter/ }))
    await user.type(screen.getByPlaceholderText('Entrez un numéro de téléphone à bloquer'), '0666111222')
    await user.click(screen.getByRole('button', { name: /Bloquer/ }))

    expect(await screen.findByText('Numéro déjà bloqué.')).toBeInTheDocument()
  })
})
