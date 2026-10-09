import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '../../../pages/landing/LandingPage'
import frLanding from '../../../i18n/locales/fr/landing.json'
import arLanding from '../../../i18n/locales/ar/landing.json'

const mockUseAuth = vi.fn()
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }))

function flatKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`])
}

function renderPage() {
  return render(<MemoryRouter><LandingPage /></MemoryRouter>)
}

describe('LandingPage', () => {
  it('affiche le titre principal et un appel à l\'action vers l\'inscription pour un visiteur', () => {
    mockUseAuth.mockReturnValue({ user: null })
    renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Confirmez, expédiez et encaissez/)
    const signupLinks = screen.getAllByRole('link').filter(a => a.getAttribute('href') === '/auth?tab=register')
    expect(signupLinks.length).toBeGreaterThan(1)
  })

  it('renvoie un utilisateur connecté vers son tableau de bord', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'a@b.dz' } })
    renderPage()
    expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === '/auth?tab=register')).toBe(false)
    expect(screen.getAllByRole('link').some(a => a.getAttribute('href') === '/dashboard')).toBe(true)
  })

  it('expose les sections ciblées par la navigation', () => {
    mockUseAuth.mockReturnValue({ user: null })
    const { container } = renderPage()
    for (const id of ['fonctionnalites', 'comment-ca-marche', 'faq']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('a la même liste de clés en français et en arabe', () => {
    expect(flatKeys(arLanding).sort()).toEqual(flatKeys(frLanding).sort())
  })
})
