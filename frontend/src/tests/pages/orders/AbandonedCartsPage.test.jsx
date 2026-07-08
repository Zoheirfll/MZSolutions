import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AbandonedCartsPage from '../../../pages/orders/AbandonedCartsPage'

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

  const CART_WITH_ITEMS = {
    id: 7, first_name: 'Sami', last_name: 'K', phone: '0555111222', email: '', wilaya: 'Oran',
    items: [{ product_name: 'T-shirt', price: 1500, quantity: 2 }], total: 3000,
    is_recovered: false, reminder_sent: false, created_at: '2026-07-01T10:00:00Z',
  }

  it('opens the items modal when clicking the article count', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/abandoned-carts/')) return Promise.resolve({ data: { results: [CART_WITH_ITEMS], count: 1 } })
      return Promise.resolve({ data: { count: 0 } })
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Sami K')
    await user.click(screen.getByText('1 article(s)'))
    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText('Qté : 2')).toBeInTheDocument()
  })

  it('sends a reminder via WhatsApp and marks it sent', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/abandoned-carts/')) return Promise.resolve({ data: { results: [CART_WITH_ITEMS], count: 1 } })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValue({ data: {} })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Sami K')
    await user.click(screen.getByText('Relancer'))

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('wa.me/213555111222'), '_blank', 'noopener')
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/abandoned-carts/7/remind/', { channel: 'whatsapp' }))
    openSpy.mockRestore()
  })

  it('offers a WhatsApp/Email choice when the cart has an email, and sends via email', async () => {
    const cartWithEmail = { ...CART_WITH_ITEMS, email: 'client@test.com' }
    api.get.mockImplementation((url) => {
      if (url.startsWith('/orders/abandoned-carts/')) return Promise.resolve({ data: { results: [cartWithEmail], count: 1 } })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValue({ data: {} })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Sami K')

    await user.click(screen.getByText('Relancer'))
    await user.click(screen.getByText('Par email'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/abandoned-carts/7/remind/', { channel: 'email' }))
  })
})
