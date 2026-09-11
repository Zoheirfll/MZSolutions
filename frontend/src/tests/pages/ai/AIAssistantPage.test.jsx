import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import AIAssistantPage from '../../../pages/ai/AIAssistantPage'

vi.mock('../../../api/axios', () => ({
  default: {
    get: vi.fn((url) => {
      if (/\/ai\/conversations\/\d+\/?$/.test(url)) return Promise.resolve({ data: { id: 1, title: '', messages: [] } })
      if (url.includes('/ai/conversations/')) return Promise.resolve({ data: [{ id: 1, title: 'Ancienne conversation' }] })
      return Promise.resolve({ data: { count: 0 } })
    }),
    post: vi.fn(() => Promise.resolve({ data: { conversation_id: 1, reply: 'Bonjour, je suis votre assistant.' } })),
    delete: vi.fn(() => Promise.resolve({})),
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

  it('affiche une modale de confirmation stylée (pas de window.confirm natif) et supprime au clic', async () => {
    const axios = (await import('../../../api/axios')).default
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    await screen.findByText('Ancienne conversation')
    fireEvent.click(screen.getByLabelText('Supprimer la conversation'))
    expect(await screen.findByText('Supprimer cette conversation ?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/ai/conversations/1/'))
    await waitFor(() => expect(screen.queryByText('Ancienne conversation')).not.toBeInTheDocument())
  })

  it('ne supprime rien si on annule dans la modale', async () => {
    const axios = (await import('../../../api/axios')).default
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    await screen.findByText('Ancienne conversation')
    fireEvent.click(screen.getByLabelText('Supprimer la conversation'))
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }))
    expect(axios.delete).not.toHaveBeenCalled()
    expect(screen.getByText('Ancienne conversation')).toBeInTheDocument()
    expect(screen.queryByText('Supprimer cette conversation ?')).not.toBeInTheDocument()
  })

  it('filtre les conversations par titre via la recherche', async () => {
    const axios = (await import('../../../api/axios')).default
    axios.get.mockImplementation((url) => {
      if (/\/ai\/conversations\/\d+\/?$/.test(url)) return Promise.resolve({ data: { id: 1, title: '', messages: [] } })
      if (url.includes('/ai/conversations/')) return Promise.resolve({ data: [
        { id: 1, title: 'Question sur le stock' },
        { id: 2, title: 'Question sur les retours' },
      ] })
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    await screen.findByText('Question sur le stock')
    fireEvent.change(screen.getByPlaceholderText(/Rechercher une conversation/i), { target: { value: 'retours' } })
    expect(screen.queryByText('Question sur le stock')).not.toBeInTheDocument()
    expect(screen.getByText('Question sur les retours')).toBeInTheDocument()
  })

  it("affiche une carte de proposition et confirme l'action au clic", async () => {
    const axios = (await import('../../../api/axios')).default
    axios.post.mockImplementation((url) => {
      if (url === '/ai/chat/') {
        return Promise.resolve({ data: {
          conversation_id: 1, reply: '',
          pending_action: {
            id: 42, tool_name: 'propose_update_product', status: 'pending',
            summary: 'Modifier « T-shirt » : prix 2000 → 1800',
            payload: [{ id: 1, name: 'T-shirt', before: { price: 2000 }, after: { price: 1800 } }],
          },
        } })
      }
      if (url === '/ai/pending-actions/42/confirm/') return Promise.resolve({ data: { status: 'confirmed' } })
      return Promise.resolve({ data: {} })
    })
    const pendingAction = {
      id: 42, tool_name: 'propose_update_product', status: 'pending',
      summary: 'Modifier « T-shirt » : prix 2000 → 1800',
      payload: [{ id: 1, name: 'T-shirt', before: { price: 2000 }, after: { price: 1800 } }],
    }
    axios.get.mockImplementation((url) => {
      if (/\/ai\/conversations\/\d+\/?$/.test(url)) {
        return Promise.resolve({ data: { id: 1, title: '', messages: [
          { role: 'user', content: 'Baisse le prix du T-shirt à 1800' },
          { role: 'assistant', content: '', pending_action: pendingAction },
        ] } })
      }
      if (url.includes('/ai/conversations/')) return Promise.resolve({ data: [{ id: 1, title: 'Ancienne conversation' }] })
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'Baisse le prix du T-shirt à 1800' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await screen.findByText(/Modifier « T-shirt »/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/ai/pending-actions/42/confirm/'))
    await waitFor(() => expect(screen.getByText('Confirmé')).toBeInTheDocument())
  })

  it('rejette une proposition au clic sur Rejeter', async () => {
    const axios = (await import('../../../api/axios')).default
    axios.post.mockImplementation((url) => {
      if (url === '/ai/chat/') {
        return Promise.resolve({ data: {
          conversation_id: 1, reply: '',
          pending_action: { id: 7, tool_name: 'propose_update_product', status: 'pending', summary: 'Modifier « X »', payload: [] },
        } })
      }
      if (url === '/ai/pending-actions/7/reject/') return Promise.resolve({ data: { status: 'rejected' } })
      return Promise.resolve({ data: {} })
    })
    const pendingAction = { id: 7, tool_name: 'propose_update_product', status: 'pending', summary: 'Modifier « X »', payload: [] }
    axios.get.mockImplementation((url) => {
      if (/\/ai\/conversations\/\d+\/?$/.test(url)) {
        return Promise.resolve({ data: { id: 1, title: '', messages: [
          { role: 'user', content: 'Modifie X' },
          { role: 'assistant', content: '', pending_action: pendingAction },
        ] } })
      }
      if (url.includes('/ai/conversations/')) return Promise.resolve({ data: [{ id: 1, title: 'Ancienne conversation' }] })
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'Modifie X' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await screen.findByText('Modifier « X »')
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter' }))
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/ai/pending-actions/7/reject/'))
    await waitFor(() => expect(screen.getByText('Rejeté')).toBeInTheDocument())
  })
})
