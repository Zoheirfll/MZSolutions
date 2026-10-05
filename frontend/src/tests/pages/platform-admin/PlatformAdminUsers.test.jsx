import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminUsersPage from '../../../pages/platform-admin/PlatformAdminUsersPage'
import PlatformAdminLoginsPage from '../../../pages/platform-admin/PlatformAdminLoginsPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import api from '../../../api/axios'

const USER = { id: 5, email: 'omar@alpha.dz', first_name: 'Omar', last_name: 'A', role: 'owner', team_role: null, store_id: 7, store_name: 'Alpha', is_active: true, last_login: null, date_joined: '2026-09-01T10:00:00Z' }
const DETAIL = { ...USER, phone: '', is_email_verified: true, active_sessions: 2, failed_attempts_24h: 3, login_history: [{ status: 'login', ip_address: '10.0.0.1', user_agent: 'UA', created_at: '2026-10-04T10:00:00Z' }] }

const wrap = (el, path = '/') => render(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>)
beforeEach(() => { api.get.mockReset(); api.post.mockReset() })

describe('PlatformAdminUsersPage', () => {
  const mock = (detail = DETAIL) => api.get.mockImplementation((url) => Promise.resolve({ data: /users\/\d+\//.test(url) ? detail : { count: 1, results: [USER] } }))

  it('lists users with their role and store', async () => {
    mock()
    wrap(<PlatformAdminUsersPage />)
    await waitFor(() => expect(screen.getByText('omar@alpha.dz')).toBeInTheDocument())
    expect(screen.getByText('Propriétaire de boutique')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('reads the role filter from the URL', async () => {
    mock()
    wrap(<PlatformAdminUsersPage />, '/?role=team')
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][1].params.role).toBe('team')
  })

  it('deactivates only with a reason', async () => {
    mock()
    api.post.mockResolvedValue({ data: {} })
    wrap(<PlatformAdminUsersPage />)
    await waitFor(() => expect(screen.getByText('omar@alpha.dz')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    await waitFor(() => expect(screen.getByText('Sessions actives')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le compte' }))
    const confirm = screen.getByRole('button', { name: 'Désactiver' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/motif \(obligatoire\)/i), { target: { value: 'Compte compromis' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/users/5/deactivate/', { reason: 'Compte compromis' }))
  })

  it('does not allow deactivating an administration account from here', async () => {
    mock({ ...DETAIL, role: 'admin_platform' })
    wrap(<PlatformAdminUsersPage />)
    await waitFor(() => expect(screen.getByText('omar@alpha.dz')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Désactiver le compte' })).toBeDisabled())
  })
})

describe('PlatformAdminLoginsPage', () => {
  it('shows the 24h summary and the attempts', async () => {
    api.get.mockResolvedValue({ data: {
      count: 1, summary: { failed_24h: 4, distinct_ips_24h: 2, top_ips: [{ ip_address: '10.0.0.1', count: 3 }] },
      results: [{ id: 1, email: 'x@test.com', ip_address: '10.0.0.1', reason: 'bad_credentials', created_at: '2026-10-05T08:00:00Z' }],
    } })
    wrap(<PlatformAdminLoginsPage />)
    await waitFor(() => expect(screen.getByText('x@test.com')).toBeInTheDocument())
    expect(screen.getAllByText(/10\.0\.0\.1/).length).toBeGreaterThan(0)
    expect(screen.getByText('Identifiants incorrects')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    api.get.mockRejectedValue(new Error('x'))
    wrap(<PlatformAdminLoginsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument())
  })
})
