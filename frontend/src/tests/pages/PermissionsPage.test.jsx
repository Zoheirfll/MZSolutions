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
  catalog: [{ key: 'orders_view', label: 'Voir les commandes', category: 'Permissions de test', subcategory: 'Général' }],
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

// Le catalogue est désormais rendu dans un accordéon replié par catégorie
// (`CategoryAccordion`, pages/PermissionsPage.jsx) — il faut d'abord déplier
// la catégorie avant que le libellé de la permission ne soit visible.
async function expandCategory(user, categoryName = 'Permissions de test') {
  await screen.findByText(categoryName)
  await user.click(screen.getByRole('button', { name: new RegExp(categoryName) }))
}

describe('PermissionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('renders the permission matrix once loaded, category expandable', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/team/permissions/') return Promise.resolve({ data: MATRIX_DATA })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    await expandCategory(user)
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

    await expandCategory(user)
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
    renderPage()

    await expandCategory(user)
    await screen.findByText('Voir les commandes')
    const toggles = screen.getAllByRole('button', { name: /Désactivé — cliquer pour activer/ })
    await user.click(toggles[0])

    expect(await screen.findByText('Erreur serveur.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Désactivé — cliquer pour activer/ }).length).toBe(2))
  })

  it('switches to a member and shows their individual permissions with a custom badge', async () => {
    const user = userEvent.setup()
    const MEMBERS = [
      { id: 7, first_name: 'Sara', last_name: 'Z', role: 'confirmateur' },
    ]
    api.get.mockImplementation((url) => {
      if (url === '/team/permissions/') return Promise.resolve({ data: MATRIX_DATA })
      if (url === '/team/members/') return Promise.resolve({ data: MEMBERS })
      if (url === '/team/members/7/permissions/') return Promise.resolve({
        data: { catalog: [
          { key: 'orders_view', label: 'Voir les commandes', category: 'Permissions de test', subcategory: 'Général', enabled: false, is_custom: true },
        ] },
      })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    await user.click(screen.getByRole('button', { name: /Tous les rôles/ }))
    await user.click(screen.getByText('Sara Z (Confirmateur)'))

    await expandCategory(user)
    expect(await screen.findByText('Voir les commandes')).toBeInTheDocument()
    expect(screen.getByText('Personnalisé')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Désactivé — cliquer pour activer/ })).toBeInTheDocument()
  })

  it('toggles an individual member permission via the dedicated endpoint', async () => {
    const user = userEvent.setup()
    const MEMBERS = [
      { id: 7, first_name: 'Sara', last_name: 'Z', role: 'confirmateur' },
    ]
    api.get.mockImplementation((url) => {
      if (url === '/team/permissions/') return Promise.resolve({ data: MATRIX_DATA })
      if (url === '/team/members/') return Promise.resolve({ data: MEMBERS })
      if (url === '/team/members/7/permissions/') return Promise.resolve({
        data: { catalog: [
          { key: 'orders_view', label: 'Voir les commandes', category: 'Permissions de test', subcategory: 'Général', enabled: false, is_custom: false },
        ] },
      })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({ data: { permissions: { orders_view: true } } })
    renderPage()

    await user.click(screen.getByRole('button', { name: /Tous les rôles/ }))
    await user.click(screen.getByText('Sara Z (Confirmateur)'))

    await expandCategory(user)
    await screen.findByText('Voir les commandes')
    await user.click(screen.getByRole('button', { name: /Désactivé — cliquer pour activer/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team/members/7/permissions/', {
      permission: 'orders_view', enabled: true,
    }))
  })
})
