import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import AccountAdvancedPanel from '../../../components/admin/AccountAdvancedPanel'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
import api from '../../../api/axios'

const DATA = { id: 7, name: 'Alpha', slug: 'alpha', phone: '0555', email: 'a@alpha.dz', state: 'suspended', owner: { email: 'o@alpha.dz' } }
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.put.mockReset() })

describe('AccountAdvancedPanel', () => {
  it('edits the store', async () => {
    api.put.mockResolvedValue({ data: {} })
    const onChanged = vi.fn()
    render(<AccountAdvancedPanel data={DATA} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Alpha 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/platform-admin/accounts/7/edit/', expect.objectContaining({ name: 'Alpha 2', slug: 'alpha' })))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('transfers only with a new owner and a reason', async () => {
    api.post.mockResolvedValue({ data: {} })
    render(<AccountAdvancedPanel data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Transférer la propriété' }))
    const confirm = screen.getByRole('button', { name: 'Transférer' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Email du nouveau propriétaire'), { target: { value: 'new@x.dz' } })
    fireEvent.change(screen.getByPlaceholderText(/motif \(obligatoire\)/i), { target: { value: 'Rachat de la boutique' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/accounts/7/transfer/', { new_owner_email: 'new@x.dz', reason: 'Rachat de la boutique' }))
  })

  it('requires the keyword to anonymize', async () => {
    api.post.mockResolvedValue({ data: {} })
    render(<AccountAdvancedPanel data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser' }))
    const confirm = screen.getByRole('button', { name: 'Anonymiser définitivement' })
    fireEvent.change(screen.getByPlaceholderText(/motif \(obligatoire\)/i), { target: { value: 'Demande du vendeur' } })
    fireEvent.change(screen.getByLabelText(/tapez ANONYMISER/i), { target: { value: 'anonymiser' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/tapez ANONYMISER/i), { target: { value: 'ANONYMISER' } })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/platform-admin/accounts/7/anonymize/', { confirm: 'ANONYMISER', reason: 'Demande du vendeur' }))
  })

  it('blocks anonymization on a store that is not suspended', () => {
    render(<AccountAdvancedPanel data={{ ...DATA, state: 'trial' }} />)
    expect(screen.getByRole('button', { name: 'Anonymiser' })).toBeDisabled()
  })

  it('shows nothing actionable once anonymized', () => {
    render(<AccountAdvancedPanel data={{ ...DATA, owner: { email: 'anonyme-1@anonymise.invalid' } }} />)
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.getByText(/est anonymisée/)).toBeInTheDocument()
  })
})
