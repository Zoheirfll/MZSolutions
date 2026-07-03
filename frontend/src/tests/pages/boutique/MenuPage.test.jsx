import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MenuPage from '../../../pages/boutique/MenuPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {}, store_slug: 'demo' }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <MenuPage />
    </MemoryRouter>
  )
}

describe('MenuPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('seeds default menu items when the store has none saved', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/settings/') return Promise.resolve({ data: { menu_items: [] } })
      if (url === '/stores/pages/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByDisplayValue('Accueil')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Produits')).toBeInTheDocument()
  })

  it('loads saved menu items when present', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/settings/') return Promise.resolve({ data: { menu_items: [
        { id: '1', label: 'Contact', type: 'external', url: 'https://x.com', page_slug: '' },
      ] } })
      if (url === '/stores/pages/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByDisplayValue('Contact')).toBeInTheDocument()
  })

  it('adds a new internal link item', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/settings/') return Promise.resolve({ data: { menu_items: [] } })
      if (url === '/stores/pages/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await screen.findByDisplayValue('Accueil')
    await user.click(screen.getByRole('button', { name: '+ Lien interne' }))
    const labels = screen.getAllByPlaceholderText('Libellé')
    expect(labels).toHaveLength(3)
  })

  it('saves the menu and shows a confirmation', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/settings/') return Promise.resolve({ data: { menu_items: [] } })
      if (url === '/stores/pages/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.put.mockResolvedValueOnce({})
    renderPage()
    await screen.findByDisplayValue('Accueil')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le menu' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/me/settings/', expect.objectContaining({ menu_items: expect.any(Array) })))
    expect(await screen.findByText('✓ Enregistré')).toBeInTheDocument()
  })
})
