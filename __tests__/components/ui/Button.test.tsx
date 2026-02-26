import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders primary variant as a button', () => {
    render(<Button variant="primary">Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveClass('glass-btn', 'glass-btn-primary')
  })

  it('renders ghost variant as a button', () => {
    render(<Button variant="ghost">Login</Button>)
    const btn = screen.getByRole('button', { name: 'Login' })
    expect(btn).toHaveClass('glass-btn', 'glass-btn-ghost')
  })

  it('calls onClick handler', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<Button variant="primary" onClick={onClick}>Click</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders as a link when href is provided', () => {
    render(<Button variant="primary" href="/capabilities">Go</Button>)
    const link = screen.getByRole('link', { name: 'Go' })
    expect(link).toHaveAttribute('href', '/capabilities')
    expect(link).toHaveClass('glass-btn', 'glass-btn-primary')
  })

  it('applies glass-btn class regardless of variant', () => {
    const { rerender } = render(<Button variant="primary">A</Button>)
    expect(screen.getByRole('button')).toHaveClass('glass-btn')
    rerender(<Button variant="ghost">A</Button>)
    expect(screen.getByRole('button')).toHaveClass('glass-btn')
  })
})
