import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminOverviewPage from '../../../pages/platform-admin/PlatformAdminOverviewPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn() } }))
import api from '../../../api/axios'

const DATA = {
  stores: { total: 12, trial: 5, subscribed: 4, expired: 2, suspended: 1 },
  revenue: { this_month: 9000, pending: 1, failed: 0, series: [{ month: '2026-10', value: 9000 }] },
  activity: { orders_30d: 340, orders_series: [{ month: '2026-10', value: 340 }], new_stores_series: [{ month: '2026-10', value: 3 }] },
  alerts: { trials_expiring: { count: 2, store_ids: [1, 2] }, quota_high: { count: 0, store_ids: [] }, payments_stuck: { count: 1, payment_ids: [9] } },
}

describe('PlatformAdminOverviewPage', () => {
  beforeEach(() => { api.get.mockReset() })

  it('shows KPI values and alerts', async () => {
    api.get.mockResolvedValue({ data: DATA })
    render(<MemoryRouter><PlatformAdminOverviewPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument())
    expect(screen.getByText('340')).toBeInTheDocument()
    expect(screen.getByText(/essais qui expirent/i)).toBeInTheDocument()
  })

  it('shows an error with retry when the API fails', async () => {
    api.get.mockRejectedValue(new Error('x'))
    render(<MemoryRouter><PlatformAdminOverviewPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument())
  })
})
