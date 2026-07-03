import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import WebhooksPage from '../../pages/WebhooksPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { store_slug: 'ma-boutique', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../../api/axios'

const ENDPOINTS = [
  { id: 1, name: 'Mon ERP', url: 'https://erp.example.com', events: [], is_active: true, consecutive_failures: 0, last_triggered_at: null },
]
const LOGS = [
  { id: 1, direction_label: 'Sortant', endpoint_name: 'Mon ERP', event: 'order.created', status: 'success', status_code: 200, message: 'OK', created_at: '2026-07-01T10:00:00Z' },
]
const INCOMING_KEY = { key: 'abc123' }
const CATALOG = [{ key: 'order.created' }, { key: 'order.confirmed' }]

function mockGet() {
  api.get.mockImplementation((url) => {
    if (url === '/webhooks/endpoints/') return Promise.resolve({ data: ENDPOINTS })
    if (url === '/webhooks/logs/') return Promise.resolve({ data: LOGS })
    if (url === '/webhooks/incoming-key/') return Promise.resolve({ data: INCOMING_KEY })
    if (url === '/webhooks/events/') return Promise.resolve({ data: CATALOG })
    return Promise.resolve({ data: [] })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WebhooksPage />
    </MemoryRouter>
  )
}

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders endpoints, incoming key url and journal once loaded', async () => {
    mockGet()
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect((await screen.findAllByText('Mon ERP')).length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue(/webhooks\/incoming\/abc123\//)).toBeInTheDocument()
    expect(screen.getByText('order.created')).toBeInTheDocument()
  })

  it('toggles an endpoint active state', async () => {
    const user = userEvent.setup()
    mockGet()
    api.put.mockResolvedValueOnce({})
    renderPage()

    await screen.findAllByText('Mon ERP')
    await user.click(screen.getByText('Désactiver'))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/webhooks/endpoints/1/', { is_active: false }))
  })

  it('handles a server error while loading gracefully', async () => {
    api.get.mockRejectedValue(new Error('boom'))
    renderPage()

    await waitFor(() => expect(screen.queryByText('Chargement…')).not.toBeInTheDocument())
    expect(screen.getByText('Aucun endpoint configuré.')).toBeInTheDocument()
  })
})
