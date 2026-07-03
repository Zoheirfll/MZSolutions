import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DropshipperMyEarningsPage from '../../../pages/dropshipping/DropshipperMyEarningsPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'dropshipper', team_member_id: 7, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <DropshipperMyEarningsPage />
    </MemoryRouter>
  )
}

const DETAIL = {
  total_earned: 10000, total_paid: 4000, balance: 6000,
  entries: [{ id: 1, order_id: 42, product_name: 'T-shirt', amount: 500, created_at: '2026-01-01T00:00:00Z' }],
  payments: [{ id: 1, amount: 4000, note: 'Virement', paid_at: '2026-01-02T00:00:00Z' }],
}

describe('DropshipperMyEarningsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders own balance and history once loaded', async () => {
    api.get.mockResolvedValue({ data: DETAIL })
    renderPage()
    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText('Virement')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/dropshipping/dropshippers/7/')
  })

  it('shows empty-state messages when there is no history', async () => {
    api.get.mockResolvedValue({ data: { total_earned: 0, total_paid: 0, balance: 0, entries: [], payments: [] } })
    renderPage()
    expect(await screen.findByText(/Aucune commission calculée pour l'instant/)).toBeInTheDocument()
    expect(screen.getByText('Aucun paiement reçu pour l\'instant.')).toBeInTheDocument()
  })

  it('shows a zero balance without crashing when there is nothing owed', async () => {
    api.get.mockResolvedValue({ data: { total_earned: 0, total_paid: 0, balance: 0, entries: [], payments: [] } })
    renderPage()
    expect(await screen.findByText('Solde à recevoir')).toBeInTheDocument()
    expect(screen.getAllByText('0 DZD').length).toBeGreaterThan(0)
  })
})
