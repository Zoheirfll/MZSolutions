import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ExchangeFormPage from '../../../pages/storefront/ExchangeFormPage'

vi.mock('../../../pages/storefront/StorefrontLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

vi.mock('../../../api/publicApi', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import publicApi from '../../../api/publicApi'

const ITEMS = [
  {
    id: 10,
    product_name: 'T-shirt',
    current_option: 'Rouge / M',
    quantity: 1,
    replacement_options: [
      { id: 20, variant_name: 'Couleur', value: 'Bleu' },
    ],
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/store/demo/echange']}>
      <Routes>
        <Route path="/store/:slug/echange" element={<ExchangeFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ExchangeFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the initial search form', () => {
    renderPage()
    expect(screen.getByText("Demander un échange")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retrouver ma commande' })).toBeInTheDocument()
  })

  it('finds order items and submits an exchange request', async () => {
    const user = userEvent.setup()
    publicApi.get.mockResolvedValueOnce({ data: { items: ITEMS } })
    publicApi.post.mockResolvedValueOnce({ data: { id: 1 } })
    renderPage()

    await user.type(screen.getByPlaceholderText('+213…'), '0555000000')
    await user.click(screen.getByRole('button', { name: 'Retrouver ma commande' }))

    expect(await screen.findByText(/T-shirt — Rouge \/ M/)).toBeInTheDocument()

    await user.click(screen.getByText('Choisir une variante'))
    await user.click(await screen.findByText('Couleur : Bleu'))
    await user.type(screen.getByPlaceholderText(/Trop petit/), 'Mauvaise taille')

    await user.click(screen.getByRole('button', { name: "Envoyer la demande d'échange" }))

    expect(publicApi.post).toHaveBeenCalledWith('/exchanges/', expect.objectContaining({
      store_slug: 'demo',
      phone: '0555000000',
      order_item_id: 10,
      replacement_option_id: 20,
      reason: 'Mauvaise taille',
    }))
    expect(await screen.findByText("Demande d'échange envoyée")).toBeInTheDocument()
  })

  it('shows an error when the order search fails', async () => {
    const user = userEvent.setup()
    publicApi.get.mockRejectedValueOnce({ response: { data: { detail: 'Commande introuvable.' } } })
    renderPage()

    await user.type(screen.getByPlaceholderText('+213…'), '0555000000')
    await user.click(screen.getByRole('button', { name: 'Retrouver ma commande' }))

    expect(await screen.findByText('Commande introuvable.')).toBeInTheDocument()
  })
})
