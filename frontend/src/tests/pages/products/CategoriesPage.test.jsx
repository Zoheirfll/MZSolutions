import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CategoriesPage from '../../../pages/products/CategoriesPage'

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
      <CategoriesPage />
    </MemoryRouter>
  )
}

const CATS_DATA = {
  results: [
    { id: 1, name: 'Vêtements', is_active: true, children_count: 0, created_at: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'Chaussures', is_active: false, children_count: 0, created_at: '2026-01-02T00:00:00Z' },
  ],
  count: 2, page: 1, per_page: 10,
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the category list once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/categories/?')) return Promise.resolve({ data: CATS_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Vêtements')).toBeInTheDocument()
    expect(screen.getByText('Chaussures')).toBeInTheDocument()
  })

  it('switches tab and refetches with the tab filter', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/categories/?')) return Promise.resolve({ data: CATS_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await screen.findByText('Vêtements')

    await user.click(screen.getByText('Corbeille'))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('tab=corbeille')))
  })

  it('shows empty state when the server call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/categories/?')) return Promise.reject(new Error('boom'))
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucune catégorie')).toBeInTheDocument()
  })
})
