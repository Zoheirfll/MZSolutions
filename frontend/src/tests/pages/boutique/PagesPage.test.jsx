import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PagesPage from '../../../pages/boutique/PagesPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <PagesPage />
    </MemoryRouter>
  )
}

describe('PagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('shows an empty state when there are no pages', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/pages/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('Aucune page. Créez votre première page personnalisée.')).toBeInTheDocument()
  })

  it('renders pages with their type and status', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/pages/') return Promise.resolve({ data: [
        { id: 1, title: 'À propos de nous', page_type: 'about', slug: 'a-propos', is_published: true },
      ] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('À propos de nous')).toBeInTheDocument()
    expect(screen.getByText('Publiée')).toBeInTheDocument()
  })

  it('deletes a page after confirmation and reloads the list', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.get.mockImplementation((url) => {
      if (url === '/stores/pages/') return Promise.resolve({ data: [
        { id: 1, title: 'FAQ', page_type: 'faq', slug: 'faq', is_published: false },
      ] })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.delete.mockResolvedValueOnce({})
    renderPage()

    await screen.findAllByText('FAQ')
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/stores/pages/1/'))
    window.confirm.mockRestore()
  })
})
