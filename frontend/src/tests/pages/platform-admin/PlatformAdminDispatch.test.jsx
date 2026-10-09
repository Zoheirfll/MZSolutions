import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { DispatchWaitingPage, DispatchReviewPage, DispatchFailedPage } from '../../../pages/platform-admin/PlatformAdminDispatchPages'
import PlatformAdminDispatchConfigPage from '../../../pages/platform-admin/PlatformAdminDispatchConfigPage'
import PlatformAdminMyQueuePage from '../../../pages/platform-admin/PlatformAdminMyQueuePage'
import ServiceLayout from '../../../pages/platform-admin/ServiceLayout'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const auth = { user: { id: 1, is_service_admin: true, is_platform_confirmateur: true, email: 'a@b.c' }, logout: vi.fn(), refresh: vi.fn() }
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }))
import api from '../../../api/axios'

const row = (over = {}) => ({
  order_id: 12, store_id: 3, store_name: 'Boutique Alpha', customer: 'Sami K', phone: '0555111222', wilaya: 'Alger',
  total: '4500.00', state: 'waiting', attempts: 2, available_at: '2026-10-09T10:00:00Z', minutes_left: 0,
  created_at: '2026-10-09T08:00:00Z', admin_flagged_at: null, failed_at: null, confirmateur: null,
  last_outcome: 'no_answer', last_outcome_label: 'Ne répond pas', rank: 1, score: 72.5, algorithm: 'fifo', ready: true, ...over,
})
const page = (rows) => ({ data: { count: rows.length, page: 1, per_page: 20, results: rows } })
const FLOW = {
  ...row({ state: 'failed', attempts: 8, failed_at: '2026-10-09T12:00:00Z' }),
  events: [
    { id: 1, kind: 'created', at: '2026-10-09T08:00:00Z', explanation: 'Commande entrée dans le flux de dispatch.' },
    { id: 2, kind: 'attempt', at: '2026-10-09T08:05:00Z', explanation: 'Sara B a appelé : Ne répond pas.' },
    { id: 3, kind: 'requeued', at: '2026-10-09T08:05:01Z', explanation: "Remise en attente d'assignation — prochaine tentative dans 30 min." },
    { id: 4, kind: 'failed', at: '2026-10-09T12:00:00Z', explanation: 'Échec définitif après 8 appels sans réponse.' },
  ],
}
const wrap = (el) => render(<MemoryRouter>{el}</MemoryRouter>)

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.put.mockReset(); api.delete.mockReset()
})

