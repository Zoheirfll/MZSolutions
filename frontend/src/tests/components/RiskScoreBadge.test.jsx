import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import RiskScoreBadge from '../../components/RiskScoreBadge'

describe('RiskScoreBadge', () => {
  it('affiche "—" si le score est null (commande antérieure à la fonctionnalité)', () => {
    render(<RiskScoreBadge score={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('affiche "Faible" en vert pour un score bas', () => {
    render(<RiskScoreBadge score={20} />)
    expect(screen.getByText(/Faible/)).toBeInTheDocument()
  })

  it('affiche "Moyen" pour un score intermédiaire', () => {
    render(<RiskScoreBadge score={50} />)
    expect(screen.getByText(/Moyen/)).toBeInTheDocument()
  })

  it('affiche "Élevé" pour un score haut', () => {
    render(<RiskScoreBadge score={80} />)
    expect(screen.getByText(/Élevé/)).toBeInTheDocument()
  })
})
