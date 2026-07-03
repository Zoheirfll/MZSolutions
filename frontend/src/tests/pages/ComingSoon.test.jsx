import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ComingSoon from '../../pages/ComingSoon'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))
vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { count: 0 } })) },
}))

function renderPage(props = {}) {
  return render(
    <MemoryRouter>
      <ComingSoon {...props} />
    </MemoryRouter>
  )
}

describe('ComingSoon', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the default title', () => {
    renderPage()
    expect(screen.getAllByText('Bientôt disponible').length).toBeGreaterThan(0)
  })

  it('renders a custom title when provided', () => {
    renderPage({ title: 'Fonctionnalité X' })
    expect(screen.getAllByText('Fonctionnalité X').length).toBeGreaterThan(0)
  })
})
