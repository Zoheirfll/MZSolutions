import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TeamPage from '../../pages/TeamPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../../api/axios'

const ADMINS = [
  { id: 1, first_name: 'Karim', last_name: 'B', email: 'karim@test.com', phone: '0555111111', role: 'admin', is_active: true, invited_at: '2026-01-01T00:00:00Z' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <TeamPage />
    </MemoryRouter>
  )
}

describe('TeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('loads and displays the admin members table by default', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/team/members/?role=admin') return Promise.resolve({ data: ADMINS })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByText('Karim B')).toBeInTheDocument()
    expect(screen.getByText('karim@test.com')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
  })

  it('switches to the Confirmateurs tab and fetches its members', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/team/members/?role=admin') return Promise.resolve({ data: ADMINS })
      if (url === '/team/members/?role=confirmateur') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    await screen.findByText('Karim B')
    await user.click(screen.getByRole('button', { name: 'Confirmateurs' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/team/members/?role=confirmateur'))
    expect(await screen.findByText('Aucun membre dans cette catégorie.')).toBeInTheDocument()
  })

  it('invites a new member via the modal and shows a confirmation banner', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/team/members/?role=admin') return Promise.resolve({ data: ADMINS })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('Karim B')
    await user.click(screen.getByRole('button', { name: /Ajouter/ }))

    await user.type(screen.getByPlaceholderText('Prénom'), 'Sara')
    await user.type(screen.getByPlaceholderText('Nom'), 'Z')
    await user.type(screen.getByPlaceholderText('Email'), 'sara@test.com')
    await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team/invite/', expect.objectContaining({
      first_name: 'Sara', last_name: 'Z', email: 'sara@test.com', role: 'admin',
    })))
    expect(await screen.findByText('Invitation envoyée par email.')).toBeInTheDocument()
  })

  it('pre-fills invite permissions from the role matrix and submits edited values', async () => {
    const user = userEvent.setup()
    const matrixData = {
      catalog: [
        { key: 'orders_view', label: 'Voir les commandes' },
        { key: 'finances_view', label: 'Voir les finances' },
      ],
      roles: ['admin', 'confirmateur', 'dropshipper'],
      matrix: {
        admin: { orders_view: true, finances_view: false },
        confirmateur: { orders_view: true, finances_view: false },
        dropshipper: { orders_view: true, finances_view: false },
      },
    }
    api.get.mockImplementation((url) => {
      if (url === '/team/members/?role=admin') return Promise.resolve({ data: ADMINS })
      if (url === '/team/permissions/') return Promise.resolve({ data: matrixData })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('Karim B')
    await user.click(screen.getByRole('button', { name: /Ajouter/ }))

    expect(await screen.findByLabelText('Voir les commandes')).toBeChecked()
    expect(screen.getByLabelText('Voir les finances')).not.toBeChecked()

    await user.click(screen.getByLabelText('Voir les finances'))

    await user.type(screen.getByPlaceholderText('Prénom'), 'Sara')
    await user.type(screen.getByPlaceholderText('Nom'), 'Z')
    await user.type(screen.getByPlaceholderText('Email'), 'sara@test.com')
    await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team/invite/', expect.objectContaining({
      permissions: expect.objectContaining({ orders_view: true, finances_view: true }),
    })))
  })

  it('shows a server error in the invite modal without crashing', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/team/members/?role=admin') return Promise.resolve({ data: ADMINS })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockRejectedValueOnce({ response: { data: { email: ['Cet email existe déjà.'] } } })
    renderPage()

    await screen.findByText('Karim B')
    await user.click(screen.getByRole('button', { name: /Ajouter/ }))

    await user.type(screen.getByPlaceholderText('Prénom'), 'Sara')
    await user.type(screen.getByPlaceholderText('Nom'), 'Z')
    await user.type(screen.getByPlaceholderText('Email'), 'sara@test.com')
    await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }))

    expect(await screen.findByText('Cet email existe déjà.')).toBeInTheDocument()
  })

  it('opens the per-member permissions modal, shows custom badge, and toggles a permission', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/team/members/?role=admin') return Promise.resolve({ data: ADMINS })
      if (url === '/team/members/1/permissions/') return Promise.resolve({
        data: { catalog: [
          { key: 'orders_view', label: 'Voir les commandes', enabled: true, is_custom: false },
          { key: 'finances_view', label: 'Voir les finances', enabled: true, is_custom: true },
        ] },
      })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({ data: { permissions: { orders_view: false, finances_view: true } } })
    renderPage()

    await screen.findByText('Karim B')
    await user.click(screen.getByRole('button', { name: 'Permissions' }))

    expect(await screen.findByText('Voir les finances')).toBeInTheDocument()
    expect(screen.getByText('Personnalisé')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Voir les commandes/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team/members/1/permissions/', {
      permission: 'orders_view', enabled: false,
    }))
  })
})
