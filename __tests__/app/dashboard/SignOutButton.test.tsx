import { render, screen, fireEvent } from '@testing-library/react'
import { signOut } from 'next-auth/react'
import { SignOutButton } from '@/app/dashboard/SignOutButton'

describe('SignOutButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the sign-out button', () => {
    render(<SignOutButton />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('calls signOut with callbackUrl "/" on click', () => {
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' })
  })

  it('calls signOut exactly once per click', () => {
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
