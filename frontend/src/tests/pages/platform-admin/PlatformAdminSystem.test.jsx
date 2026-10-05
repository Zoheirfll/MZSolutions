import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminSystemPage from '../../../pages/platform-admin/PlatformAdminSystemPage'
import PlatformAdminSettingsPage from '../../../pages/platform-admin/PlatformAdminSettingsPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
import api from '../../../api/axios'

const HEALTH = { status: 'warning', checked_at: '2026-10-04T10:00:00Z', checks: [
  { key: 'database', label: 'Base de données', status: 'ok', detail: '3 ms' },
  { key: 'sofizpay', label: 'SofizPay', status: 'warning', detail: 'sandbox actif en production' },
] }
const ERRORS = { count: 1, open_count: 1, page: 1, per_page: 20, results: [
  { id: 5, exception_type: 'ValueError', route: '/api/orders/<id>/', method: 'GET', location: 'orders/views.py:10:get', count: 4, status: 'open', first_seen: '2026-10-01T10:00:00Z', last_seen: '2026-10-04T09:00:00Z', resolved_at: null },
] }

const wrap = (el) => render(<MemoryRouter>{el}</MemoryRouter>)
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.put.mockReset() })

describe('PlatformAdminSystemPage', () => {
  const mockApi = () => api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('health') ? HEALTH : ERRORS }))

  it('shows service health and grouped errors', async () => {
    mockApi()
    wrap(<PlatformAdminSystemPage />)
    await waitFor(() => expect(screen.getByText('Base de données')).toBeInTheDocument())
    expect(screen.getByText('sandbox actif en production')).toBeInTheDocument()
    expect(screen.getByText('ValueError')).toBeInTheDocument()
    expect(screen.getByText(/GET \/api\/orders\/<id>\//)).toBeInTheDocument()
  })

  it('marks an error as resolved', async () => {
    mockApi()
    api.post.mockResolvedValue({ data: {} })
    wrap(<PlatformAdminSystemPage />)
    await waitFor(() => expect(screen.getByText('ValueError')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Marquer résolue' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/errors/5/resolve/'))
  })

  it('shows an error with retry when health fails', async () => {
    api.get.mockImplementation((url) => (url.includes('health') ? Promise.reject(new Error('x')) : Promise.resolve({ data: ERRORS })))
    wrap(<PlatformAdminSystemPage />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /réessayer/i }).length).toBeGreaterThan(0))
  })
})

describe('PlatformAdminSettingsPage', () => {
  const SETTINGS = { trial_days: 30, allow_registration: true, updated_at: '2026-10-04T10:00:00Z' }

  it('saves the trial duration', async () => {
    api.get.mockResolvedValue({ data: SETTINGS })
    api.put.mockResolvedValue({ data: { ...SETTINGS, trial_days: 14 } })
    wrap(<PlatformAdminSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText(/durée de l.essai/i)).toBeInTheDocument())
    const save = screen.getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled() // inchangé
    fireEvent.change(screen.getByLabelText(/durée de l.essai/i), { target: { value: '14' } })
    fireEvent.click(save)
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/settings/', { trial_days: 14 }))
  })

  it('closes registration', async () => {
    api.get.mockResolvedValue({ data: SETTINGS })
    api.put.mockResolvedValue({ data: { ...SETTINGS, allow_registration: false } })
    wrap(<PlatformAdminSettingsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fermer les inscriptions' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Fermer les inscriptions' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/settings/', { allow_registration: false }))
  })
})
