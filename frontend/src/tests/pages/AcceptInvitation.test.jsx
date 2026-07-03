import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AcceptInvitation from '../../pages/AcceptInvitation'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../api/axios'

function renderPage(token = 'abc123') {
  return render(
    <MemoryRouter initialEntries={[`/accept-invitation?token=${token}`]}>
      <Routes>
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AcceptInvitation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows an invalid-link state when no token is present in the URL', async () => {
    renderPage('')
    expect(await screen.findByText('Lien invalide ou déjà utilisé')).toBeInTheDocument()
  })

  it('shows an invalid-link state when the token lookup fails', async () => {
    api.get.mockRejectedValueOnce(new Error('404'))
    renderPage()
    expect(await screen.findByText('Lien invalide ou déjà utilisé')).toBeInTheDocument()
  })

  it('renders the invitation info and activates the account on submit', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValueOnce({ data: { first_name: 'Ali', last_name: 'B', store_name: 'Ma Boutique', role: 'admin' } })
    api.post.mockResolvedValueOnce({})
    renderPage()

    expect((await screen.findAllByText(/Ma Boutique/)).length).toBeGreaterThan(0)
    await user.type(screen.getByPlaceholderText('Minimum 8 caractères'), 'password123')
    await user.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Activer mon compte' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team/accept-invitation/', { token: 'abc123', password: 'password123' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/auth?activated=1'))
  })

  it('rejects mismatched password confirmation without calling the API', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValueOnce({ data: { first_name: 'Ali', last_name: 'B', store_name: 'Ma Boutique', role: 'confirmateur' } })
    renderPage()

    await screen.findAllByText(/Ma Boutique/)
    await user.type(screen.getByPlaceholderText('Minimum 8 caractères'), 'password123')
    await user.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'different')
    await user.click(screen.getByRole('button', { name: 'Activer mon compte' }))

    expect(await screen.findByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})
