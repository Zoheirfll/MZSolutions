import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PermissionsPage from '../../pages/PermissionsPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: { store_view: true } }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../api/axios'

const MATRIX_DATA = {
  roles: ['admin', 'confirmateur', 'dropshipper'],
  catalog: [{ key: 'orders_view', label: 'Voir les commandes' }],
  matrix: {
    admin: { orders_view: true },
    confirmateur: { orders_view: false },
    dropshipper: { orders_view: false },
  },
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PermissionsPage />
    </MemoryRouter>
  )
}

describe('PermissionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the permission matrix once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/team/permissions/') return Promise.resolve({ data: MATRIX_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('Voir les commandes')).toBeInTheDocument()
    expect(screen.getByText('Confirmateur')).toBeInTheDocument()
  })

  it('toggles a permission optimistically and persists it via POST', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/team/permissions/') return Promise.resolve({ data: MATRIX_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('Voir les commandes')
    const toggles = screen.getAllByRole('button', { name: /Désactivé — cliquer pour activer/ })
    await user.click(toggles[0])

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team/permissions/', {
      role: 'confirmateur', permission: 'orders_view', enabled: true,
    }))
  })

  it('reverts the toggle if the server call fails', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/team/permissions/') return Promise.resolve({ data: MATRIX_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Erreur serveur.' } } })
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderPage()

    await screen.findByText('Voir les commandes')
    const toggles = screen.getAllByRole('button', { name: /Désactivé — cliquer pour activer/ })
    await user.click(toggles[0])

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Erreur serveur.'))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Désactivé — cliquer pour activer/ }).length).toBe(2))
    alertSpy.mockRestore()
  })
})
