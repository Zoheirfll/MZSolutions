import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ScanProductPage from '../../../pages/ai/ScanProductPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: {} })) } }))
vi.mock('../../../api/aiApi', () => ({ scanProduct: vi.fn() }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { team_role: null, permissions: {} } }) }))

function makeFile() {
  return new File(['contenu'], 'produit.jpg', { type: 'image/jpeg' })
}

describe('ScanProductPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upload une photo produit et redirige vers le formulaire pré-rempli', async () => {
    const { scanProduct } = await import('../../../api/aiApi')
    scanProduct.mockResolvedValue({ type: 'product', draft: { id: 1, extracted_data: { name: 'Casquette', price: 1200, description: '' } } })
    render(<MemoryRouter><ScanProductPage /></MemoryRouter>)
    const input = screen.getByLabelText(/choisir une image/i)
    fireEvent.change(input, { target: { files: [makeFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /analyser/i }))
    await waitFor(() => expect(scanProduct).toHaveBeenCalled())
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/dashboard/produits/nouveau',
      { state: { prefill: { name: 'Casquette', price: 1200, description: '' } } },
    ))
  })

  it('upload une facture multi-articles et redirige vers les brouillons', async () => {
    const { scanProduct } = await import('../../../api/aiApi')
    scanProduct.mockResolvedValue({ type: 'invoice', drafts: [{ id: 1 }, { id: 2 }] })
    render(<MemoryRouter><ScanProductPage /></MemoryRouter>)
    const input = screen.getByLabelText(/choisir une image/i)
    fireEvent.change(input, { target: { files: [makeFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /analyser/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/produits/brouillons-ia'))
  })

  it('affiche une erreur sans planter si le scan échoue', async () => {
    const { scanProduct } = await import('../../../api/aiApi')
    scanProduct.mockRejectedValue({ response: { data: { detail: 'Assistant IA indisponible' } } })
    render(<MemoryRouter><ScanProductPage /></MemoryRouter>)
    const input = screen.getByLabelText(/choisir une image/i)
    fireEvent.change(input, { target: { files: [makeFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /analyser/i }))
    expect(await screen.findByText('Assistant IA indisponible')).toBeInTheDocument()
  })
})
