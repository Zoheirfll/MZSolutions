import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CouponsPage from '../../../pages/products/CouponsPage'

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
      <CouponsPage />
    </MemoryRouter>
  )
}

const COUPONS = [
  { id: 1, name: 'Soldes', code: 'ETE2026', discount_type: 'percentage', discount_value: 10, product_names: [], category_names: [], starts_at: null, ends_at: null, uses_count: 2, max_uses: 10, is_active: true },
]

describe('CouponsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue() },
      writable: true,
      configurable: true,
    })
  })

  it('renders the coupon list once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/promotions/?kind=code') return Promise.resolve({ data: COUPONS })
      if (url.startsWith('/products/?')) return Promise.resolve({ data: { results: [] } })
      if (url.startsWith('/products/categories/?')) return Promise.resolve({ data: { results: [] } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Soldes')).toBeInTheDocument()
    expect(screen.getByText('ETE2026')).toBeInTheDocument()
  })

  it('copies the coupon code to the clipboard', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue() },
      writable: true,
      configurable: true,
    })
    api.get.mockImplementation((url) => {
      if (url === '/products/promotions/?kind=code') return Promise.resolve({ data: COUPONS })
      if (url.startsWith('/products/?')) return Promise.resolve({ data: { results: [] } })
      if (url.startsWith('/products/categories/?')) return Promise.resolve({ data: { results: [] } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await screen.findByText('Soldes')

    const writeText = navigator.clipboard.writeText
    await user.click(screen.getByText('ETE2026'))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ETE2026'))
    expect(await screen.findByText('Copié !')).toBeInTheDocument()
  })

  it('shows empty state when the server call fails', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/promotions/?kind=code') return Promise.reject(new Error('boom'))
      if (url.startsWith('/products/?')) return Promise.resolve({ data: { results: [] } })
      if (url.startsWith('/products/categories/?')) return Promise.resolve({ data: { results: [] } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Aucun coupon')).toBeInTheDocument()
  })
})
