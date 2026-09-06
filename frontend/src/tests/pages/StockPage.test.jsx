import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StockPage from '../../pages/StockPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}))
import api from '../../api/axios'

const LOW_STOCK = { threshold: 5, count: 2, results: [] }
const INVENTORY = {
  results: [
    { product_name: 'T-shirt', variant_name: 'Couleur', option_value: 'Rouge', sku: 'TS-R', stock: 3, sales_rate_14d: 0.5, days_until_stockout: 6 },
  ],
  count: 1, page: 1, per_page: 20,
}
const INVENTORY_FORECAST = {
  results: [
    { product_id: 1, product_name: 'Produit Zero', variant_name: null, option_value: null, sku: '', stock: 0, sales_rate_14d: 0.5, days_until_stockout: 0 },
    { product_id: 2, product_name: 'Produit Urgent', variant_name: null, option_value: null, sku: '', stock: 5, sales_rate_14d: 2, days_until_stockout: 2.5 },
    { product_id: 3, product_name: 'Produit Stable', variant_name: null, option_value: null, sku: '', stock: 20, sales_rate_14d: 0, days_until_stockout: null },
  ],
  count: 3, page: 1, per_page: 20,
}

function mockGet() {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/products/low-stock/')) return Promise.resolve({ data: LOW_STOCK })
    if (url.startsWith('/products/inventory/')) return Promise.resolve({ data: INVENTORY })
    return Promise.resolve({ data: {} })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StockPage />
    </MemoryRouter>
  )
}

describe('StockPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the low-stock count and inventory table once loaded', async () => {
    mockGet()
    renderPage()

    expect(await screen.findByText('T-shirt')).toBeInTheDocument()
    expect(screen.getByText(/articles en stock bas/)).toBeInTheDocument()
    expect(screen.getByText('TS-R')).toBeInTheDocument()
  })

  it('saves a new low-stock threshold', async () => {
    const user = userEvent.setup()
    mockGet()
    api.put.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('T-shirt')
    const input = screen.getByDisplayValue('5')
    await user.clear(input)
    await user.type(input, '10')
    await user.click(screen.getByText('Enregistrer'))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/me/settings/', { low_stock_threshold: 10 }))
  })

  it('handles a server error while loading gracefully (empty inventory)', async () => {
    api.get.mockRejectedValue(new Error('boom'))
    renderPage()

    expect(await screen.findByText('Aucun produit trouvé.')).toBeInTheDocument()
  })

  it('shows the "Épuisé" badge for a stock already at 0', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/low-stock/')) return Promise.resolve({ data: LOW_STOCK })
      if (url.startsWith('/products/inventory/')) return Promise.resolve({ data: INVENTORY_FORECAST })
      return Promise.resolve({ data: {} })
    })
    renderPage()

    expect(await screen.findByText('Épuisé')).toBeInTheDocument()
  })

  it('shows the estimated number of days for a normal forecast', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/low-stock/')) return Promise.resolve({ data: LOW_STOCK })
      if (url.startsWith('/products/inventory/')) return Promise.resolve({ data: INVENTORY_FORECAST })
      return Promise.resolve({ data: {} })
    })
    renderPage()

    expect(await screen.findByText(/2\.5/)).toBeInTheDocument()
  })

  it('shows a dash when no forecast is possible', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/products/low-stock/')) return Promise.resolve({ data: LOW_STOCK })
      if (url.startsWith('/products/inventory/')) return Promise.resolve({ data: INVENTORY_FORECAST })
      return Promise.resolve({ data: {} })
    })
    renderPage()

    await screen.findByText('Produit Stable')
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })
})
