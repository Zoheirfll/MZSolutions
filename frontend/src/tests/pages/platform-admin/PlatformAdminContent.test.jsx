import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminContentPage from '../../../pages/platform-admin/PlatformAdminContentPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))
import api from '../../../api/axios'
import { useAuth } from '../../../context/AuthContext'

const FAQ = [{ id: 1, question: 'Comment payer ?', answer: 'Par carte.', order: 0, is_active: true }]
const PAGES = [{ slug: 'terms', label: 'Conditions', title: '', body: '' }, { slug: 'privacy-policy', label: 'Confidentialité', title: '', body: '' }]

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.put.mockReset(); api.delete.mockReset()
  api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('faq') ? FAQ : PAGES }))
  api.post.mockResolvedValue({ data: {} }); api.put.mockResolvedValue({ data: {} }); api.delete.mockResolvedValue({})
  useAuth.mockReturnValue({ user: { platform_level: 'superadmin' } })
})

const show = () => render(<MemoryRouter><PlatformAdminContentPage /></MemoryRouter>)

describe('PlatformAdminContentPage', () => {
  it('creates a FAQ question', async () => {
    show()
    await waitFor(() => expect(screen.getByText('Comment payer ?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une question' }))
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Où est ma facture ?' } })
    fireEvent.change(screen.getByLabelText('Réponse'), { target: { value: 'Dans Abonnement.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la question' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/faq/', expect.objectContaining({ question: 'Où est ma facture ?' })))
  })

  it('saves a legal page', async () => {
    show()
    await waitFor(() => expect(screen.getByLabelText('Titre — terms')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Titre — terms'), { target: { value: 'CGU' } })
    fireEvent.change(screen.getByLabelText('Texte — terms'), { target: { value: 'Un texte légal suffisamment long.' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Enregistrer la page' })[0])
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/legal-pages/terms/', { title: 'CGU', body: 'Un texte légal suffisamment long.' }))
  })

  it('is read-only for a simple admin', async () => {
    useAuth.mockReturnValue({ user: { platform_level: 'admin' } })
    show()
    await waitFor(() => expect(screen.getByText('Comment payer ?')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Ajouter une question' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer la page' })).toBeNull()
  })
})
