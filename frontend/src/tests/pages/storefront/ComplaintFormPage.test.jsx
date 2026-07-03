import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ComplaintFormPage from '../../../pages/storefront/ComplaintFormPage'

vi.mock('../../../pages/storefront/StorefrontLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

vi.mock('../../../api/publicApi', () => ({
  default: { post: vi.fn() },
}))
import publicApi from '../../../api/publicApi'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/store/demo/reclamation']}>
      <Routes>
        <Route path="/store/:slug/reclamation" element={<ComplaintFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ComplaintFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the complaint form', () => {
    renderPage()
    expect(screen.getByText('Déposer une réclamation')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('+213…')).toBeInTheDocument()
  })

  it('submits the complaint and shows a confirmation screen', async () => {
    const user = userEvent.setup()
    publicApi.post.mockResolvedValueOnce({ data: { id: 1 } })
    renderPage()

    await user.type(screen.getByPlaceholderText('+213…'), '0555000000')
    await user.type(screen.getByPlaceholderText('Ex. Produit endommagé'), 'Colis endommagé')
    await user.type(screen.getByPlaceholderText('Décrivez le problème rencontré…'), 'Boîte cassée à la réception')
    await user.click(screen.getByRole('button', { name: 'Envoyer la réclamation' }))

    expect(publicApi.post).toHaveBeenCalledWith('/complaints/', expect.objectContaining({
      store_slug: 'demo',
      phone: '0555000000',
      subject: 'Colis endommagé',
      description: 'Boîte cassée à la réception',
    }))
    expect(await screen.findByText('Réclamation envoyée')).toBeInTheDocument()
  })

  it('shows a server error message on failure', async () => {
    const user = userEvent.setup()
    publicApi.post.mockRejectedValueOnce({ response: { data: { detail: 'Commande introuvable.' } } })
    renderPage()

    await user.type(screen.getByPlaceholderText('+213…'), '0555000000')
    await user.type(screen.getByPlaceholderText('Ex. Produit endommagé'), 'Sujet')
    await user.type(screen.getByPlaceholderText('Décrivez le problème rencontré…'), 'Description')
    await user.click(screen.getByRole('button', { name: 'Envoyer la réclamation' }))

    expect(await screen.findByText('Commande introuvable.')).toBeInTheDocument()
  })
})
