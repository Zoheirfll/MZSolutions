import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminPaymentsPage from '../../../pages/platform-admin/PlatformAdminPaymentsPage'
import PlatformAdminPlansPage from '../../../pages/platform-admin/PlatformAdminPlansPage'
import PlatformAdminAccountDetailPage from '../../../pages/platform-admin/PlatformAdminAccountDetailPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const auth = { user: { id: 1, platform_level: 'superadmin' } }
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }))
import api from '../../../api/axios'

const PAYMENTS = {
  count: 2, summary: { collected: 4500, refunded: 0, success_count: 1 },
  results: [
    { id: 1, store_id: 7, store_name: 'Boutique Alpha', owner_email: 'o@alpha.dz', plan: 'Pro', billing_cycle: 'monthly', amount: 4500, status: 'success', transaction_id: 't1', created_at: '2026-10-01T10:00:00Z', refunded_at: null, refund_reason: '' },
    { id: 2, store_id: 8, store_name: 'Boutique Beta', owner_email: 'o@beta.dz', plan: 'Starter', billing_cycle: 'yearly', amount: 1500, status: 'failed', transaction_id: 't2', created_at: '2026-10-02T10:00:00Z', refunded_at: null, refund_reason: '' },
  ],
}
const PLANS = { results: [
  { id: 1, name: 'Pro', orders_limit: 1000, price_monthly: 4500, price_yearly: 45000, features: ['Support'], is_active: true, order: 1, subscribers: 3 },
  { id: 2, name: 'Business', orders_limit: null, price_monthly: 9000, price_yearly: 90000, features: [], is_active: false, order: 2, subscribers: 0 },
] }

const wrap = (el) => render(<MemoryRouter>{el}</MemoryRouter>)

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.put.mockReset()
  auth.user = { id: 1, platform_level: 'superadmin' }
})

describe('PlatformAdminPaymentsPage', () => {
  it('lists payments with summary', async () => {
    api.get.mockResolvedValue({ data: PAYMENTS })
    wrap(<PlatformAdminPaymentsPage />)
    await waitFor(() => expect(screen.getByText('Boutique Alpha')).toBeInTheDocument())
    expect(screen.getByText('Payé')).toBeInTheDocument()
    expect(screen.getByText('Échoué')).toBeInTheDocument()
  })

  it('offers refund only on confirmed payments, with a mandatory reason', async () => {
    api.get.mockResolvedValue({ data: PAYMENTS })
    wrap(<PlatformAdminPaymentsPage />)
    await waitFor(() => expect(screen.getByText('Boutique Alpha')).toBeInTheDocument())
    const buttons = screen.getAllByRole('button', { name: 'Rembourser' })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    const confirm = screen.getByRole('button', { name: 'Enregistrer' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/motif du remboursement/i), { target: { value: 'Demande client' } })
    api.post.mockResolvedValue({ data: {} })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/payments/1/refund/', { reason: 'Demande client', revoke_access: false }))
  })

  it('hides refund and export for a simple admin', async () => {
    auth.user = { id: 2, platform_level: 'admin' }
    api.get.mockResolvedValue({ data: PAYMENTS })
    wrap(<PlatformAdminPaymentsPage />)
    await waitFor(() => expect(screen.getByText('Boutique Alpha')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Rembourser' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /exporter en csv/i })).not.toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    api.get.mockRejectedValue(new Error('x'))
    wrap(<PlatformAdminPaymentsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument())
  })
})

describe('PlatformAdminPlansPage', () => {
  it('lists plans including inactive ones', async () => {
    api.get.mockResolvedValue({ data: PLANS })
    wrap(<PlatformAdminPlansPage />)
    await waitFor(() => expect(screen.getByText('Pro')).toBeInTheDocument())
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(screen.getByText('Illimité')).toBeInTheDocument()
  })

  it('edits a plan and sends features as a list', async () => {
    api.get.mockResolvedValue({ data: PLANS })
    api.put.mockResolvedValue({ data: {} })
    wrap(<PlatformAdminPlansPage />)
    await waitFor(() => expect(screen.getByText('Pro')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/plans/1/', expect.objectContaining({ name: 'Pro', features: ['Support'], orders_limit: 1000 })))
  })

  it('deactivates a plan instead of deleting it', async () => {
    api.get.mockResolvedValue({ data: PLANS })
    api.put.mockResolvedValue({ data: {} })
    wrap(<PlatformAdminPlansPage />)
    await waitFor(() => expect(screen.getByText('Pro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/plans/1/', { is_active: false }))
  })
})

describe('Account detail — geste commercial', () => {
  const DETAIL = {
    id: 7, name: 'Boutique Alpha', slug: 'alpha', owner_email: 'o@alpha.dz', owner_name: 'Omar', created_at: '2026-09-01T10:00:00Z',
    is_active: true, state: 'trial', plan_name: null, orders_used: 3, orders_limit: 50, phone: '', email: '', suspended_at: null, suspension_reason: '',
    owner: { id: 9, email: 'o@alpha.dz', first_name: 'Omar', last_name: 'A', phone: '', last_login: null, date_joined: '2026-09-01T10:00:00Z' },
    quota: { orders_used: 3, orders_limit: 50, trial_ends_at: null, period_end: null, plan: null, billing_cycle: '' },
    counts: { orders: 1, products: 1, team_members: 0 }, recent_payments: [],
  }
  const open = () => render(<MemoryRouter initialEntries={['/c/7']}><Routes><Route path="/c/:storeId" element={<PlatformAdminAccountDetailPage />} /></Routes></MemoryRouter>)

  it('adds orders with a mandatory reason', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('plans') ? PLANS : DETAIL }))
    api.post.mockResolvedValue({ data: {} })
    open()
    await waitFor(() => expect(screen.getByText('Boutique Alpha')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Geste commercial' }))
    const apply = screen.getByRole('button', { name: 'Appliquer' })
    expect(apply).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/nombre de commandes/i), { target: { value: '100' } })
    fireEvent.change(screen.getByPlaceholderText(/motif \(obligatoire\)/i), { target: { value: 'Geste commercial' } })
    fireEvent.click(apply)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/accounts/7/grant/',
      expect.objectContaining({ action: 'add_orders', value: 100, reason: 'Geste commercial' })))
  })

  it('hides the commercial gesture for a simple admin', async () => {
    auth.user = { id: 2, platform_level: 'admin' }
    api.get.mockResolvedValue({ data: DETAIL })
    open()
    await waitFor(() => expect(screen.getByText('Boutique Alpha')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Geste commercial' })).not.toBeInTheDocument()
  })
})
