import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'

const mockUseAuth = vi.fn()
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { count: 0 } })) },
}))
import api from '../../api/axios'

function renderLayout(user) {
  mockUseAuth.mockReturnValue({ user, logout: vi.fn() })
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardLayout title="Test">contenu</DashboardLayout>
    </MemoryRouter>
  )
}

describe('DashboardLayout — sidebar gated by permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('owner (no team_role, all permissions true from the server) sees full sections via fallback rules', async () => {
    // Le backend renvoie TOUJOURS toutes les permissions à `true` pour un
    // owner (pas de team_membership, accès total non configurable) — `can()`
    // côté frontend reste une simple lecture de `user.permissions`, sans
    // logique de repli propre à l'owner (core/permissions.py::get_effective_permissions).
    renderLayout({ email: 'owner@test.com', team_role: null, permissions: { store_view: true, dashboard_view: true, subscription_view: true } })
    await waitFor(() => expect(screen.getByText('Tableau de bord')).toBeInTheDocument())
    // Permissions par rôle is shown when !teamRole regardless of `can()` ;
    // Abonnement now requires the dedicated `subscription_view` permission
    // (audit_view/subscription_view added — no longer a bare !teamRole check).
    expect(screen.getByText('Permissions par rôle')).toBeInTheDocument()
    expect(screen.getByText('Abonnement')).toBeInTheDocument()
  })

  it('confirmateur with no granted permissions sees a minimal sidebar', async () => {
    renderLayout({ email: 'c@test.com', team_role: 'confirmateur', permissions: {} })
    await waitFor(() => expect(screen.getByText('Tableau de bord')).toBeInTheDocument())
    expect(screen.queryByText('Produits & Catégories')).not.toBeInTheDocument()
    expect(screen.queryByText('Clients')).not.toBeInTheDocument()
    expect(screen.queryByText('Boîte de réception')).not.toBeInTheDocument()
    expect(screen.queryByText('Permissions par rôle')).not.toBeInTheDocument()
    expect(screen.queryByText('Abonnement')).not.toBeInTheDocument()
  })

  it('confirmateur granted extra permissions sees the matching sections', async () => {
    // `complaints_view` a été retiré du catalogue (mort — les réclamations
    // legacy sont verrouillées owner/admin strict, remplacées par la Boîte
    // de réception unifiée gatée par `inbox_view`, voir CLAUDE.md "Audit de
    // cohérence de la matrice de permissions").
    renderLayout({
      email: 'c@test.com',
      team_role: 'confirmateur',
      permissions: { products_view: true, clients_view: true, inbox_view: true },
    })
    await waitFor(() => expect(screen.getByText('Produits & Catégories')).toBeInTheDocument())
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('Boîte de réception')).toBeInTheDocument()
  })

  it('dropshipper role shows dropshipper-specific links instead of the generic Dropshipping section', async () => {
    renderLayout({ email: 'd@test.com', team_role: 'dropshipper', permissions: { dropshipping_view: true } })
    await waitFor(() => expect(screen.getByText('Mes produits')).toBeInTheDocument())
    expect(screen.getByText('Mes commissions')).toBeInTheDocument()
    // Generic owner/admin Dropshipping link must not show for the dropshipper themself
    expect(screen.queryByText(/^Dropshipping$/)).not.toBeInTheDocument()
  })

  it('PARAMÈTRES section is hidden entirely when no relevant permission is granted', async () => {
    renderLayout({ email: 'c@test.com', team_role: 'confirmateur', permissions: {} })
    await waitFor(() => expect(screen.getByText('Tableau de bord')).toBeInTheDocument())
    expect(screen.queryByText('PARAMÈTRES')).not.toBeInTheDocument()
  })

  it('toggles the theme and persists it to localStorage', async () => {
    const user = userEvent.setup()
    localStorage.clear()
    renderLayout({ email: 'owner@test.com', team_role: null, permissions: { store_view: true } })

    const toggle = await screen.findByTestId('theme-toggle')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await user.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('mz-theme')).toBe('light')
  })
})
