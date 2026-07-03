import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SalesChannelsPage from '../../pages/SalesChannelsPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { store_slug: 'ma-boutique', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../../api/axios'

const CONNECTIONS = [
  { id: 1, channel: 'shopify', shop_url: 'monshop.myshopify.com', last_synced_at: null },
]
const LOGS = [
  { id: 1, channel_label: 'Shopify', direction_label: 'Push', status: 'success', message: 'OK', started_at: '2026-07-01T10:00:00Z' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <SalesChannelsPage />
    </MemoryRouter>
  )
}

describe('SalesChannelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading spinner then renders the connected channel and sync log', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/channels/connections/') return Promise.resolve({ data: CONNECTIONS })
      if (url === '/channels/logs/') return Promise.resolve({ data: LOGS })
      return Promise.resolve({ data: [] })
    })
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('monshop.myshopify.com')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('triggers a push sync for a connected channel', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/channels/connections/') return Promise.resolve({ data: CONNECTIONS })
      if (url === '/channels/logs/') return Promise.resolve({ data: LOGS })
      return Promise.resolve({ data: [] })
    })
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('monshop.myshopify.com')
    await user.click(screen.getByText('Pousser le catalogue'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/channels/connections/1/sync/', { direction: 'push' }))
  })

  it('handles a server error while loading gracefully (empty state, no crash)', async () => {
    api.get.mockRejectedValue(new Error('network error'))
    renderPage()

    await waitFor(() => expect(screen.queryByText('Chargement…')).not.toBeInTheDocument())
    expect(screen.getByText("Aucune synchronisation pour l'instant.")).toBeInTheDocument()
  })
})
