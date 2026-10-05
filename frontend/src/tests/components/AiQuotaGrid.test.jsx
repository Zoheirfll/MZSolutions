import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import AiQuotaGrid from '../../components/admin/AiQuotaGrid'

const ROWS = [{ key: 'chat', label: 'Assistant IA (chat)', daily: 0, weekly: 0 }, { key: 'scan', label: 'Scan de produit (vision)', daily: 2, weekly: 5 }]

describe('AiQuotaGrid', () => {
  it('shows one line per AI feature and edits daily and weekly limits', () => {
    const onChange = vi.fn()
    render(<AiQuotaGrid rows={ROWS} onChange={onChange} />)
    expect(screen.getByText('Scan de produit (vision)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Assistant IA (chat) — Par jour'), { target: { value: '10' } })
    expect(onChange).toHaveBeenCalledWith([{ ...ROWS[0], daily: 10 }, ROWS[1]])
    fireEvent.change(screen.getByLabelText('Scan de produit (vision) — Par semaine'), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith([ROWS[0], { ...ROWS[1], weekly: 0 }])
  })

  it('renders nothing without a catalogue', () => {
    const { container } = render(<AiQuotaGrid rows={[]} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
