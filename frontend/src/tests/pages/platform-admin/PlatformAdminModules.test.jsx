import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminSettingsPage from '../../../pages/platform-admin/PlatformAdminSettingsPage'
import StoreModulesPanel from '../../../components/admin/StoreModulesPanel'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
import api from '../../../api/axios'

const SETTINGS = {
  trial_days: 30, allow_registration: true, updated_at: '2026-10-04T10:00:00Z', ai_daily_limit: 0, disabled_features: ['webhooks'],
  features: [{ key: 'ai', label: 'Assistant IA' }, { key: 'webhooks', label: 'Webhooks sortants' }, { key: 'channels', label: 'Canaux de vente' }],
}
const USAGE = { today: 12, last_7_days: [{ day: '2026-10-05', calls: 12 }], top_stores_today: [{ store_id: 1, store_name: 'Alpha', calls: 9 }] }

beforeEach(() => {
  api.get.mockReset(); api.put.mockReset()
  api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('ai-usage') ? USAGE : SETTINGS }))
})

describe('Settings — modules and AI quota', () => {
  it('shows each module state and disables one globally', async () => {
    api.put.mockResolvedValue({ data: SETTINGS })
    render(<MemoryRouter><PlatformAdminSettingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByLabelText('Assistant IA')).toBeChecked())
    expect(screen.getByLabelText('Webhooks sortants')).not.toBeChecked()
    fireEvent.click(screen.getByLabelText('Assistant IA'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/settings/', { disabled_features: ['webhooks', 'ai'] }))
  })

  it('saves the daily AI limit and shows the usage', async () => {
    api.put.mockResolvedValue({ data: { ...SETTINGS, ai_daily_limit: 50 } })
    render(<MemoryRouter><PlatformAdminSettingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByLabelText(/limite d.appels IA/i)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Alpha — 9')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/limite d.appels IA/i), { target: { value: '50' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Enregistrer' })[1])
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/settings/', { ai_daily_limit: 50 }))
    fireEvent.change(screen.getByLabelText('Par semaine'), { target: { value: '200' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Enregistrer' })[2])
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/settings/', { ai_weekly_limit: 200 }))
  })
})

describe('StoreModulesPanel', () => {
  it('turns a module off for one store', async () => {
    api.put.mockResolvedValue({ data: {} })
    const onChanged = vi.fn()
    render(<StoreModulesPanel storeId={7} disabled={['channels']} onChanged={onChanged} />)
    expect(screen.getByLabelText('Canaux de vente')).not.toBeChecked()
    fireEvent.click(screen.getByLabelText('Assistant IA'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/accounts/7/features/', { disabled: ['channels', 'ai'] }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('turns a module back on', async () => {
    api.put.mockResolvedValue({ data: {} })
    render(<StoreModulesPanel storeId={7} disabled={['channels']} />)
    fireEvent.click(screen.getByLabelText('Canaux de vente'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/accounts/7/features/', { disabled: [] }))
  })
})
