import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../context/AuthContext'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../api/axios'

function Probe() {
  const { user, loading, login, logout, register } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <button onClick={() => login('a@test.com', 'pw')}>login</button>
      <button onClick={() => register({ email: 'a@test.com' })}>register</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

// Depuis la migration cookies httpOnly (Epic 8.6 TBD), le token JWT n'est
// plus jamais lisible/stocké côté JS (localStorage) — AuthProvider interroge
// systématiquement /auth/me/ au montage, le cookie (invisible ici, géré par
// le navigateur) est envoyé automatiquement s'il existe.
describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls /auth/me/ on mount and sets user when a session cookie is valid', async () => {
    api.get.mockResolvedValueOnce({ data: { email: 'stored@test.com' } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('stored@test.com'))
    expect(api.get).toHaveBeenCalledWith('/auth/me/')
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('resolves to loading=false with no user when /auth/me/ fails (no/expired session)', async () => {
    api.get.mockRejectedValueOnce(new Error('401'))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  it('login sets the user from the response body (tokens stay in httpOnly cookies, never read here)', async () => {
    api.get.mockRejectedValueOnce(new Error('401'))
    api.post.mockResolvedValueOnce({ data: { user: { email: 'a@test.com' } } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    screen.getByText('login').click()
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@test.com'))
    expect(api.post).toHaveBeenCalledWith('/auth/login/', { email: 'a@test.com', password: 'pw' })
  })

  it('logout blacklists the refresh token server-side (via cookie, no body) then clears local state', async () => {
    api.get.mockResolvedValueOnce({ data: { email: 'x@test.com' } })
    api.post.mockResolvedValueOnce({})
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('x@test.com'))

    screen.getByText('logout').click()
    expect(api.post).toHaveBeenCalledWith('/auth/logout/')
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'))
  })

  it('logout still clears local state even if the server call fails', async () => {
    api.get.mockResolvedValueOnce({ data: { email: 'x@test.com' } })
    api.post.mockRejectedValueOnce(new Error('network error'))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('x@test.com'))

    screen.getByText('logout').click()
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'))
  })
})
