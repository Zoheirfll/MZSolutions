import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StorefrontPagePage from '../../../pages/storefront/StorefrontPagePage'

vi.mock('../../../pages/storefront/StorefrontLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

vi.mock('../../../api/publicApi', () => ({
  default: { get: vi.fn() },
}))
import publicApi from '../../../api/publicApi'

vi.mock('../../../lib/sanitize', () => ({
  sanitizeHtml: vi.fn((html) => html),
}))
import { sanitizeHtml } from '../../../lib/sanitize'

const PAGE = { id: 1, title: 'À propos', content: '<p>Notre histoire</p><script>alert(1)</script>' }

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/store/demo/pages/a-propos']}>
      <Routes>
        <Route path="/store/:slug/pages/:pageSlug" element={<StorefrontPagePage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StorefrontPagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title and sanitized content after loading', async () => {
    publicApi.get.mockResolvedValueOnce({ data: PAGE })
    renderPage()

    expect(await screen.findByText('À propos')).toBeInTheDocument()
    expect(screen.getByText('Notre histoire')).toBeInTheDocument()
    expect(sanitizeHtml).toHaveBeenCalledWith(PAGE.content)
  })

  it('fetches the correct page URL from route params', async () => {
    publicApi.get.mockResolvedValueOnce({ data: PAGE })
    renderPage()

    await screen.findByText('À propos')
    expect(publicApi.get).toHaveBeenCalledWith('/store/demo/pages/a-propos/')
  })

  it('shows a "Page introuvable" state when the fetch fails', async () => {
    publicApi.get.mockRejectedValueOnce(new Error('not found'))
    renderPage()

    expect(await screen.findByText('Page introuvable')).toBeInTheDocument()
    expect(screen.getByText("← Retour à l'accueil")).toBeInTheDocument()
  })
})
