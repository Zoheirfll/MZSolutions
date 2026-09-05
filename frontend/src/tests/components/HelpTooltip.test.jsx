import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HelpTooltip from '../../components/HelpTooltip'

describe('HelpTooltip', () => {
  it("n'affiche pas le contenu tant qu'on n'a pas cliqué", () => {
    render(<HelpTooltip title="TITRE">Contenu caché</HelpTooltip>)
    expect(screen.queryByText('Contenu caché')).not.toBeInTheDocument()
  })

  it("affiche le contenu au clic sur l'icône", () => {
    render(<HelpTooltip title="TITRE">Contenu affiché</HelpTooltip>)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Contenu affiché')).toBeInTheDocument()
  })
})
