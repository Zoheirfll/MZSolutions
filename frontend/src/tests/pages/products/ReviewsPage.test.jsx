import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ReviewsPage from '../../../pages/products/ReviewsPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewsPage />
    </MemoryRouter>
  )
}

const REVIEWS_DATA = {
  results: [
    { id: 1, first_name: 'Sara', last_name: 'M.', email: 's@test.dz', product_name: 'T-shirt', rating: 4, comment: 'Bien', is_approved: false, created_at: '2026-01-01T00:00:00Z' },
  ],
  count: 1,
}

describe('ReviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the review list once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/reviews/?')) return Promise.resolve({ data: REVIEWS_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Sara')).toBeInTheDocument()
    expect(screen.getByText('T-shirt')).toBeInTheDocument()
  })

  it('approves a pending review', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/reviews/?')) return Promise.resolve({ data: REVIEWS_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.put.mockResolvedValueOnce({})
    renderPage()
    await screen.findByText('Sara')

    await user.click(screen.getByText('Approuver'))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/products/reviews/1/', { is_approved: true }))
  })

  it('shows empty state when the server call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/reviews/?')) return Promise.reject(new Error('boom'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucun avis trouvé')).toBeInTheDocument()
  })
})
