import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CostsPage from '../../../pages/finance/CostsPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <CostsPage />
    </MemoryRouter>
  )
}

const COST = {
  id: 1, category: 'marketing', category_label: 'Marketing', label: 'Facebook Ads',
  amount: 15000, period_start: '2026-07-01', period_end: '2026-07-31', note: '',
}

describe('CostsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
  })

  it('renders the costs list and total once loaded', async () => {
    api.get.mockResolvedValue({ data: [COST] })
    renderPage()
    expect(await screen.findByText('Facebook Ads')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.tagName === 'TD' && el.textContent.replace(/\s/g, ' ') === '15 000 DZD')).toBeInTheDocument()
  })

  it('adds a new cost via the modal', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: [] })
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('Aucun coût saisi.')
    await user.click(screen.getByRole('button', { name: /Ajouter un coût/ }))

    await user.type(screen.getByPlaceholderText('Ex : Facebook Ads, Loyer local…'), 'Loyer')
    await user.type(screen.getByPlaceholderText('0'), '5000')
    const [start, end] = document.querySelectorAll('input[type="date"]')
    await user.type(start, '2026-07-01')
    await user.type(end, '2026-07-31')

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/finance/costs/', expect.objectContaining({
      label: 'Loyer', amount: '5000', period_start: '2026-07-01', period_end: '2026-07-31',
    })))
  })

  it('shows a field error when adding a cost fails', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: [] })
    api.post.mockRejectedValueOnce({ response: { data: { label: 'Ce champ est requis.' } } })
    renderPage()

    await screen.findByText('Aucun coût saisi.')
    await user.click(screen.getByRole('button', { name: /Ajouter un coût/ }))
    await user.type(screen.getByPlaceholderText('Ex : Facebook Ads, Loyer local…'), 'Loyer')
    const [start, end] = document.querySelectorAll('input[type="date"]')
    await user.type(start, '2026-07-01')
    await user.type(end, '2026-07-31')
    await user.type(screen.getByPlaceholderText('0'), '5000')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Ce champ est requis.')).toBeInTheDocument()
  })
})
