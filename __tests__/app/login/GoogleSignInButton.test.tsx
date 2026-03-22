import { render, screen, fireEvent } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import { GoogleSignInButton } from '@/app/login/GoogleSignInButton'

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the sign-in button', () => {
    render(<GoogleSignInButton />)
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('calls signIn with google provider and /auth/redirect callback on click', () => {
    render(<GoogleSignInButton />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(signIn).toHaveBeenCalledWith(
      'google',
      { callbackUrl: '/auth/redirect' },
      { prompt: 'select_account' }
    )
  })

  it('forces account selection on every sign-in to prevent stale Google session', () => {
    render(<GoogleSignInButton />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    const [, , authorizationParams] = (signIn as jest.Mock).mock.calls[0]
    expect(authorizationParams).toMatchObject({ prompt: 'select_account' })
  })

  it('renders the Google SVG icon', () => {
    const { container } = render(<GoogleSignInButton />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
