import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DropshippersPage from '../../../pages/dropshipping/DropshippersPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <DropshippersPage />
    </MemoryRouter>
  )
}

const DROPSHIPPER = {
  id: 7, first_name: 'Sara', last_name: 'K', email: 'sara@test.dz',
  products_count: 4, total_earned: 10000, total_paid: 4000, balance: 6000,
}

describe('DropshippersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the dropshippers list once loaded', async () => {
    api.get.mockResolvedValue({ data: [DROPSHIPPER] })
    renderPage()
    expect(await screen.findByText('Sara K')).toBeInTheDocument()
    expect(screen.getByText('1 dropshipper actif')).toBeInTheDocument()
    expect(screen.getByText('6 000 DZD')).toBeInTheDocument()
  })

  it('navigates to detail page on Gérer click', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: [DROPSHIPPER] })
    renderPage()
    await screen.findByText('Sara K')
    await user.click(screen.getByRole('button', { name: 'Gérer' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/dropshipping/7')
  })

  it('shows an empty state when the request fails', async () => {
    api.get.mockRejectedValue(new Error('network error'))
    renderPage()
    expect(await screen.findByText('Aucun dropshipper')).toBeInTheDocument()
  })
})
