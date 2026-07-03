import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Select from '../../components/Select'

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
]

describe('Select', () => {
  it('shows the placeholder when no value matches', () => {
    render(<Select value="" onChange={() => {}} options={OPTIONS} placeholder="Choisir…" />)
    expect(screen.getByText('Choisir…')).toBeInTheDocument()
  })

  it('shows the label of the selected value', () => {
    render(<Select value="b" onChange={() => {}} options={OPTIONS} />)
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('opens the option list on click and calls onChange when picking one', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select value="" onChange={onChange} options={OPTIONS} />)

    await user.click(screen.getByRole('button'))
    const optionButton = screen.getByRole('button', { name: 'Option A' })
    await user.click(optionButton)

    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('does not open when disabled', async () => {
    const user = userEvent.setup()
    render(<Select value="" onChange={() => {}} options={OPTIONS} disabled />)
    await user.click(screen.getByRole('button'))
    expect(screen.queryByRole('button', { name: 'Option A' })).not.toBeInTheDocument()
  })
})
