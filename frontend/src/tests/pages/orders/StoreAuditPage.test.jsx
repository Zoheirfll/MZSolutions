import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import StoreAuditPage from '../../../pages/orders/StoreAuditPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import api from '../../../api/axios'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

const AUDIT_RESULT = {
  computed_at: '2026-09-11T10:00:00Z', global_score: 72,
  catalogue_score: 60, logistics_score: 85, stock_score: 90, returns_risk_score: 55,
  details: {
    catalogue: { score: 60, details: {
      active_products: 10, pct_with_image: 60, pct_with_description: 80, pct_with_cost_price: 70, pct_with_category: 90,
      missing_image: [{ id: 1, name: 'Produit Sans Image' }],
      missing_description: [], missing_cost_price: [], missing_category: [],
    } },
    logistics: { score: 85, details: {
      orders: 20, confirmation_rate: 85, pending_total: 3, late_pending: 1,
      late_orders: [{ id: 42, phone: '0555000000', created_at: '2026-09-09T10:00:00Z', hours_late: 48 }],
    } },
    stock: { score: 90, details: {
      active_products: 10, out_of_stock: 0, low_stock: 1,
      out_of_stock_products: [], low_stock_products: [{ id: 2, name: 'Produit Stock Bas', stock: 2 }],
    } },
    returns_risk: { score: 55, details: {
      return_rate: 10, at_risk_customers: 2, untreated_at_risk_customers: 1, products_at_loss: 1,
      untreated_customers: [{ phone: '0555111111', risky_count: 4 }],
      at_loss_products: [{ id: 3, name: 'Produit Vendu À Perte', price: '100', cost_price: '200' }],
    } },
  },
  synthesis: 'Points forts : bonne logistique.\nPoints faibles : catalogue incomplet.',
  ai_unavailable: false,
}

function mockGet(auditResponse) {
  api.get.mockImplementation((url) => {
    if (url.includes('/stores/me/audit/')) return auditResponse
    return Promise.resolve({ data: { count: 0 } })
  })
}

describe('StoreAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche le bouton "Analyser ma boutique" quand aucun audit n\'existe', async () => {
    mockGet(Promise.reject({ response: { status: 404 } }))
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Analyser ma boutique/ })).toBeInTheDocument()
  })

  it('affiche le score global et la synthèse après un audit existant', async () => {
    mockGet(Promise.resolve({ data: AUDIT_RESULT }))
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    expect(await screen.findByText('72')).toBeInTheDocument()
    expect(screen.getByText(/bonne logistique/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Réanalyser/ })).toBeInTheDocument()
  })

  it('relance un calcul au clic sur "Analyser ma boutique"', async () => {
    mockGet(Promise.reject({ response: { status: 404 } }))
    api.post.mockResolvedValueOnce({ data: AUDIT_RESULT })
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    const button = await screen.findByRole('button', { name: /Analyser ma boutique/ })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText('72')).toBeInTheDocument())
  })

  it('affiche un message si la synthèse IA est indisponible', async () => {
    mockGet(Promise.resolve({ data: { ...AUDIT_RESULT, synthesis: '', ai_unavailable: true } }))
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    expect(await screen.findByText('72')).toBeInTheDocument()
    expect(screen.getByText(/Synthèse indisponible/)).toBeInTheDocument()
  })

  it('rend le markdown de la synthèse (gras) au lieu des astérisques bruts', async () => {
    mockGet(Promise.resolve({ data: { ...AUDIT_RESULT, synthesis: '**Points forts**\nBonne logistique.' } }))
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    const strong = await screen.findByText('Points forts')
    expect(strong.tagName).toBe('STRONG')
  })

  it('déplie une section de dimension et affiche la liste concrète des produits concernés', async () => {
    mockGet(Promise.resolve({ data: AUDIT_RESULT }))
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    await screen.findByText('72')
    fireEvent.click(screen.getByText('Catalogue'))
    expect(await screen.findByText(/Produit Sans Image/)).toBeInTheDocument()
  })

  it('affiche la commande en retard dans la section Confirmation & logistique dépliée', async () => {
    mockGet(Promise.resolve({ data: AUDIT_RESULT }))
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    await screen.findByText('72')
    fireEvent.click(screen.getByText('Confirmation & logistique'))
    expect(await screen.findByText(/Commande #42/)).toBeInTheDocument()
  })

  it('affiche le client à risque non traité dans la section Retours & clients à risque dépliée', async () => {
    mockGet(Promise.resolve({ data: AUDIT_RESULT }))
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    await screen.findByText('72')
    fireEvent.click(screen.getByText('Retours & clients à risque'))
    expect(await screen.findByText(/0555111111/)).toBeInTheDocument()
  })
})
