import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FileManagerPage from '../../../pages/boutique/FileManagerPage'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} }, logout: vi.fn() }),
}))

vi.mock('../../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../../../api/axios'

function renderPage() {
  return render(
    <MemoryRouter>
      <FileManagerPage />
    </MemoryRouter>
  )
}

describe('FileManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { count: 0 } })
  })

  it('shows an empty state when no files exist', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/media/folders/')) return Promise.resolve({ data: [] })
      if (url.startsWith('/media/files/')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('Aucun fichier dans ce dossier')).toBeInTheDocument()
  })

  it('renders folders and files', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/media/folders/')) return Promise.resolve({ data: [{ id: 1, name: 'Logos', file_count: 2 }] })
      if (url.startsWith('/media/files/')) return Promise.resolve({ data: [
        { id: 1, original_name: 'logo.png', mime_type: 'image/png', size: 2048, url: '/media/logo.png' },
      ] })
      return Promise.resolve({ data: { count: 0 } })
    })
    renderPage()
    expect(await screen.findByText('Logos')).toBeInTheDocument()
    expect(screen.getByText('logo.png')).toBeInTheDocument()
  })

  it('creates a new folder', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/media/folders/')) return Promise.resolve({ data: [] })
      if (url.startsWith('/media/files/')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({})
    renderPage()
    await screen.findByText('Aucun fichier dans ce dossier')

    await user.click(screen.getByRole('button', { name: '+ Nouveau dossier' }))
    await user.type(screen.getByPlaceholderText('Nom du dossier'), 'Bannières')
    await user.click(screen.getByRole('button', { name: '✓' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/media/folders/', { name: 'Bannières' }))
  })

  it('deletes a file after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.get.mockImplementation((url) => {
      if (url.startsWith('/media/folders/')) return Promise.resolve({ data: [] })
      if (url.startsWith('/media/files/')) return Promise.resolve({ data: [
        { id: 1, original_name: 'doc.pdf', mime_type: 'application/pdf', size: 1024, url: '/media/doc.pdf' },
      ] })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.delete.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('doc.pdf')
    await user.click(screen.getByText('✕'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/media/files/1/'))
    window.confirm.mockRestore()
  })
})
