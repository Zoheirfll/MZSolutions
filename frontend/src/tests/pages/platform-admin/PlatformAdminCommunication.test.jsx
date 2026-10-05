import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminAnnouncementsPage from '../../../pages/platform-admin/PlatformAdminAnnouncementsPage'
import PlatformAdminMessagesPage from '../../../pages/platform-admin/PlatformAdminMessagesPage'
import PlatformAdminIntegrationsPage from '../../../pages/platform-admin/PlatformAdminIntegrationsPage'
import AnnouncementBanner from '../../../components/AnnouncementBanner'
import ContactPage from '../../../pages/ContactPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('../../../components/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }))
import api from '../../../api/axios'

const wrap = (el) => render(<MemoryRouter>{el}</MemoryRouter>)
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.put.mockReset(); localStorage.clear() })

describe('PlatformAdminAnnouncementsPage', () => {
  const LIST = { results: [{ id: 1, title: 'Maintenance', body: 'Samedi soir.', audience: 'all', level: 'info', is_active: true, emailed_count: 0, created_at: '2026-10-01T10:00:00Z' }] }

  it('lists announcements and deactivates one', async () => {
    api.get.mockResolvedValue({ data: LIST })
    api.put.mockResolvedValue({ data: {} })
    wrap(<PlatformAdminAnnouncementsPage />)
    await waitFor(() => expect(screen.getByText('Maintenance')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/announcements/1/', { is_active: false }))
  })

  it('publishes without email', async () => {
    api.get.mockResolvedValue({ data: LIST })
    api.post.mockResolvedValue({ data: {} })
    wrap(<PlatformAdminAnnouncementsPage />)
    await waitFor(() => expect(screen.getByText('Maintenance')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle annonce' }))
    const publish = screen.getByRole('button', { name: 'Publier' })
    expect(publish).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Titre'), { target: { value: 'Nouveauté' } })
    fireEvent.change(screen.getByPlaceholderText('Message'), { target: { value: 'Une nouvelle page existe.' } })
    fireEvent.click(publish)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/announcements/', expect.objectContaining({ title: 'Nouveauté', send_email: false })))
  })

  it('shows the exact recipient count and sends it as confirm_count when emailing', async () => {
    api.get.mockResolvedValue({ data: LIST })
    api.post.mockImplementation((url) => Promise.resolve({ data: url.includes('preview') ? { stores: 3, emails: 3, max: 2000 } : {} }))
    wrap(<PlatformAdminAnnouncementsPage />)
    await waitFor(() => expect(screen.getByText('Maintenance')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle annonce' }))
    fireEvent.change(screen.getByPlaceholderText('Titre'), { target: { value: 'Info' } })
    fireEvent.change(screen.getByPlaceholderText('Message'), { target: { value: 'Texte.' } })
    fireEvent.click(screen.getByLabelText('Envoyer aussi par email'))
    await waitFor(() => expect(screen.getByText(/3 email\(s\) seront envoyés/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Publier et envoyer' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/announcements/', expect.objectContaining({ send_email: true, confirm_count: 3 })))
  })
})

describe('PlatformAdminMessagesPage', () => {
  const LIST = { count: 1, new_count: 1, results: [{ id: 4, store_id: 7, store_name: 'Boutique Alpha', owner_email: 'o@alpha.dz', subject: 'Paiement bloqué', status: 'new', created_at: '2026-10-03T10:00:00Z' }] }

  it('opens a message, shows its body and marks it handled', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/4/') ? { ...LIST.results[0], body: 'Mon paiement échoue.' } : LIST }))
    api.put.mockResolvedValue({ data: {} })
    wrap(<PlatformAdminMessagesPage />)
    await waitFor(() => expect(screen.getByText('Paiement bloqué')).toBeInTheDocument())
    expect(screen.queryByText('Mon paiement échoue.')).not.toBeInTheDocument() // pas de corps dans la liste
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    await waitFor(() => expect(screen.getByText('Mon paiement échoue.')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme traité' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/contact/4/', { status: 'handled' }))
  })
})

describe('PlatformAdminIntegrationsPage', () => {
  it('shows adoption per carrier and channel', async () => {
    api.get.mockResolvedValue({ data: {
      carriers: [{ carrier: 'yalidine', label: 'Yalidine', stores: 4, active: 3 }],
      channels: [{ channel: 'shopify', label: 'Shopify', stores: 2, active: 2 }],
      webhooks: { total: 5, failing: 1 },
    } })
    wrap(<PlatformAdminIntegrationsPage />)
    await waitFor(() => expect(screen.getByText('Yalidine')).toBeInTheDocument())
    expect(screen.getByText('Shopify')).toBeInTheDocument()
  })
})

describe('AnnouncementBanner', () => {
  it('shows active announcements as plain text and remembers dismissal', async () => {
    api.get.mockResolvedValue({ data: { results: [{ id: 9, title: 'Alerte', body: '<b>gras</b> maintenance', level: 'warning' }] } })
    const { unmount } = render(<AnnouncementBanner />)
    await waitFor(() => expect(screen.getByText(/maintenance/)).toBeInTheDocument())
    expect(document.querySelector('b')).toBeNull() // jamais de HTML interprété
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByText(/maintenance/)).not.toBeInTheDocument()
    unmount()
    render(<AnnouncementBanner />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/maintenance/)).not.toBeInTheDocument()
  })

  it('stays silent when the request fails', async () => {
    api.get.mockRejectedValue(new Error('x'))
    const { container } = render(<AnnouncementBanner />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ContactPage', () => {
  it('sends a message to the support', async () => {
    api.post.mockResolvedValue({ data: {} })
    wrap(<ContactPage />)
    fireEvent.change(screen.getByLabelText('Sujet'), { target: { value: 'Question' } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bonjour, une question.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/support/contact/', { subject: 'Question', body: 'Bonjour, une question.' }))
  })

  it('explains the rate limit', async () => {
    api.post.mockRejectedValue({ response: { status: 429 } })
    wrap(<ContactPage />)
    fireEvent.change(screen.getByLabelText('Sujet'), { target: { value: 'Q' } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'M' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await waitFor(() => expect(screen.getByText(/trop de messages/i)).toBeInTheDocument())
  })
})
