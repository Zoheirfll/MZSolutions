import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import AIAssistantPage from '../../../pages/ai/AIAssistantPage'

vi.mock('../../../api/axios', () => ({
  default: {
    get: vi.fn((url) => {
      if (/\/ai\/conversations\/\d+\/?$/.test(url)) return Promise.resolve({ data: { id: 1, title: '', messages: [] } })
      if (url.includes('/ai/conversations/')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    }),
    post: vi.fn(() => Promise.resolve({ data: { conversation_id: 1, reply: 'Bonjour, je suis votre assistant.' } })),
  },
}))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('AIAssistantPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche le champ de saisie et envoie un message', async () => {
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'Combien de commandes ce mois-ci ?' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await waitFor(() => expect(screen.getByText(/Bonjour, je suis votre assistant/)).toBeInTheDocument())
  })
})
