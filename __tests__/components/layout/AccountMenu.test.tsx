/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { signOut } from 'next-auth/react'
import { AccountMenu } from '@/components/layout/AccountMenu'

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}))

describe('AccountMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders a closed menu by default (dropdown not visible)', () => {
    render(<AccountMenu name="Alice" email="alice@example.com" image={null} />)
    expect(screen.queryByText('alice@example.com')).toBeNull()
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
  })

  it('opens the dropdown when the avatar trigger is clicked', () => {
    render(<AccountMenu name="Alice" email="alice@example.com" image={null} />)
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('closes when clicking outside the menu', () => {
    render(
      <div>
        <AccountMenu name="Alice" email="alice@example.com" image={null} />
        <div data-testid="outside">outside</div>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('alice@example.com')).toBeNull()
  })

  it('calls signOut with callbackUrl=/ when Sign out is clicked', () => {
    render(<AccountMenu name="Alice" email="alice@example.com" image={null} />)
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' })
  })
})
