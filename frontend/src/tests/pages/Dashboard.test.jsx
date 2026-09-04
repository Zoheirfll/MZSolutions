import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../../pages/Dashboard'

let mockUser = { first_name: 'Ali', store_slug: 'ma-boutique', team_role: null, permissions: {} }

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
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

const deliveriesPayload = {
  funnel: { total: 20, real: 18, confirmed: 10, confirmed_pct: 55, shipped: 8, shipped_pct: 80 },
  secondary: {
    in_transit: { count: 3, pct: 15 },
    delivered: { count: 8, pct: 40 },
    returned: { count: 2, pct: 10 },
    cancelled: { count: 1, pct: 5 },
  },
  timeseries: [{ date: '2026-07-01', total: 3, real: 3, confirmed: 2, shipped: 1, delivered: 1, returned: 0 }],
  by_wilaya: [{ wilaya: 'Alger', orders_count: 10 }],
  by_source: [
    { source: 'Boutique en ligne', total: 9, real: 8, confirmed_pct: 60, delivered_pct: 40, returned: 1, cancelled: 0 },
  ],
  by_status: [{ status: 'pending', label: 'En attente', count: 4 }],
  deltas: { total: 5 },
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = { first_name: 'Ali', store_slug: 'ma-boutique', team_role: null, permissions: {} }
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the quota banner and the Livraisons tab (default) once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/quota/') {
        return Promise.resolve({ data: {
          orders_used: 10, orders_limit: 50, orders_remaining: 40,
          trial_ends_at: new Date(Date.now() + 5 * 86400000).toISOString(),
          is_trial_active: true,
        } })
      }
      if (url.startsWith('/orders/stats/dashboard/deliveries/')) {
        return Promise.resolve({ data: deliveriesPayload })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText(/Bonjour,/)).toBeInTheDocument()
    expect(screen.getAllByText('Ali').length).toBeGreaterThan(0)
    expect(await screen.findByText('Commandes restantes')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('Essai actif')).toBeInTheDocument()

    // Onglets du tableau de bord
    expect(screen.getByText('Livraisons')).toBeInTheDocument()
    expect(screen.getByText('Revenus')).toBeInTheDocument()
    expect(screen.getByText('Confirmation')).toBeInTheDocument()
    expect(screen.getByText('KPI')).toBeInTheDocument()

    // Contenu de l'onglet Livraisons (par défaut)
    expect(await screen.findByText('Commandes réelles')).toBeInTheDocument()
    expect(screen.getByText('sur 20 total')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Carte des commandes par wilaya' })).toBeInTheDocument()
    expect(screen.getByText('Boutique en ligne')).toBeInTheDocument()
  })

  it('shows the deliveries error fallback without crashing when the dashboard endpoint fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/quota/') return Promise.reject(new Error('fail'))
      if (url.startsWith('/orders/stats/dashboard/deliveries/')) return Promise.reject(new Error('fail'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText(/Bonjour,/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Commandes restantes')).not.toBeInTheDocument())
    expect(await screen.findByText('Impossible de charger les statistiques.')).toBeInTheDocument()
  })

  it('shows the confirmateur-specific dashboard (not the owner analytics tabs) when stats_view is not granted', async () => {
    mockUser = { first_name: 'Sami', store_slug: 'ma-boutique', team_role: 'confirmateur', permissions: { stats_view: false } }
    api.get.mockImplementation((url) => {
      if (url === '/orders/stats/my-summary/') {
        return Promise.resolve({ data: {
          pending: 2, no_answer_1: 1, no_answer_2: 0, no_answer_3: 0,
          confirmed_today: 3, total_active: 5, urgent: [],
        } })
      }
      if (url.startsWith('/orders/stats/dashboard/deliveries/')) {
        return Promise.resolve({ data: deliveriesPayload })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText(/Bonjour,/)).toBeInTheDocument()
    expect(screen.getAllByText('Sami').length).toBeGreaterThan(0)
    expect(await screen.findByText('À traiter (nouvelles)')).toBeInTheDocument()
    // Le confirmateur n'a pas l'onglet "Revenus" (réservé owner/admin/stats_view)
    expect(screen.queryByText('Revenus')).not.toBeInTheDocument()
    expect(screen.queryByText('Commandes restantes')).not.toBeInTheDocument()
  })
})
