import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PrivateRoute from '../../components/PrivateRoute'

const mockUseAuth = vi.fn()
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderWithRoute() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<PrivateRoute><p>Secret content</p></PrivateRoute>} />
        <Route path="/auth" element={<p>Auth page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PrivateRoute', () => {
  it('shows a spinner while auth state is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true })
    renderWithRoute()
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()
    expect(screen.queryByText('Auth page')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'a@test.com' }, loading: false })
    renderWithRoute()
    expect(screen.getByText('Secret content')).toBeInTheDocument()
  })

  it('redirects to /auth when not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderWithRoute()
    expect(screen.getByText('Auth page')).toBeInTheDocument()
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()
  })
})
