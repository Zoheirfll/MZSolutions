import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SubscriptionPage from '../../pages/SubscriptionPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../api/axios'

const PLANS = [
  { id: 1, name: 'Starter', price_monthly: 1500, price_yearly: 15000, orders_limit: 300, features: ['300 commandes'] },
  { id: 2, name: 'Pro', price_monthly: 4500, price_yearly: 45000, orders_limit: 1000, features: ['1000 commandes'] },
]
const QUOTA_TRIAL = { plan: null, orders_remaining: 40, orders_limit: 50, trial_ends_at: '2026-08-01T00:00:00Z' }

function renderPage() {
  return render(
    <MemoryRouter>
      <SubscriptionPage />
    </MemoryRouter>
  )
}

describe('SubscriptionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete window.location
    window.location = { href: '' }
  })

  it('renders plans and trial quota banner once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/plans/') return Promise.resolve({ data: PLANS })
      if (url === '/stores/me/quota/') return Promise.resolve({ data: QUOTA_TRIAL })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()

    expect(await screen.findByText('Starter')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.getByText(/Essai gratuit/)).toBeInTheDocument()
  })

  it('subscribes to a plan and redirects to the Chargily payment url', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/stores/plans/') return Promise.resolve({ data: PLANS })
      if (url === '/stores/me/quota/') return Promise.resolve({ data: QUOTA_TRIAL })
      return Promise.resolve({ data: {} })
    })
    api.post.mockResolvedValueOnce({ data: { payment_url: 'https://pay.chargily.net/checkout/xyz' } })
    renderPage()

    await screen.findByText('Starter')
    const buttons = screen.getAllByText('Commencer')
    await user.click(buttons[0])

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/me/subscribe/', { plan_id: 1, billing_cycle: 'monthly' }))
    await waitFor(() => expect(window.location.href).toBe('https://pay.chargily.net/checkout/xyz'))
  })

  it('shows an error message if the subscribe call fails', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/stores/plans/') return Promise.resolve({ data: PLANS })
      if (url === '/stores/me/quota/') return Promise.resolve({ data: QUOTA_TRIAL })
      return Promise.resolve({ data: {} })
    })
    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Paiement indisponible.' } } })
    renderPage()

    await screen.findByText('Starter')
    const buttons = screen.getAllByText('Commencer')
    await user.click(buttons[0])

    expect(await screen.findByText('Paiement indisponible.')).toBeInTheDocument()
  })
})
