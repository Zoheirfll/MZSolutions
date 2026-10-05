import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminAccountsPage from '../../../pages/platform-admin/PlatformAdminAccountsPage'
import PlatformAdminAccountDetailPage from '../../../pages/platform-admin/PlatformAdminAccountDetailPage'
import PlatformAdminAdminsPage from '../../../pages/platform-admin/PlatformAdminAdminsPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, platform_level: 'superadmin' } }) }))
import api from '../../../api/axios'

const ROW = {
  id: 7, name: 'Boutique Alpha', slug: 'alpha', owner_email: 'o@alpha.dz', owner_name: 'Omar A',
  created_at: '2026-09-01T10:00:00Z', is_active: true, state: 'trial', plan_name: null,
  orders_used: 3, orders_limit: 50, trial_ends_at: '2026-10-20T00:00:00Z', period_end: null,
}
const DETAIL = {
  ...ROW, phone: '0555', email: 's@alpha.dz', suspended_at: null, suspension_reason: '',
  owner: { id: 9, email: 'o@alpha.dz', first_name: 'Omar', last_name: 'A', phone: '0666', last_login: null, date_joined: '2026-09-01T10:00:00Z' },
  quota: { orders_used: 3, orders_limit: 50, trial_ends_at: '2026-10-20T00:00:00Z', period_end: null, plan: null, billing_cycle: '' },
  counts: { orders: 12, products: 4, team_members: 2 }, recent_payments: [],
}

const renderAt = (path, element, route) => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter>,
)

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.put.mockReset(); api.delete.mockReset() })

describe('PlatformAdminAccountsPage', () => {
  it('lists stores with their state', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [ROW] } })
    renderAt('/platform-admin/comptes', <PlatformAdminAccountsPage />, '/platform-admin/comptes')
    await waitFor(() => expect(screen.getByText('Boutique Alpha')).toBeInTheDocument())
    expect(screen.getByText('o@alpha.dz')).toBeInTheDocument()
    expect(screen.getByText('En essai')).toBeInTheDocument()
  })

  it('reads the state filter from the URL', async () => {
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
    renderAt('/platform-admin/comptes?state=suspended', <PlatformAdminAccountsPage />, '/platform-admin/comptes')
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][1].params.state).toBe('suspended')
  })

  it('shows an error with retry on failure', async () => {
    api.get.mockRejectedValue(new Error('x'))
    renderAt('/platform-admin/comptes', <PlatformAdminAccountsPage />, '/platform-admin/comptes')
    await waitFor(() => expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument())
  })
})

describe('PlatformAdminAccountDetailPage', () => {
  const open = () => renderAt('/platform-admin/comptes/7', <PlatformAdminAccountDetailPage />, '/platform-admin/comptes/:storeId')

  it('requires a reason to suspend', async () => {
    api.get.mockResolvedValue({ data: DETAIL })
    open()
    await waitFor(() => expect(screen.getByText('Boutique Alpha')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Suspendre' }))
    const confirm = screen.getAllByRole('button', { name: 'Suspendre' }).pop()
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/motif de la suspension/i), { target: { value: 'Impayé répété' } })
    expect(confirm).not.toBeDisabled()
    api.post.mockResolvedValue({ data: {} })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/accounts/7/suspend/', { reason: 'Impayé répété' }))
  })

  it('offers reactivation for a suspended store and shows the reason', async () => {
    api.get.mockResolvedValue({ data: { ...DETAIL, state: 'suspended', is_active: false, suspended_at: '2026-10-01T00:00:00Z', suspension_reason: 'Fraude suspectée' } })
    open()
    await waitFor(() => expect(screen.getByText(/Fraude suspectée/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Réactiver' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suspendre' })).not.toBeInTheDocument()
  })

  it('sends a password reset after confirmation', async () => {
    api.get.mockResolvedValue({ data: DETAIL })
    open()
    await waitFor(() => expect(screen.getByText('Boutique Alpha')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }))
    api.post.mockResolvedValue({ data: {} })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/accounts/7/reset-password/', {}))
  })
})

describe('PlatformAdminAdminsPage', () => {
  const ADMINS = { count: 2, results: [
    { id: 1, email: 'me@mz.dz', first_name: 'Moi', last_name: 'Super', level: 'superadmin', is_active: true, last_login: null },
    { id: 2, email: 'other@mz.dz', first_name: 'Autre', last_name: 'Admin', level: 'admin', is_active: true, last_login: null },
  ] }

  it('lists admins and protects the current account', async () => {
    api.get.mockResolvedValue({ data: ADMINS })
    render(<MemoryRouter><PlatformAdminAdminsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('other@mz.dz')).toBeInTheDocument())
    const revokes = screen.getAllByRole('button', { name: /retirer l.accès/i })
    expect(revokes[0]).toBeDisabled() // soi-même
    expect(revokes[1]).not.toBeDisabled()
  })

  it('creates an admin', async () => {
    api.get.mockResolvedValue({ data: ADMINS })
    api.post.mockResolvedValue({ data: {} })
    render(<MemoryRouter><PlatformAdminAdminsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('other@mz.dz')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un administrateur' }))
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@mz.dz' } })
    fireEvent.change(screen.getByPlaceholderText('Prénom'), { target: { value: 'Nina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/admins/', expect.objectContaining({ email: 'new@mz.dz', level: 'admin' })))
  })

  it('shows the one-time activation link after creating an admin', async () => {
    api.get.mockResolvedValue({ data: ADMINS })
    api.post.mockResolvedValue({ data: { email: 'new@mz.dz', activation_link: 'https://mzsol.online/reset-password?uid=XX&token=YY' } })
    render(<MemoryRouter><PlatformAdminAdminsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('other@mz.dz')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un administrateur' }))
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@mz.dz' } })
    fireEvent.change(screen.getByPlaceholderText('Prénom'), { target: { value: 'Nina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await waitFor(() => expect(screen.getByLabelText("Lien d'activation")).toHaveValue('https://mzsol.online/reset-password?uid=XX&token=YY'))
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument()
  })
})
