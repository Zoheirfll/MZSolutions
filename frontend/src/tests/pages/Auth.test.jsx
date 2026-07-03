import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Auth from '../../pages/Auth'

const mockLogin = vi.fn()
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, setUser: vi.fn() }),
}))

vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: () => vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../api/axios', () => ({
  default: { post: vi.fn() },
}))
import api from '../../api/axios'

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>
  )
}

describe('Auth page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits login form and navigates to dashboard on success', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce({})
    renderAuth()

    await user.type(screen.getByPlaceholderText('votre@email.com'), 'a@test.com')
    await user.type(screen.getByPlaceholderText('Votre mot de passe'), 'password123')
    await user.click(screen.getByRole('button', { name: /Se connecter →/ }))

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('a@test.com', 'password123'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })

  it('shows a generic error on invalid credentials', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce({ response: { data: { detail: 'Identifiants invalides.' } } })
    renderAuth()

    await user.type(screen.getByPlaceholderText('votre@email.com'), 'a@test.com')
    await user.type(screen.getByPlaceholderText('Votre mot de passe'), 'wrong')
    await user.click(screen.getByRole('button', { name: /Se connecter →/ }))

    expect(await screen.findByText('Identifiants invalides.')).toBeInTheDocument()
  })

  it('offers to resend verification code when login fails with email_not_verified', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce({
      response: { data: { detail: 'Email non vérifié.', code: 'email_not_verified', email: 'a@test.com' } },
    })
    renderAuth()

    await user.type(screen.getByPlaceholderText('votre@email.com'), 'a@test.com')
    await user.type(screen.getByPlaceholderText('Votre mot de passe'), 'password123')
    await user.click(screen.getByRole('button', { name: /Se connecter →/ }))

    expect(await screen.findByText('Renvoyer le code de vérification')).toBeInTheDocument()
  })

  it('switches to register tab and maps field errors from the API', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce({ response: { data: { email: ['Cet email est déjà utilisé.'] } } })
    renderAuth()

    await user.click(screen.getByRole('button', { name: "S'inscrire" }))
    await user.type(screen.getByPlaceholderText('Prénom'), 'Jean')
    await user.type(screen.getByPlaceholderText('Nom'), 'Dupont')
    await user.type(screen.getByPlaceholderText('votre@email.com'), 'dup@test.com')
    await user.type(screen.getByPlaceholderText('Ma Super Boutique'), 'Ma Boutique')
    await user.type(screen.getByPlaceholderText('Minimum 8 caractères'), 'password123')
    await user.click(screen.getByRole('button', { name: /Créer mon compte gratuitement/ }))

    expect(await screen.findByText('Cet email est déjà utilisé.')).toBeInTheDocument()
  })

  it('auto-derives the store slug from the store name on register', async () => {
    const user = userEvent.setup()
    renderAuth()
    await user.click(screen.getByRole('button', { name: "S'inscrire" }))
    await user.type(screen.getByPlaceholderText('Ma Super Boutique'), 'Ma Boutique Test')
    expect(screen.getByPlaceholderText('ma-boutique')).toHaveValue('ma-boutique-test')
  })
})
