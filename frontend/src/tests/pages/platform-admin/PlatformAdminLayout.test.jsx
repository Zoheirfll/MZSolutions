import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import PlatformAdminLayout from '../../../pages/platform-admin/PlatformAdminLayout'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { alerts: {} } }) } }))
const auth = { user: { email: 'a@b.c', platform_level: 'admin' } }
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn() }) }))

const renderLayout = () => render(<MemoryRouter><PlatformAdminLayout /></MemoryRouter>)

describe('PlatformAdminLayout', () => {
  it('hides superadmin-only links for a simple admin', () => {
    auth.user.platform_level = 'admin'
    renderLayout()
    expect(screen.getAllByText('Vue d’ensemble').length).toBeGreaterThan(0)
    expect(screen.queryByText('Confirmateurs')).not.toBeInTheDocument()
  })

  it('shows superadmin links for a superadmin', () => {
    auth.user.platform_level = 'superadmin'
    renderLayout()
    expect(screen.getAllByText('Confirmateurs').length).toBeGreaterThan(0)
  })
})
