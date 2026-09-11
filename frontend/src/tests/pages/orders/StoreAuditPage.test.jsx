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
    catalogue: { score: 60, details: { active_products: 10, pct_with_image: 60 } },
    logistics: { score: 85, details: { orders: 20, confirmation_rate: 85 } },
    stock: { score: 90, details: { active_products: 10, out_of_stock: 0, low_stock: 1 } },
    returns_risk: { score: 55, details: { return_rate: 10 } },
  },
  synthesis: 'Points forts : bonne logistique.\nPoints faibles : catalogue incomplet.',
  ai_unavailable: false,
}

describe('StoreAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockGet(auditResponse) {
    api.get.mockImplementation((url) => {
      if (url.includes('/stores/me/audit/')) return auditResponse
      return Promise.resolve({ data: { count: 0 } })
    })
  }

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
})
