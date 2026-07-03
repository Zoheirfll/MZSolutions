import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders the French label for a known order status', () => {
    render(<StatusBadge status="delivered" />)
    expect(screen.getByText('Livrée')).toBeInTheDocument()
  })

  it('falls back to the raw status string for an unknown status', () => {
    render(<StatusBadge status="totally_unknown" />)
    expect(screen.getByText('totally_unknown')).toBeInTheDocument()
  })

  it('prefers explicit children over the computed label', () => {
    render(<StatusBadge status="pending">Custom text</StatusBadge>)
    expect(screen.getByText('Custom text')).toBeInTheDocument()
  })

  it('prefers explicit label prop over the status-derived one', () => {
    render(<StatusBadge status="pending" label="Overridden" />)
    expect(screen.getByText('Overridden')).toBeInTheDocument()
  })
})
