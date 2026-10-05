import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import ServiceLayout from '../../../pages/platform-admin/ServiceLayout'

const auth = { user: { email: 'svc@mz.dz', is_service_admin: true } }
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn() }) }))

describe('ServiceLayout (service de confirmation)', () => {
  it('shows only the service links, none of the platform administration', () => {
    render(<MemoryRouter><ServiceLayout /></MemoryRouter>)
    expect(screen.getByText('Boutiques')).toBeInTheDocument()
    expect(screen.getByText('Confirmateurs')).toBeInTheDocument()
    expect(screen.queryByText('Paiements')).not.toBeInTheDocument()
    expect(screen.queryByText('Comptes')).not.toBeInTheDocument()
  })

  it('shows the confirmateur queue link for a confirmateur', () => {
    auth.user = { email: 'c@mz.dz', is_service_admin: true, is_platform_confirmateur: true }
    render(<MemoryRouter><ServiceLayout /></MemoryRouter>)
    expect(screen.getByText('Ma file de confirmation')).toBeInTheDocument()
  })
})
