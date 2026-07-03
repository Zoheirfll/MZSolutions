import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../../pages/Dashboard'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { first_name: 'Ali', store_slug: 'ma-boutique', team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}))
import api from '../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  )
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the quota banner and stats once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/quota/') {
        return Promise.resolve({ data: {
          orders_used: 10, orders_limit: 50, orders_remaining: 40,
          trial_ends_at: new Date(Date.now() + 5 * 86400000).toISOString(),
          is_trial_active: true,
        } })
      }
      if (url === '/orders/stats/') {
        return Promise.resolve({ data: { total: 12, confirmed: { count: 5 }, pending: { count: 2 } } })
      }
      if (url === '/orders/?per_page=200') {
        return Promise.resolve({ data: { results: [] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText(/Bonjour,/)).toBeInTheDocument()
    expect(screen.getAllByText('Ali').length).toBeGreaterThan(0)
    expect(await screen.findByText('Commandes restantes')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('Essai actif')).toBeInTheDocument()
    expect(screen.getByText('Commandes réelles')).toBeInTheDocument()
  })

  it('renders without the quota banner and without crashing when stats/orders fail', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/quota/') return Promise.reject(new Error('fail'))
      if (url === '/orders/stats/') return Promise.reject(new Error('fail'))
      if (url === '/orders/?per_page=200') return Promise.reject(new Error('fail'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText(/Bonjour,/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Commandes restantes')).not.toBeInTheDocument())
    // Stats default to 0 without crashing
    expect(screen.getByText('Commandes réelles')).toBeInTheDocument()
  })
})
