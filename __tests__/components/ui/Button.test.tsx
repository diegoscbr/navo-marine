import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders primary variant', () => {
    render(<Button variant="primary">Partner With NAVO</Button>)
    expect(screen.getByRole('button', { name: 'Partner With NAVO' })).toBeInTheDocument()
  })

  it('renders outline variant', () => {
    render(<Button variant="outline">Learn More</Button>)
    const btn = screen.getByRole('button', { name: 'Learn More' })
    expect(btn).toHaveClass('border')
  })

  it('calls onClick handler', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<Button variant="primary" onClick={onClick}>Click</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders as anchor when href is provided', () => {
    render(<Button variant="primary" href="#contact">CTA</Button>)
    expect(screen.getByRole('link', { name: 'CTA' })).toHaveAttribute('href', '#contact')
  })
})
