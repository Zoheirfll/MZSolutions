import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ResetPassword from '../../pages/ResetPassword'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../api/axios', () => ({
  default: { post: vi.fn() },
}))
import api from '../../api/axios'

function renderPage(query = '?uid=u1&token=t1') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${query}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ResetPassword', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows an invalid-link state when uid/token are missing', () => {
    renderPage('')
    expect(screen.getByText('Lien invalide.')).toBeInTheDocument()
  })

  it('rejects a short password client-side without calling the API', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByPlaceholderText('Minimum 8 caractères'), 'short')
    await user.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'short')
    await user.click(screen.getByRole('button', { name: /Réinitialiser/ }))
    expect(await screen.findByText('Le mot de passe doit contenir au moins 8 caractères.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('submits and shows the success screen on valid reset', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce({})
    renderPage()

    await user.type(screen.getByPlaceholderText('Minimum 8 caractères'), 'newpassword1')
    await user.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'newpassword1')
    await user.click(screen.getByRole('button', { name: /Réinitialiser/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/password-reset/confirm/', {
      uid: 'u1', token: 't1', new_password: 'newpassword1',
    }))
    expect(await screen.findByText('Mot de passe mis à jour !')).toBeInTheDocument()
  })

  it('shows a server error message on an invalid/expired token', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Lien invalide ou expiré.' } } })
    renderPage()

    await user.type(screen.getByPlaceholderText('Minimum 8 caractères'), 'newpassword1')
    await user.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'newpassword1')
    await user.click(screen.getByRole('button', { name: /Réinitialiser/ }))

    expect(await screen.findByText('Lien invalide ou expiré.')).toBeInTheDocument()
  })
})
