import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PageFormPage from '../../../pages/boutique/PageFormPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../components/RichEditor', () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="rich-editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage(path = '/dashboard/boutique/pages/nouvelle') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/boutique/pages/nouvelle" element={<PageFormPage />} />
        <Route path="/dashboard/boutique/pages/:id/modifier" element={<PageFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PageFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('auto-derives the slug from the title in create mode', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByPlaceholderText('À propos de nous'), 'Notre Histoire')
    expect(screen.getByPlaceholderText('a-propos')).toHaveValue('notre-histoire')
  })

  it('creates a page and navigates back to the list', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce({})
    renderPage()

    await user.type(screen.getByPlaceholderText('À propos de nous'), 'FAQ Livraison')
    await user.click(screen.getByRole('button', { name: 'Créer la page' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/pages/', expect.objectContaining({ title: 'FAQ Livraison' })))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/boutique/pages'))
  })

  it('loads existing page data in edit mode', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/pages/9/') return Promise.resolve({ data: {
        title: 'CGV', slug: 'cgv', content: '<p>Texte</p>', page_type: 'terms', is_published: false, order: 0,
      } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage('/dashboard/boutique/pages/9/modifier')
    expect(await screen.findByDisplayValue('CGV')).toBeInTheDocument()
    expect(screen.getByText('Brouillon — non visible')).toBeInTheDocument()
  })

  it('shows a server error and stays on the page when submission fails', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Slug déjà utilisé.' } } })
    renderPage()

    await user.type(screen.getByPlaceholderText('À propos de nous'), 'Doublon')
    await user.click(screen.getByRole('button', { name: 'Créer la page' }))

    expect(await screen.findByText('Slug déjà utilisé.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
