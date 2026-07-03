import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AbandonedCartsPage from '../../../pages/orders/AbandonedCartsPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <AbandonedCartsPage />
    </MemoryRouter>
  )
}

describe('AbandonedCartsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
  })

  it('shows an empty state when there are no abandoned carts', async () => {
    renderPage()
    expect(await screen.findByText('Aucun panier abandonné')).toBeInTheDocument()
  })

  it('renders carts with correct status badges', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/abandoned-carts/')) {
        return Promise.resolve({ data: {
          results: [
            { id: 1, first_name: 'Ali', last_name: 'B', phone: '0555', email: '', wilaya: 'Alger', items: [{}], total: 2000, is_recovered: true, reminder_sent: false, created_at: '2026-07-01T10:00:00Z' },
          ],
          count: 1,
        } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('Ali B')).toBeInTheDocument()
    expect(screen.getByText('Récupéré')).toBeInTheDocument()
  })

  it('switches tabs and refetches with the recovered filter', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Aucun panier abandonné')
    await user.click(screen.getByRole('button', { name: 'Récupérés' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('recovered=1')))
  })
})
