import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

  it('envoie une suggestion au clic sans passer par le champ de saisie', async () => {
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    const suggestion = await screen.findByText('Quel est mon stock bas ?')
    fireEvent.click(suggestion)
    const chat = screen.getByTestId('chat-messages')
    await waitFor(() => expect(within(chat).getByText(/Bonjour, je suis votre assistant/)).toBeInTheDocument())
    expect(within(chat).getByText('Quel est mon stock bas ?')).toBeInTheDocument()
  })

  it('rend le markdown de la réponse (gras)', async () => {
    const axios = (await import('../../../api/axios')).default
    axios.post.mockResolvedValueOnce({ data: { conversation_id: 1, reply: 'Vous avez **3 produits** en stock bas.' } })
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'stock ?' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await waitFor(() => expect(document.querySelector('.ai-prose strong')).toHaveTextContent('3 produits'))
  })
})
