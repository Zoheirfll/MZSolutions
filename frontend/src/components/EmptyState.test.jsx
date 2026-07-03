import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from './EmptyState'

function FakeIcon(props) {
  return <svg data-testid="fake-icon" {...props} />
}

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Aucune donnée" description="Rien à afficher pour l'instant" />)
    expect(screen.getByText('Aucune donnée')).toBeInTheDocument()
    expect(screen.getByText("Rien à afficher pour l'instant")).toBeInTheDocument()
  })

  it('renders the icon only when provided', () => {
    const { rerender } = render(<EmptyState title="X" />)
    expect(screen.queryByTestId('fake-icon')).not.toBeInTheDocument()
    rerender(<EmptyState title="X" icon={FakeIcon} />)
    expect(screen.getByTestId('fake-icon')).toBeInTheDocument()
  })

  it('renders the action slot when provided', () => {
    render(<EmptyState title="X" action={<button>Do something</button>} />)
    expect(screen.getByRole('button', { name: 'Do something' })).toBeInTheDocument()
  })
})
