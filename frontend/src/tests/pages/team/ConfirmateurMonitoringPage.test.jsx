import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ConfirmateurMonitoringPage from '../../../pages/team/ConfirmateurMonitoringPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import api from '../../../api/axios'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

const OVERVIEW = { results: [
  { member_id: 1, name: 'Sara Confirmatrice', score: 78, orders_assigned: 40, flags: [] },
  { member_id: 2, name: 'Karim Confirmateur', score: 35, orders_assigned: 5, flags: ['high_late_ratio', 'high_cancellation'] },
] }

const DETAIL = {
  member_id: 2, name: 'Karim Confirmateur', score: 35, confirmation_rate: 40.0,
  late_ratio: 0.6, call_failure_rate: 0.3, orders_assigned: 5, cancellation_return_rate: 60.0,
  flags: ['high_late_ratio', 'high_cancellation'],
}

function mockGet() {
  api.get.mockImplementation((url) => {
    if (url.includes('/team/monitoring/2/')) return Promise.resolve({ data: DETAIL })
    if (url.includes('/team/monitoring/')) return Promise.resolve({ data: OVERVIEW })
    return Promise.resolve({ data: { count: 0 } })
  })
}

describe('ConfirmateurMonitoringPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche le tableau des confirmateurs avec score et drapeaux', async () => {
    mockGet()
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    expect(await screen.findByText('Sara Confirmatrice')).toBeInTheDocument()
    expect(screen.getByText('Karim Confirmateur')).toBeInTheDocument()
  })

  it('déplie la fiche détaillée au clic sur une ligne', async () => {
    mockGet()
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    await screen.findByText('Karim Confirmateur')
    fireEvent.click(screen.getByText('Karim Confirmateur'))
    expect(await screen.findByText(/40%/)).toBeInTheDocument()
  })

  it('affiche la synthèse IA individuelle au clic sur Analyser', async () => {
    mockGet()
    api.post.mockResolvedValueOnce({ data: { explanation: 'Ce confirmateur a des retards fréquents.' } })
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    await screen.findByText('Karim Confirmateur')
    fireEvent.click(screen.getByText('Karim Confirmateur'))
    await screen.findByText(/40%/)
    fireEvent.click(screen.getByRole('button', { name: /Analyser$/ }))
    await waitFor(() => expect(screen.getByText(/retards fréquents/)).toBeInTheDocument())
  })

  it('affiche la synthèse IA équipe au clic sur "Analyser l\'équipe"', async () => {
    mockGet()
    api.post.mockResolvedValueOnce({ data: { explanation: "Sara se démarque positivement, Karim nécessite de l'attention." } })
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    await screen.findByText('Sara Confirmatrice')
    fireEvent.click(screen.getByRole('button', { name: /Analyser l'équipe/ }))
    await waitFor(() => expect(screen.getByText(/nécessite de l'attention/)).toBeInTheDocument())
  })

  it('filtre par nom via la recherche', async () => {
    mockGet()
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    await screen.findByText('Sara Confirmatrice')
    fireEvent.change(screen.getByPlaceholderText(/Rechercher un confirmateur/i), { target: { value: 'Karim' } })
    expect(screen.queryByText('Sara Confirmatrice')).not.toBeInTheDocument()
    expect(screen.getByText('Karim Confirmateur')).toBeInTheDocument()
  })

  it('filtre sur "Avec alerte" uniquement', async () => {
    mockGet()
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    await screen.findByText('Sara Confirmatrice')
    fireEvent.click(screen.getByText('Tous'))
    fireEvent.click(screen.getByText('Avec alerte'))
    expect(screen.queryByText('Sara Confirmatrice')).not.toBeInTheDocument()
    expect(screen.getByText('Karim Confirmateur')).toBeInTheDocument()
  })
})
