import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ComplaintDetailPage from '../../../pages/orders/ComplaintDetailPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: '7' }) }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: 'admin', permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../../api/axios'

const COMPLAINT = {
  id: 7, order: 42, order_display: '#42', order_phone: '0555111222',
  subject: 'Article endommagé', description: "L'article était cassé à la livraison.",
  status: 'open', status_label: 'Ouverte', created_at: '2026-07-01T10:00:00Z',
  messages: [{ id: 1, author_name: 'Client', status: 'open', status_label: 'Ouverte', message: "L'article était cassé à la livraison.", created_at: '2026-07-01T10:00:00Z' }],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ComplaintDetailPage />
    </MemoryRouter>
  )
}

describe('ComplaintDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading then renders the complaint with its message history', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/orders/complaints/7/') return Promise.resolve({ data: COMPLAINT })
      return Promise.resolve({ data: {} })
    })
    renderPage()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    expect(await screen.findByText('Article endommagé')).toBeInTheDocument()
    expect(screen.getAllByText("L'article était cassé à la livraison.").length).toBeGreaterThan(0)
  })

  it('adds a new message without changing the status', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/orders/complaints/7/') return Promise.resolve({ data: COMPLAINT })
      return Promise.resolve({ data: [] })
    })
    const updated = { ...COMPLAINT, messages: [...COMPLAINT.messages, { id: 2, author_name: 'Vendeur', status: null, status_label: '', message: 'Nous traitons votre demande.', created_at: '2026-07-02T10:00:00Z' }] }
    api.post.mockResolvedValueOnce({ data: updated })
    renderPage()
    await screen.findByText('Article endommagé')

    await user.type(screen.getByPlaceholderText('Répondre au client…'), 'Nous traitons votre demande.')
    await user.click(screen.getByRole('button', { name: 'Ajouter le message' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/orders/complaints/7/messages/',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ))
    expect(await screen.findByText('Nous traitons votre demande.')).toBeInTheDocument()
  })

  it('shows a not-found message when the complaint fails to load', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/orders/complaints/7/') return Promise.reject(new Error('not found'))
      return Promise.resolve({ data: {} })
    })
    renderPage()
    expect(await screen.findByText('Réclamation introuvable.')).toBeInTheDocument()
  })
})
