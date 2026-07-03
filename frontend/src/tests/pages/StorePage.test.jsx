import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StorePage from '../../pages/StorePage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}))
import api from '../../api/axios'

const STORE = { name: 'Ma Boutique', slug: 'ma-boutique', description: 'Une belle boutique', phone: '0555000000', email: 'contact@boutique.com' }

function renderPage() {
  return render(
    <MemoryRouter>
      <StorePage />
    </MemoryRouter>
  )
}

describe('StorePage', () => {
  beforeAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('loads the store and fills the form with its data', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/') return Promise.resolve({ data: STORE })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()

    expect(await screen.findByDisplayValue('Ma Boutique')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Une belle boutique')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0555000000')).toBeInTheDocument()
    expect(screen.getByText('ma-boutique.mzsolutions.app')).toBeInTheDocument()
  })

  it('edits the name and saves, showing a success confirmation', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/') return Promise.resolve({ data: STORE })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.put.mockResolvedValueOnce({ data: { ...STORE, name: 'Nouvelle Boutique' } })
    renderPage()

    const nameInput = await screen.findByDisplayValue('Ma Boutique')
    await user.clear(nameInput)
    await user.type(nameInput, 'Nouvelle Boutique')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/me/', expect.objectContaining({ name: 'Nouvelle Boutique' })))
    expect(await screen.findByText('Modifications enregistrées')).toBeInTheDocument()
  })

  it('handles a failed save gracefully without crashing', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/') return Promise.resolve({ data: STORE })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.put.mockRejectedValueOnce({ response: { data: { detail: 'Erreur serveur.' } } })
    renderPage()

    await screen.findByDisplayValue('Ma Boutique')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(screen.queryByText('Modifications enregistrées')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
  })
})
