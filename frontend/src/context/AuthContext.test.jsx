import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../api/axios'

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

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('loading resolves to false immediately with no stored token', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  it('fetches /auth/me/ and sets user when a token is stored', async () => {
    localStorage.setItem('access', 'fake-token')
    api.get.mockResolvedValueOnce({ data: { email: 'stored@test.com' } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('stored@test.com'))
    expect(api.get).toHaveBeenCalledWith('/auth/me/')
  })

  it('clears tokens if /auth/me/ fails (invalid/expired token)', async () => {
    localStorage.setItem('access', 'bad-token')
    localStorage.setItem('refresh', 'bad-refresh')
    api.get.mockRejectedValueOnce(new Error('401'))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(localStorage.getItem('access')).toBeNull()
    expect(localStorage.getItem('refresh')).toBeNull()
  })

  it('login stores tokens and sets user', async () => {
    api.post.mockResolvedValueOnce({ data: { access: 'AT', refresh: 'RT', user: { email: 'a@test.com' } } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    screen.getByText('login').click()
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@test.com'))
    expect(localStorage.getItem('access')).toBe('AT')
    expect(localStorage.getItem('refresh')).toBe('RT')
  })

  it('logout blacklists refresh token server-side then clears local state', async () => {
    localStorage.setItem('access', 'AT')
    localStorage.setItem('refresh', 'RT')
    api.get.mockResolvedValueOnce({ data: { email: 'x@test.com' } })
    api.post.mockResolvedValueOnce({})
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('x@test.com'))

    screen.getByText('logout').click()
    expect(api.post).toHaveBeenCalledWith('/auth/logout/', { refresh: 'RT' })
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'))
    expect(localStorage.getItem('access')).toBeNull()
  })

  it('logout still clears local state even if server call fails', async () => {
    localStorage.setItem('access', 'AT')
    localStorage.setItem('refresh', 'RT')
    api.get.mockResolvedValueOnce({ data: { email: 'x@test.com' } })
    api.post.mockRejectedValueOnce(new Error('network error'))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('x@test.com'))

    screen.getByText('logout').click()
    await waitFor(() => expect(localStorage.getItem('access')).toBeNull())
  })
})
