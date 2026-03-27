import { render, screen, fireEvent } from '@testing-library/react'
import { useSession, signOut } from 'next-auth/react'
import { Navbar } from '@/components/layout/Navbar'

jest.mock('next/navigation', () => ({ usePathname: () => '/' }))

describe('Navbar', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  it('renders NAVO logo', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /NAVO Marine Technologies — home/i })).toBeInTheDocument()
  })

  it('renders Capabilities nav link pointing to /capabilities', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /capabilities/i })
    expect(link).toHaveAttribute('href', '/capabilities')
  })

  it('renders Products nav link pointing to /products', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /products/i })
    expect(link).toHaveAttribute('href', '/products')
  })

  it('renders Contact nav link pointing to /contact', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /^contact$/i })
    expect(link).toHaveAttribute('href', '/contact')
  })

  it('renders a Packages link', () => {
    render(<Navbar />)
    const packagesLink = screen.getByRole('link', { name: /packages/i })
    expect(packagesLink).toBeInTheDocument()
    expect(packagesLink).toHaveAttribute('href', '/packages')
  })

  it('renders Reserve nav link pointing to /reserve', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /^reserve$/i })
    expect(link).toHaveAttribute('href', '/reserve')
  })

  it('renders Login button pointing to /login', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /login/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/login')
  })

  it('does NOT render Partner With NAVO button', () => {
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /partner with navo/i })).not.toBeInTheDocument()
  })

  it('does NOT render Race Management link', () => {
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /race management/i })).not.toBeInTheDocument()
  })

  it('updates header styling after scrolling', () => {
    const { container } = render(<Navbar />)
    const header = container.querySelector('header')

    expect(header).toHaveClass('bg-transparent')

    Object.defineProperty(window, 'scrollY', { value: 24, writable: true, configurable: true })
    fireEvent.scroll(window)

    expect(header).toHaveClass('bg-navy-900/95', 'backdrop-blur-md', 'shadow-lg')
  })
})

describe('Navbar — unauthenticated', () => {
  beforeEach(() => {
    ;(useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' })
  })

  it('renders Login link when no session', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument()
  })

  it('does not render Sign Out button when no session', () => {
    render(<Navbar />)
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})

describe('Navbar — authenticated', () => {
  const mockSession = {
    data: {
      user: { name: 'Ada Lovelace', email: 'ada@example.com', image: null },
      expires: '9999-01-01',
    },
    status: 'authenticated',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useSession as jest.Mock).mockReturnValue(mockSession)
  })

  it('renders Sign Out button when session exists', () => {
    render(<Navbar />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('does not render Login link when authenticated', () => {
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /login/i })).not.toBeInTheDocument()
  })

  it('calls signOut with callbackUrl "/" when Sign Out clicked', () => {
    render(<Navbar />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' })
  })
})

describe('Navbar — mobile menu', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  it('renders hamburger button with aria-label', () => {
    render(<Navbar />)
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('hamburger button has aria-expanded=false by default', () => {
    render(<Navbar />)
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows mobile nav links when hamburger is clicked', () => {
    render(<Navbar />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    // Mobile menu should now show all nav links (they also exist in desktop ul)
    const productLinks = screen.getAllByRole('link', { name: /products/i })
    expect(productLinks.length).toBeGreaterThanOrEqual(2) // desktop + mobile
  })

  it('toggles aria-expanded and aria-label on click', () => {
    render(<Navbar />)
    const btn = screen.getByRole('button', { name: /open menu/i })
    fireEvent.click(btn)

    const closeBtn = screen.getByRole('button', { name: /close menu/i })
    expect(closeBtn).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes mobile menu when a nav link is clicked', () => {
    render(<Navbar />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    // Click one of the mobile links
    const mobileLinks = screen.getAllByRole('link', { name: /products/i })
    fireEvent.click(mobileLinks[mobileLinks.length - 1]) // click the mobile one (last)

    // Menu should close — hamburger should say "Open menu" again
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('shows Login in mobile menu when unauthenticated', () => {
    ;(useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' })
    render(<Navbar />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    const loginLinks = screen.getAllByRole('link', { name: /login/i })
    expect(loginLinks.length).toBeGreaterThanOrEqual(1)
  })

  it('shows Sign Out in mobile menu when authenticated', () => {
    ;(useSession as jest.Mock).mockReturnValue({
      data: { user: { name: 'Test', email: 'test@test.com', image: null }, expires: '9999-01-01' },
      status: 'authenticated',
    })
    render(<Navbar />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    const signOutButtons = screen.getAllByRole('button', { name: /sign out/i })
    expect(signOutButtons.length).toBeGreaterThanOrEqual(1)
  })
})
