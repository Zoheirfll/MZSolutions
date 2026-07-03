import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ParametresLivraisonPage from '../../pages/ParametresLivraisonPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../../api/axios'

const ACCOUNTS = [
  { id: 1, carrier: 'yalidine', carrier_label: 'Yalidine', name: 'Ma Yalidine', departure_wilaya: 'Alger', is_active: true, is_default: true, api_id: 'ID123', api_token_masked: '****abcd', created_at: '2026-07-01T10:00:00Z' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <ParametresLivraisonPage />
    </MemoryRouter>
  )
}

describe('ParametresLivraisonPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders connected carriers on the "Sociétés de livraison" tab once loaded', async () => {
    api.get.mockResolvedValue({ data: ACCOUNTS })
    renderPage()

    expect(await screen.findByText('Yalidine')).toBeInTheDocument()
    expect(screen.getByText('Connecté')).toBeInTheDocument()
    expect(screen.getByText('ZR Express')).toBeInTheDocument()
  })

  it('switches to the "Mes Sociétés de livraison" tab and shows account details', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: ACCOUNTS })
    renderPage()

    await screen.findByText('Yalidine')
    await user.click(screen.getByText('Mes Sociétés de livraison'))

    expect(await screen.findByText('Ma Yalidine')).toBeInTheDocument()
    expect(screen.getByText('ID123')).toBeInTheDocument()
    expect(screen.getByText('Par défaut')).toBeInTheDocument()
  })

  it('handles a server error while loading gracefully (empty connected list)', async () => {
    api.get.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText('Yalidine')).toBeInTheDocument())
    await user.click(screen.getByText('Mes Sociétés de livraison'))

    expect(await screen.findByText('Aucun transporteur connecté pour l\'instant.')).toBeInTheDocument()
  })
})