describe('pages de dispatch', () => {
  it("« En attente d'assignation » liste le pool avec rang, appels et statut de prochaine assignation", async () => {
    api.get.mockResolvedValue(page([row(), row({ order_id: 13, rank: 2, ready: false, minutes_left: 14 })]))
    wrap(<DispatchWaitingPage />)
    expect(await screen.findByText('#12')).toBeInTheDocument()
    expect(screen.getByText('Prête')).toBeInTheDocument()
    expect(screen.getByText('Dans 14 min')).toBeInTheDocument()
    expect(screen.getAllByText('Ne répond pas').length).toBeGreaterThan(0)
    expect(api.get).toHaveBeenCalledWith('/platform-admin/dispatch/waiting/', expect.anything())
  })

  it('« Distribuer maintenant » lance le moteur puis recharge', async () => {
    api.get.mockResolvedValue(page([row()]))
    api.post.mockResolvedValue({ data: { assigned: 1, closed: 0 } })
    wrap(<DispatchWaitingPage />)
    await screen.findByText('#12')
    fireEvent.click(screen.getByRole('button', { name: 'Distribuer maintenant' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/dispatch/run/'))
  })

  it('« À traiter » et « Échecs » lisent leur propre endpoint', async () => {
    api.get.mockResolvedValue(page([row({ state: 'assigned', confirmateur: 'Sara B', admin_flagged_at: '2026-10-09T09:00:00Z' })]))
    const { unmount } = wrap(<DispatchReviewPage />)
    expect(await screen.findByText('Chez Sara B')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/platform-admin/dispatch/review/', expect.anything())
    unmount()
    api.get.mockResolvedValue(page([row({ state: 'failed', failed_at: '2026-10-09T12:00:00Z' })]))
    wrap(<DispatchFailedPage />)
    expect(await screen.findByText('#12')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/platform-admin/dispatch/failed/', expect.anything())
  })

  it("l'historique d'une commande explique tout le processus", async () => {
    api.get.mockImplementation((url) => (url.includes('/flows/') ? Promise.resolve({ data: FLOW }) : Promise.resolve(page([row({ state: 'failed', failed_at: '2026-10-09T12:00:00Z' })]))))
    wrap(<DispatchFailedPage />)
    await screen.findByText('#12')
    fireEvent.click(screen.getByRole('button', { name: 'Historique' }))
    const timeline = await screen.findByTestId('flow-timeline')
    expect(within(timeline).getByText('Sara B a appelé : Ne répond pas.')).toBeInTheDocument()
    expect(within(timeline).getByText(/prochaine tentative dans 30 min/)).toBeInTheDocument()
    expect(within(timeline).getByText('Échec définitif après 8 appels sans réponse.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByTestId('flow-timeline')).not.toBeInTheDocument())
  })

  it('affiche une erreur avec réessai quand le chargement échoue', async () => {
    api.get.mockRejectedValue(new Error('x'))
    wrap(<DispatchWaitingPage />)
    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument()
  })
})

const META = {
  algorithms: [{ key: 'fifo', label: 'Premier arrivé', description: 'La plus ancienne.' }, { key: 'newest', label: "Nouvelles d'abord", description: 'La plus récente.' }],
  defaults: { weights: { age: 0.25 } },
}
const CONFIG = { id: 5, store: null, store_name: null, date: null, weekday: 2, algorithm: 'newest', algorithm_label: "Nouvelles d'abord",
  wait_minutes: [30, 40], review_after: 4, fail_after_review: 4, max_open: 5, weights: {} }

function mockConfigApi(configs = [CONFIG]) {
  api.get.mockImplementation((url) => {
    if (url.includes('/config/')) return Promise.resolve({ data: configs })
    if (url.includes('/meta/')) return Promise.resolve({ data: META })
    return Promise.resolve({ data: { results: [{ id: 3, name: 'Boutique Alpha' }] } })
  })
}

describe('réglage des algorithmes', () => {
  it('liste les réglages avec portée, moment, algorithme et seuils', async () => {
    mockConfigApi()
    wrap(<PlatformAdminDispatchConfigPage />)
    expect(await screen.findByText('Tout le site')).toBeInTheDocument()
    expect(screen.getByText('Mercredi')).toBeInTheDocument()
    expect(screen.getAllByText("Nouvelles d'abord").length).toBeGreaterThan(0)
    expect(screen.getByText('Signalée après 4, échec après 8')).toBeInTheDocument()
    expect(await screen.findByText('Les 10 algorithmes')).toBeInTheDocument()
  })

  it('crée un réglage de site avec les valeurs par défaut', async () => {
    mockConfigApi([])
    api.post.mockResolvedValue({ data: {} })
    wrap(<PlatformAdminDispatchConfigPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau réglage' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/dispatch/config/', expect.objectContaining({
      algorithm: 'fifo', store: null, wait_minutes: [30, 40, 50, 60], review_after: 4, fail_after_review: 4, max_open: 5,
    })))
  })

  it("affiche l'erreur du serveur sans fermer le formulaire", async () => {
    mockConfigApi([])
    api.post.mockRejectedValue({ response: { data: { detail: 'Un réglage existe déjà pour cette portée : modifiez-le.' } } })
    wrap(<PlatformAdminDispatchConfigPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau réglage' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText(/existe déjà pour cette portée/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
  })

  it('modifie puis supprime un réglage', async () => {
    mockConfigApi()
    api.put.mockResolvedValue({ data: {} }); api.delete.mockResolvedValue({})
    wrap(<PlatformAdminDispatchConfigPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/dispatch/config/5/', expect.objectContaining({ algorithm: 'newest', wait_minutes: [30, 40] })))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/platform-admin/dispatch/config/5/'))
  })
})

describe('navigation du service', () => {
  it('affiche les pastilles de compteurs et les nouveaux liens', async () => {
    api.get.mockResolvedValue({ data: { waiting: 7, review: 2, failed: 0 } })
    wrap(<ServiceLayout />)
    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    for (const label of ["En attente d'assignation", 'À traiter', 'Échecs', 'Algorithmes de dispatch']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('reste utilisable si le compteur est indisponible', async () => {
    api.get.mockRejectedValue(new Error('x'))
    wrap(<ServiceLayout />)
    expect(await screen.findByRole('link', { name: /Échecs/ })).toBeInTheDocument()
  })
})

describe('file du confirmateur', () => {
  const ORDER = { id: 31, store_name: 'Boutique Alpha', first_name: 'Sami', last_name: 'K', phone: '0555', wilaya: 'Alger',
    status: 'pending', status_label: 'En attente', total: '3000', flow_state: 'assigned', flow_attempts: 1 }

  function mockQueue(order = ORDER) {
    api.get.mockImplementation((url) => (url.includes('my-dashboard')
      ? Promise.resolve({ data: { totals: { pending_orders: 1, open_complaints: 0, open_exchanges: 0 }, stores: [] } })
      : Promise.resolve({ data: { results: [order] } })))
  }

  it("enregistre le résultat d'un appel sans réponse", async () => {
    mockQueue()
    api.post.mockResolvedValue({ data: { state: 'waiting' } })
    wrap(<PlatformAdminMyQueuePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Appel sans réponse' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sonne dans le vide' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/my-queue/31/call/',
      expect.objectContaining({ outcome: 'no_answer', note: 'sonne dans le vide' })))
  })

  it("n'offre pas le résultat d'appel pour une commande hors flux", async () => {
    mockQueue({ ...ORDER, flow_state: 'done', status: 'confirmed' })
    wrap(<PlatformAdminMyQueuePage />)
    await screen.findByText('Boutique Alpha')
    expect(screen.queryByRole('button', { name: 'Appel sans réponse' })).not.toBeInTheDocument()
  })

  it("montre l'erreur du serveur si l'enregistrement échoue", async () => {
    mockQueue()
    api.post.mockRejectedValue({ response: { data: { detail: "Cette commande n'est pas assignée à ce confirmateur." } } })
    wrap(<PlatformAdminMyQueuePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Appel sans réponse' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(await screen.findByText(/pas assignée à ce confirmateur/)).toBeInTheDocument()
  })
})
