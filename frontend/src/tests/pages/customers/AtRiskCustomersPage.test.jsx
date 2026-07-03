import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AtRiskCustomersPage from '../../../pages/customers/AtRiskCustomersPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <AtRiskCustomersPage />
    </MemoryRouter>
  )
}

const RISKY_CLIENT = {
  phone: '0555000000', first_name: 'Ali', last_name: 'Ben',
  orders_count: 5, risky_count: 3, manual_risk: false,
}

function mockGet() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/clients/')) return Promise.resolve({ data: { results: [RISKY_CLIENT] } })
    if (url === '/stores/me/settings/') return Promise.resolve({ data: { risk_threshold_orders: 3, risk_period_days: 90 } })
    return Promise.resolve({ data: {} })
  })
}

describe('AtRiskCustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders at-risk clients and settings once loaded', async () => {
    mockGet()
    renderPage()
    expect(await screen.findByText('Ali Ben')).toBeInTheDocument()
    expect(screen.getByText('1 client à risque')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('90')).toBeInTheDocument()
  })

  it('toggles manual risk flag for a client', async () => {
    const user = userEvent.setup()
    mockGet()
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('Ali Ben')
    await user.click(screen.getByRole('button', { name: 'Marquer manuellement' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/clients/0555000000/risk/', {}))
  })

  it('handles a failing settings save gracefully', async () => {
    const user = userEvent.setup()
    mockGet()
    api.put.mockRejectedValueOnce(new Error('server error'))
    renderPage()

    await screen.findByText('Ali Ben')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    // Page remains functional, no crash
    expect(screen.getByText('Ali Ben')).toBeInTheDocument()
  })
})
