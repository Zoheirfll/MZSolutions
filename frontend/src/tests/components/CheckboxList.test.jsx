import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CheckboxList from '../../components/CheckboxList'

const ITEMS = [
  { id: 1, name: 'Produit A' },
  { id: 2, name: 'Produit B' },
]

describe('CheckboxList', () => {
  it('renders the empty label when there are no items', () => {
    render(<CheckboxList items={[]} selected={[]} onToggle={() => {}} emptyLabel="Aucun élément" />)
    expect(screen.getByText('Aucun élément')).toBeInTheDocument()
  })

  it('renders items with their checked state reflecting the selected prop', () => {
    render(<CheckboxList items={ITEMS} selected={[2]} onToggle={() => {}} emptyLabel="Aucun" />)
    expect(screen.getByLabelText('Produit A')).not.toBeChecked()
    expect(screen.getByLabelText('Produit B')).toBeChecked()
  })

  it('calls onToggle with the item id when a checkbox is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<CheckboxList items={ITEMS} selected={[]} onToggle={onToggle} emptyLabel="Aucun" />)

    await user.click(screen.getByLabelText('Produit A'))
    expect(onToggle).toHaveBeenCalledWith(1)
  })
})
