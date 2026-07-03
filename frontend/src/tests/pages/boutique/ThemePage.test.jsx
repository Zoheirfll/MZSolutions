import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ThemePage from '../../../pages/boutique/ThemePage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {}, store_slug: 'demo', store_name: 'Ma Boutique' }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemePage />
    </MemoryRouter>
  )
}

describe('ThemePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('loads current theme settings and shows the live preview once loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/settings/') return Promise.resolve({ data: { theme_template: 'violet', theme_font: 'inter' } })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('Aperçu en direct')).toBeInTheDocument()
  })

  it('switches template selection', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/settings/') return Promise.resolve({ data: {} })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    await screen.findByText('Template')
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('saves theme settings and shows a confirmation', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/stores/me/settings/') return Promise.resolve({ data: {} })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.put.mockResolvedValueOnce({})
    renderPage()
    await screen.findByText('Template')
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/me/settings/', expect.any(Object)))
    expect(await screen.findByText('✓ Enregistré')).toBeInTheDocument()
  })
})
