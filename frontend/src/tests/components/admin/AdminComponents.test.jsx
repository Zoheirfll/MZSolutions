import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import { AdminError, AdminEmpty } from '../../../components/admin/AdminState'
import AdminList from '../../../components/admin/AdminList'

describe('AdminPageHeader', () => {
  it('shows the title and toggles the help', () => {
    render(<AdminPageHeader pageKey="t" title="Boutiques" help="Aide texte" />)
    expect(screen.getByText('Boutiques')).toBeInTheDocument()
    expect(screen.queryByText('Aide texte')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /aide/i }))
    expect(screen.getByText('Aide texte')).toBeInTheDocument()
  })
})

describe('AdminState', () => {
  it('error calls onRetry', () => {
    const onRetry = vi.fn()
    render(<AdminError message="Boom" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(onRetry).toHaveBeenCalled()
  })
  it('empty shows its title', () => {
    render(<AdminEmpty title="Rien" />)
    expect(screen.getByText('Rien')).toBeInTheDocument()
  })
})

describe('AdminList', () => {
  const columns = [{ key: 'name', label: 'Nom' }]
  it('renders rows and paginates', () => {
    const onPage = vi.fn()
    render(<AdminList columns={columns} rows={[{ id: 1, name: 'Boutique A' }]} total={45} page={1} perPage={20} onPage={onPage} />)
    expect(screen.getByText('Boutique A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }))
    expect(onPage).toHaveBeenCalledWith(2)
  })
  it('shows the empty state', () => {
    render(<AdminList columns={columns} rows={[]} total={0} page={1} perPage={20} />)
    expect(screen.getByText(/aucun résultat/i)).toBeInTheDocument()
  })
  it('search calls onSearch', () => {
    const onSearch = vi.fn()
    render(<AdminList columns={columns} rows={[]} total={0} page={1} perPage={20} search="" onSearch={onSearch} />)
    fireEvent.change(screen.getByPlaceholderText(/rechercher/i), { target: { value: 'abc' } })
    expect(onSearch).toHaveBeenCalledWith('abc')
  })
})
