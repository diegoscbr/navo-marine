import { render, screen, fireEvent } from '@testing-library/react'
import { useSession } from 'next-auth/react'
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

  it('renders a subtle Sign in text link for anonymous visitors', () => {
    ;(useSession as jest.Mock).mockReturnValue({ data: null })
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /^sign in$/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('renders the account menu trigger but no Sign in link for signed-in customers', () => {
    ;(useSession as jest.Mock).mockReturnValue({
      data: { user: { name: 'Alice', email: 'alice@example.com', image: null } },
    })
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /^sign in$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument()
  })

  it('renders the Admin pill + account menu for @navomarine.com users', () => {
    ;(useSession as jest.Mock).mockReturnValue({
      data: { user: { name: 'Diego', email: 'diego@navomarine.com', image: null } },
    })
    render(<Navbar />)
    const adminLink = screen.getByRole('link', { name: /^admin$/i })
    expect(adminLink).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument()
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

  it('renders Sign in link when no session', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /^sign in$/i })).toBeInTheDocument()
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

  it('renders the account menu trigger when session exists', () => {
    render(<Navbar />)
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument()
  })

  it('does not render Sign in link when authenticated', () => {
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument()
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

  it('shows Sign in in mobile menu when unauthenticated', () => {
    ;(useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' })
    render(<Navbar />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))

    const signInLinks = screen.getAllByRole('link', { name: /^sign in$/i })
    expect(signInLinks.length).toBeGreaterThanOrEqual(1)
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
