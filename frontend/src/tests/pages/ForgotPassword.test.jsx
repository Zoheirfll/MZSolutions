import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ForgotPassword from '../../pages/ForgotPassword'

vi.mock('../../api/axios', () => ({
  default: { post: vi.fn() },
}))
import api from '../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  )
}

describe('ForgotPassword', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits the email and shows the confirmation message', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce({})
    renderPage()

    await user.type(screen.getByPlaceholderText('votre@email.com'), 'a@test.com')
    await user.click(screen.getByRole('button', { name: /Envoyer le lien/ }))

    expect(await screen.findByText('Email envoyé !')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/auth/password-reset/', { email: 'a@test.com' })
  })

  it('shows a generic error message on failure', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce(new Error('network'))
    renderPage()

    await user.type(screen.getByPlaceholderText('votre@email.com'), 'a@test.com')
    await user.click(screen.getByRole('button', { name: /Envoyer le lien/ }))

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument()
  })
})
