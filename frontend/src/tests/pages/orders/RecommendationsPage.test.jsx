import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import RecommendationsPage from '../../../pages/orders/RecommendationsPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import api from '../../../api/axios'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('RecommendationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url) => {
      if (url.includes('/promote/'))  return Promise.resolve({ data: { results: [
        { product_id: 1, product_name: 'Produit A', margin_pct: 0.6, total_stock: 40, sales_rate_14d: 0.2, score: 100 },
      ] } })
      if (url.includes('/trending/')) return Promise.resolve({ data: { results: [
        { product_id: 2, product_name: 'Produit B', recent_rate: 5, prior_rate: 1, growth: 4 },
      ] } })
      if (url.includes('/bundles/'))  return Promise.resolve({ data: { results: [
        { product_id_a: 1, product_name_a: 'Produit A', product_id_b: 2, product_name_b: 'Produit B', count: 3 },
      ] } })
      return Promise.resolve({ data: { count: 0 } })
    })
  })

  it('affiche les 3 sections avec leurs données', async () => {
    render(<MemoryRouter><RecommendationsPage /></MemoryRouter>)
    expect(await screen.findByText('Produit A')).toBeInTheDocument()
    expect(await screen.findByText('Produit B')).toBeInTheDocument()
  })

  it('affiche l\'explication IA au clic sur "Pourquoi ce produit ?"', async () => {
    api.post.mockResolvedValueOnce({ data: { explanation: 'Bonne marge, stock élevé.' } })
    render(<MemoryRouter><RecommendationsPage /></MemoryRouter>)
    await screen.findByText('Produit A')
    const buttons = await screen.findAllByText('Pourquoi ce produit ?')
    fireEvent.click(buttons[0])
    await waitFor(() => expect(screen.getByText('Bonne marge, stock élevé.')).toBeInTheDocument())
  })

  it('affiche un message si aucune donnée n\'est disponible', async () => {
    api.get.mockImplementation(() => Promise.resolve({ data: { results: [] } }))
    render(<MemoryRouter><RecommendationsPage /></MemoryRouter>)
    expect(await screen.findByText('Aucun candidat pour le moment.')).toBeInTheDocument()
  })
})
