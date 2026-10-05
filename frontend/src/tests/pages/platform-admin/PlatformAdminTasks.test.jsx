import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminTasksPage from '../../../pages/platform-admin/PlatformAdminTasksPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
const auth = { user: { id: 1, platform_level: 'superadmin' } }
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }))
import api from '../../../api/axios'

const TASKS = { results: [
  { name: 'check_pending_payments', label: 'Vérification des paiements SofizPay en attente', interval_minutes: 10, status: 'ok', last_finished_at: '2026-10-05T08:00:00Z', last_message: '', runs_count: 12 },
  { name: 'sync_carrier_tracking', label: 'Synchronisation du suivi des transporteurs', interval_minutes: 15, status: 'never', last_finished_at: null, last_message: '', runs_count: 0 },
  { name: 'cancel_stale_calls', label: 'Annulation des commandes sans réponse (3 jours)', interval_minutes: 1440, status: 'error', last_finished_at: '2026-10-04T08:00:00Z', last_message: 'ValueError', runs_count: 3 },
] }
const BACKUPS = { configured: true, state: 'ok', count: 1, results: [{ name: 'backup_20261005.sql', size: 355440, modified_at: '2026-10-05T03:00:00Z' }] }

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset()
  auth.user = { id: 1, platform_level: 'superadmin' }
  api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('backups') ? BACKUPS : TASKS }))
})

describe('PlatformAdminTasksPage', () => {
  it('shows each task with its status, including never-run and failed ones', async () => {
    render(<PlatformAdminTasksPage />)
    await waitFor(() => expect(screen.getByText('Jamais exécutée')).toBeInTheDocument())
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getByText('En erreur')).toBeInTheDocument()
    expect(screen.getByText('ValueError')).toBeInTheDocument()
  })

  it('shows the backups with their state', async () => {
    render(<PlatformAdminTasksPage />)
    await waitFor(() => expect(screen.getByText('backup_20261005.sql')).toBeInTheDocument())
    expect(screen.getByText('Sauvegarde récente')).toBeInTheDocument()
  })

  it('launches a task after confirmation (superadmin)', async () => {
    api.post.mockResolvedValue({ data: {} })
    render(<PlatformAdminTasksPage />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Lancer' }).length).toBe(3))
    fireEvent.click(screen.getAllByRole('button', { name: 'Lancer' })[1])
    fireEvent.click(screen.getAllByRole('button', { name: 'Lancer' }).pop())
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/tasks/sync_carrier_tracking/run/'))
  })

  it('hides the launch button for a simple admin', async () => {
    auth.user = { id: 2, platform_level: 'admin' }
    render(<PlatformAdminTasksPage />)
    await waitFor(() => expect(screen.getByText('Jamais exécutée')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Lancer' })).not.toBeInTheDocument()
  })

  it('warns when no backup directory is mounted', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('backups') ? { configured: false, state: 'unconfigured', count: 0, results: [] } : TASKS }))
    render(<PlatformAdminTasksPage />)
    await waitFor(() => expect(screen.getByText(/Aucun dossier de sauvegardes/)).toBeInTheDocument())
  })
})
