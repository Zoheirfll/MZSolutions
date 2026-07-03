import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ClientsPage from '../../../pages/customers/ClientsPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <ClientsPage />
    </MemoryRouter>
  )
}

const CLIENT = {
  phone: '0555000000', first_name: 'Ali', last_name: 'Ben', email: 'ali@test.dz',
  orders_count: 3, wilaya: 'Alger', commune: 'Bab Ezzouar', is_risky: false, manual_risk: false,
  created_at: '2026-01-01T00:00:00Z',
}

describe('ClientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the client list once loaded', async () => {
    api.get.mockResolvedValue({ data: { results: [CLIENT], count: 1, page: 1, per_page: 10 } })
    renderPage()
    expect(await screen.findByText('Ali Ben')).toBeInTheDocument()
    expect(screen.getByText('0555000000')).toBeInTheDocument()
    expect(screen.getByText('1 client')).toBeInTheDocument()
  })

  it('searches clients and refetches with the query param', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { results: [CLIENT], count: 1, page: 1, per_page: 10 } })
    renderPage()
    await screen.findByText('Ali Ben')

    await user.type(screen.getByPlaceholderText('Recherche par nom ou téléphone'), 'Ali')

    await waitFor(() => {
      const called = api.get.mock.calls.some(([url]) => url.includes('search=Ali'))
      expect(called).toBe(true)
    })
  })

  it('shows an empty state when the request fails', async () => {
    api.get.mockRejectedValue(new Error('network error'))
    renderPage()
    expect(await screen.findByText('Aucun client')).toBeInTheDocument()
  })
})
