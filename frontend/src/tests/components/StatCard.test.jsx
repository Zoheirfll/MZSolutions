import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from '../../components/StatCard'

function Icon(props) {
  return <svg data-testid="stat-icon" {...props} />
}

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Commandes" value={42} />)
    expect(screen.getByText('Commandes')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('defaults value to 0 when not provided', () => {
    render(<StatCard label="Vide" />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders the icon, sub badge and trend bar when provided', () => {
    render(<StatCard label="CA" value="1000 DA" sub="+12%" trend={65} icon={Icon} />)
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument()
    expect(screen.getByText('+12%')).toBeInTheDocument()
    expect(screen.getByText('↗ 65%')).toBeInTheDocument()
  })

  it('does not render the trend bar when trend is not provided', () => {
    render(<StatCard label="CA" value="1000 DA" />)
    expect(screen.queryByText(/↗/)).not.toBeInTheDocument()
  })
})
