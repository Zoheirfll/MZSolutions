import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import StorefrontChatWidget from '../../components/StorefrontChatWidget'

vi.mock('../../api/publicApi', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { messages: [] } })),
    post: vi.fn(() => Promise.resolve({ data: { reply: 'Bonjour, comment puis-je vous aider ?' } })),
  },
}))

describe('StorefrontChatWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it("s'ouvre au clic sur la bulle et affiche le champ de saisie", async () => {
    render(<StorefrontChatWidget slug="ma-boutique" />)
    fireEvent.click(screen.getByLabelText(/assistant/i))
    expect(await screen.findByPlaceholderText(/posez une question/i)).toBeInTheDocument()
  })

  it('envoie un message et affiche la réponse', async () => {
    render(<StorefrontChatWidget slug="ma-boutique" />)
    fireEvent.click(screen.getByLabelText(/assistant/i))
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'Avez-vous des chaises ?' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await waitFor(() => expect(screen.getByText(/Bonjour, comment puis-je vous aider/)).toBeInTheDocument())
  })

  it("affiche une erreur discrète si l'IA est indisponible", async () => {
    const publicApi = (await import('../../api/publicApi')).default
    publicApi.post.mockRejectedValueOnce({ response: { data: { detail: 'Assistant IA indisponible' } } })
    render(<StorefrontChatWidget slug="ma-boutique" />)
    fireEvent.click(screen.getByLabelText(/assistant/i))
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await waitFor(() => expect(screen.getByText('Assistant IA indisponible')).toBeInTheDocument())
  })
})
