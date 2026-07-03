import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OrderFormPage from './OrderFormPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <OrderFormPage />
    </MemoryRouter>
  )
}

describe('OrderFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('disables the submit button until required fields and cart are filled', async () => {
    renderPage()
    const submit = await screen.findByRole('button', { name: 'Enregistrer' })
    expect(submit).toBeDisabled()
  })

  it('searches products, adds one to the cart, and computes the total', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?search=')) {
        return Promise.resolve({ data: { results: [{ id: 1, name: 'T-shirt', price: 1500, variants: [] }] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    await user.type(screen.getByPlaceholderText('Recherche de produit'), 'shirt')
    const option = await screen.findByText('T-shirt')
    await user.click(option)

    expect(screen.getAllByText('1 500').length).toBeGreaterThan(0)
  })

  it('submits the order with resolved cart items and navigates on success', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?search=')) {
        return Promise.resolve({ data: { results: [{ id: 1, name: 'T-shirt', price: 1500, variants: [] }] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({ data: { id: 42 } })
    renderPage()

    await user.type(screen.getByPlaceholderText('Recherche de produit'), 'shirt')
    await user.click(await screen.findByText('T-shirt'))

    await user.type(screen.getByPlaceholderText('Prénom'), 'Ali')
    await user.type(screen.getByPlaceholderText('Téléphone'), '0555000000')
    await user.click(screen.getByText('Choisissez une Wilaya'))
    await user.click(await screen.findByText(/16 — Alger/))

    const submit = screen.getByRole('button', { name: 'Enregistrer' })
    await waitFor(() => expect(submit).not.toBeDisabled())
    await user.click(submit)

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/', expect.objectContaining({
      first_name: 'Ali',
      phone: '0555000000',
      items: [expect.objectContaining({ product: 1, price: 1500, quantity: 1 })],
    })))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/commandes'))
  })

  it('shows server-side field errors without navigating away', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/?search=')) {
        return Promise.resolve({ data: { results: [{ id: 1, name: 'T-shirt', price: 1500, variants: [] }] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockRejectedValueOnce({ response: { data: { phone: 'Numéro invalide.' } } })
    renderPage()

    await user.type(screen.getByPlaceholderText('Recherche de produit'), 'shirt')
    await user.click(await screen.findByText('T-shirt'))
    await user.type(screen.getByPlaceholderText('Prénom'), 'Ali')
    await user.type(screen.getByPlaceholderText('Téléphone'), 'x')
    await user.click(screen.getByText('Choisissez une Wilaya'))
    await user.click(await screen.findByText(/16 — Alger/))

    const submit = screen.getByRole('button', { name: 'Enregistrer' })
    await waitFor(() => expect(submit).not.toBeDisabled())
    await user.click(submit)

    expect(await screen.findByText('Numéro invalide.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
