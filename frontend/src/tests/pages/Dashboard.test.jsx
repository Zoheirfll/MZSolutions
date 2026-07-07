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
      if (url.startsWith('/orders/stats/global/')) {
        return Promise.resolve({ data: { confirmation_rate: 62.5, revenue: 15000, delivered_count: 8, total_orders: 20, returned_count: 2 } })
      }
      if (url.startsWith('/orders/stats/orders/')) {
        return Promise.resolve({ data: { daily: [{ date: '2026-07-01', count: 3 }] } })
      }
      if (url.startsWith('/orders/stats/wilayas/')) {
        return Promise.resolve({ data: { results: [
          { wilaya: 'Alger', orders_count: 10, confirmed_count: 6, revenue: 8000 },
          { wilaya: 'Oran', orders_count: 4, confirmed_count: 2, revenue: 3000 },
        ] } })
      }
      if (url.startsWith('/orders/stats/sources/')) {
        return Promise.resolve({ data: { results: [
          { source: 'Boutique en ligne', orders_count: 9, confirmed_count: 5, revenue: 7000 },
        ] } })
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
    expect(await screen.findByText('Taux de confirmation')).toBeInTheDocument()
    expect(screen.getByText('63%')).toBeInTheDocument()
    expect(screen.getByText('8 livrées')).toBeInTheDocument()
    expect(screen.queryByText("Chiffre d'affaires")).not.toBeInTheDocument()
    expect(await screen.findByText('Taux de retour')).toBeInTheDocument()
    expect(screen.getByText('2 retours')).toBeInTheDocument()
    expect(await screen.findByText('Commandes par wilaya — 30 derniers jours')).toBeInTheDocument()
    expect(screen.getByText('Alger')).toBeInTheDocument()
    expect(await screen.findByText('Par source de vente — 30 derniers jours')).toBeInTheDocument()
    expect(screen.getByText('Boutique en ligne')).toBeInTheDocument()
  })

  it('shows an error banner without crashing when the core stats endpoint fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/quota/') return Promise.reject(new Error('fail'))
      if (url === '/orders/stats/') return Promise.reject(new Error('fail'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText(/Bonjour,/)).toBeInTheDocument()
    expect(await screen.findByText(/Impossible de charger certaines statistiques/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Commandes restantes')).not.toBeInTheDocument())
    // Stats default to 0 without crashing
    expect(screen.getByText('Commandes réelles')).toBeInTheDocument()
  })

  it('hides the confirmation-rate/revenue KPIs for a role without stats_view permission (403)', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/orders/stats/') return Promise.resolve({ data: { total: 3 } })
      if (url.startsWith('/orders/stats/global/')) return Promise.reject({ response: { status: 403 } })
      if (url.startsWith('/orders/stats/orders/')) return Promise.reject({ response: { status: 403 } })
      if (url === '/orders/?per_page=200') return Promise.resolve({ data: { results: [] } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Commandes réelles')).toBeInTheDocument()
    expect(screen.queryByText('Taux de confirmation')).not.toBeInTheDocument()
    // Falls back to computing the chart from the confirmateur/dropshipper's own visible orders
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/orders/?per_page=200'))
  })
})
