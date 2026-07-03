import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProductFormPage from '../../../pages/products/ProductFormPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/produits/nouveau']}>
      <Routes>
        <Route path="/dashboard/produits/nouveau" element={<ProductFormPage />} />
        <Route path="/dashboard/produits/:id/modifier" element={<ProductFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function renderEdit(id = '7') {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/produits/${id}/modifier`]}>
      <Routes>
        <Route path="/dashboard/produits/:id/modifier" element={<ProductFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

const EDIT_PRODUCT = {
  id: 7, name: 'T-shirt', price: 1500, compare_price: null, cost_price: null,
  stock: 10, sku: '', weight: null, categories: [], supplier: null,
  free_shipping: false, allow_out_of_stock: false, drop_shipping: false,
  is_active: true, description: '', images: [],
  variants: [{ id: 1, name: 'Couleur', sub_option_name: '', options: [] }],
}

describe('ProductFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the create form with empty fields', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/products/categories/?parent=null') return Promise.resolve({ data: { results: [] } })
      if (url === '/products/suppliers/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderCreate()

    expect(await screen.findByPlaceholderText('Nom du produit')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Enregistrer le produit' })).toBeInTheDocument()
  })

  it('submits a new product and navigates to its edit page', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/products/categories/?parent=null') return Promise.resolve({ data: { results: [] } })
      if (url === '/products/suppliers/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({ data: { id: 99 } })
    renderCreate()

    const nameInput = await screen.findByPlaceholderText('Nom du produit')
    await user.type(nameInput, 'Casquette')
    const priceInput = nameInput.closest('form').querySelector('input[name="price"]')
    await user.type(priceInput, '2000')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le produit' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/products/', expect.objectContaining({
      name: 'Casquette',
    })))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/produits/99/modifier'))
  })

  it('shows server-side field errors without navigating away', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/products/categories/?parent=null') return Promise.resolve({ data: { results: [] } })
      if (url === '/products/suppliers/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockRejectedValueOnce({ response: { data: { name: 'Ce nom existe déjà.' } } })
    renderCreate()

    const nameInput = await screen.findByPlaceholderText('Nom du produit')
    await user.type(nameInput, 'Casquette')
    const priceInput = nameInput.closest('form').querySelector('input[name="price"]')
    await user.type(priceInput, '2000')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le produit' }))

    expect(await screen.findByText('Ce nom existe déjà.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('loads an existing product in edit mode and adds a variant option with a non-empty value', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/products/categories/?parent=null') return Promise.resolve({ data: { results: [] } })
      if (url === '/products/suppliers/') return Promise.resolve({ data: [] })
      if (url === '/products/7/') return Promise.resolve({ data: EDIT_PRODUCT })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderEdit('7')

    expect(await screen.findByPlaceholderText('Nom du produit')).toHaveValue('T-shirt')

    await user.click(screen.getByText('Variantes'))
    expect(await screen.findByDisplayValue('Couleur')).toBeInTheDocument()

    api.post.mockResolvedValueOnce({ data: { id: 55, value: 'Nouvelle option', stock: 0, sku: '', is_active: true } })
    await user.click(screen.getByText("+ Ajouter une sous-option"))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/products/7/variants/1/options/',
      expect.objectContaining({ value: 'Nouvelle option' }),
    ))
  })
})
