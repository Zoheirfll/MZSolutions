import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ProductDraftsPage from '../../../pages/products/ProductDraftsPage'

vi.mock('../../../api/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../../api/aiApi', () => ({
  listProductDrafts: vi.fn(() => Promise.resolve([
    { id: 1, extracted_data: { name: 'Casquette', price: 1200 }, status: 'pending_review', created_at: '2026-09-11' },
    { id: 2, extracted_data: { name: 'Sac à dos', price: 3500 }, status: 'pending_review', created_at: '2026-09-11' },
  ])),
  createProductFromDraft: vi.fn(() => Promise.resolve({ id: 10, name: 'Casquette' })),
  discardProductDraft: vi.fn(() => Promise.resolve({ status: 'discarded' })),
}))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('ProductDraftsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche les brouillons en attente', async () => {
    render(<MemoryRouter><ProductDraftsPage /></MemoryRouter>)
    expect(await screen.findByText('Casquette')).toBeInTheDocument()
    expect(screen.getByText('Sac à dos')).toBeInTheDocument()
  })

  it('crée les produits sélectionnés', async () => {
    const { createProductFromDraft } = await import('../../../api/aiApi')
    render(<MemoryRouter><ProductDraftsPage /></MemoryRouter>)
    await screen.findByText('Casquette')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: /créer les produits sélectionnés/i }))
    await waitFor(() => expect(createProductFromDraft).toHaveBeenCalledWith(1))
  })

  it('rejette un brouillon', async () => {
    const { discardProductDraft } = await import('../../../api/aiApi')
    render(<MemoryRouter><ProductDraftsPage /></MemoryRouter>)
    await screen.findByText('Casquette')
    fireEvent.click(screen.getAllByLabelText('Rejeter ce brouillon')[0])
    await waitFor(() => expect(discardProductDraft).toHaveBeenCalledWith(1))
  })

  it("affiche un état vide s'il n'y a aucun brouillon", async () => {
    const { listProductDrafts } = await import('../../../api/aiApi')
    listProductDrafts.mockResolvedValueOnce([])
    render(<MemoryRouter><ProductDraftsPage /></MemoryRouter>)
    expect(await screen.findByText(/aucun brouillon/i)).toBeInTheDocument()
  })
})
