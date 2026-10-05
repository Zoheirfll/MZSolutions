import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminSearchPage from '../../../pages/platform-admin/PlatformAdminSearchPage'
import PlatformAdminAccountDetailPage from '../../../pages/platform-admin/PlatformAdminAccountDetailPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
const refresh = vi.fn().mockResolvedValue({})
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, platform_level: 'admin' }, refresh }) }))
import api from '../../../api/axios'

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); refresh.mockClear() })

describe('PlatformAdminSearchPage', () => {
  const RESULT = {
    stores: [{ id: 7, name: 'Alpha', slug: 'alpha', owner_email: 'o@alpha.dz', is_active: true }], users: [],
    orders: [{ id: 42, store_id: 7, store_name: 'Alpha', customer: 'Karim Benali', phone: '0661234567', status: 'pending', total: 4500, tracking: 'TRK-1', created_at: '2026-10-01T10:00:00Z' }],
    products: [],
  }

  it('does not call the API under 3 characters', async () => {
    render(<MemoryRouter initialEntries={['/?q=ab']}><PlatformAdminSearchPage /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 50))
    expect(api.get).not.toHaveBeenCalled()
    expect(screen.getByText(/au moins 3 caractères/i)).toBeInTheDocument()
  })

  it('shows grouped results with a link to the store', async () => {
    api.get.mockResolvedValue({ data: RESULT })
    render(<MemoryRouter initialEntries={['/?q=Karim']}><PlatformAdminSearchPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Karim Benali/)).toBeInTheDocument())
    expect(api.get).toHaveBeenCalledWith('/platform-admin/search/', { params: { q: 'Karim' } })
    expect(screen.getByText('Boutiques')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/plateforme/comptes/7')
  })

  it('says when nothing matches', async () => {
    api.get.mockResolvedValue({ data: { stores: [], users: [], orders: [], products: [] } })
    render(<MemoryRouter initialEntries={['/?q=zzzzz']}><PlatformAdminSearchPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Aucun résultat.')).toBeInTheDocument())
  })
})

describe('Read-only view from the account page', () => {
  const DETAIL = {
    id: 7, name: 'Alpha', slug: 'alpha', owner_email: 'o@alpha.dz', owner_name: 'Omar', created_at: '2026-09-01T10:00:00Z', is_active: true, state: 'trial',
    plan_name: null, orders_used: 1, orders_limit: 50, phone: '', email: '', suspended_at: null, suspension_reason: '',
    owner: { id: 9, email: 'o@alpha.dz', first_name: 'Omar', last_name: 'A', phone: '', last_login: null, date_joined: '2026-09-01T10:00:00Z' },
    quota: { orders_used: 1, orders_limit: 50, trial_ends_at: null, period_end: null, plan: null, billing_cycle: '' },
    counts: { orders: 1, products: 1, team_members: 0 }, recent_payments: [],
  }

  it('requires a reason, then opens the dashboard after refreshing the profile', async () => {
    api.get.mockResolvedValue({ data: DETAIL })
    api.post.mockResolvedValue({ data: {} })
    render(
      <MemoryRouter initialEntries={['/c/7']}><Routes>
        <Route path="/c/:storeId" element={<PlatformAdminAccountDetailPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes></MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Voir le dashboard (lecture seule)' }))
    const open = screen.getByRole('button', { name: 'Ouvrir' })
    expect(open).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/motif \(obligatoire\)/i), { target: { value: 'Dépannage demandé' } })
    fireEvent.click(open)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/accounts/7/view-as/', { reason: 'Dépannage demandé' }))
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument())
    expect(refresh).toHaveBeenCalled()
  })
})
