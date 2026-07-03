import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MarketingPixelsPage from '../../pages/MarketingPixelsPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { store_slug: 'ma-boutique', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../../api/axios'

const PIXELS = [
  { id: 1, pixel_type: 'facebook', pixel_id: '1234567890', label: 'Compte principal', created_at: '2026-07-01T10:00:00Z' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <MarketingPixelsPage />
    </MemoryRouter>
  )
}

describe('MarketingPixelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the pixel list for the active tab once loaded', async () => {
    api.get.mockResolvedValue({ data: PIXELS })
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('1234567890')).toBeInTheDocument()
    expect(screen.getByText('Compte principal')).toBeInTheDocument()
  })

  it('adds a new pixel via the modal', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: [] })
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText("Aucun pixel configuré pour l'instant.")
    await user.click(screen.getByText('+ Ajouter'))
    await user.type(screen.getByPlaceholderText('Ex : 1234567890123456'), '999888777')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/me/pixels/', {
      pixel_type: 'facebook', pixel_id: '999888777', label: '',
    }))
  })

  it('handles a server error while loading gracefully', async () => {
    api.get.mockRejectedValue(new Error('boom'))
    renderPage()

    await waitFor(() => expect(screen.queryByText('Chargement…')).not.toBeInTheDocument())
    expect(screen.getByText("Aucun pixel configuré pour l'instant.")).toBeInTheDocument()
  })
})
