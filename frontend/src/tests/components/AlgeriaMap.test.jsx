import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlgeriaMap from '../../components/AlgeriaMap'

describe('AlgeriaMap', () => {
  it('renders all 58 wilaya paths', () => {
    const { container } = render(<AlgeriaMap data={[]} />)
    expect(container.querySelectorAll('path').length).toBe(58)
  })

  it('matches accented wilaya names from checkout data to the map (e.g. Béjaïa, Aïn Defla)', () => {
    const { container } = render(<AlgeriaMap data={[
      { wilaya: 'Béjaïa', orders_count: 12, revenue: 5000 },
      { wilaya: 'Aïn Defla', orders_count: 3, revenue: 1000 },
    ]} />)
    const coloredPaths = Array.from(container.querySelectorAll('path'))
      .filter(p => p.getAttribute('fill')?.startsWith('rgba(139'))
    expect(coloredPaths.length).toBe(2)
  })

  it('shows a tooltip with order count and revenue on hover', async () => {
    const user = userEvent.setup()
    render(<AlgeriaMap data={[{ wilaya: 'Alger', orders_count: 20, revenue: 15000 }]} />)
    await user.hover(document.querySelector('path[fill^="rgba(139"]'))
    expect(await screen.findByText('Alger')).toBeInTheDocument()
    expect(screen.getByText('20 commandes')).toBeInTheDocument()
    expect(screen.getByText('15 000 DA')).toBeInTheDocument()
  })

  it('handles the known SVG source typos (Bordj Bou Arreridj, Bordj Badji Mokhtar, El Meniaa) without crashing', () => {
    const { container } = render(<AlgeriaMap data={[
      { wilaya: 'Bordj Bou Arréridj', orders_count: 4 },
      { wilaya: 'Bordj Badji Mokhtar', orders_count: 2 },
      { wilaya: 'El Meniaa', orders_count: 7 },
    ]} />)
    // Les 3 tracés correspondants doivent être colorés (fill différent du gris par défaut),
    // preuve que la correspondance via alias a bien fonctionné.
    const coloredPaths = Array.from(container.querySelectorAll('path'))
      .filter(p => p.getAttribute('fill')?.startsWith('rgba(139'))
    expect(coloredPaths.length).toBe(3)
  })
})
