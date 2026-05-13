/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { auth as authImpl } from '@/lib/auth'
import { loadOrderSummary as loadOrderSummaryImpl } from '@/lib/checkout/summary'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/checkout/summary', () => ({ loadOrderSummary: jest.fn() }))

const redirectMock = jest.fn((url: string) => {
  throw new Error(`__REDIRECT__${url}`)
})
jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

jest.mock('@/app/login/GoogleSignInButton', () => ({
  GoogleSignInButton: ({ callbackUrl }: { callbackUrl?: string }) => (
    <button data-testid="google-button" data-callback={callbackUrl ?? ''}>
      Sign in with Google
    </button>
  ),
}))

const auth = authImpl as unknown as jest.Mock
const loadOrderSummary = loadOrderSummaryImpl as unknown as jest.Mock

async function renderPage(searchParams: Record<string, string> = {}) {
  const Page = (await import('@/app/login/page')).default
  const ui = await Page({ searchParams: Promise.resolve(searchParams) } as never)
  return render(ui as React.ReactElement)
}

beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue(null)
  loadOrderSummary.mockResolvedValue(null)
})

describe('/login page', () => {
  it('renders generic version when no callbackUrl and no selection state', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByText(/just exploring/i)).toBeInTheDocument()
    expect(screen.queryByTestId('order-summary')).toBeNull()
  })

  it('renders context-aware order summary when callbackUrl decodes', async () => {
    loadOrderSummary.mockResolvedValue({
      contextLabel: 'Reservation',
      callbackUrlPathLabel: 'reservation form',
      lineItems: [{ label: 'Atlas 2 Rental' }, { label: 'Spring Regatta · 2026-04-10 → 2026-04-12' }],
      totalCents: 12500,
    })
    const cb = '/reserve?reservation_type=rental_event&product_id=p1&event_id=e1&sail_number=US-1'
    await renderPage({ callbackUrl: cb })

    expect(screen.getByTestId('order-summary')).toBeInTheDocument()
    expect(screen.getByText(/atlas 2 rental/i)).toBeInTheDocument()
    expect(screen.getByText(/spring regatta/i)).toBeInTheDocument()
    expect(screen.getByText(/sign in to complete your reservation/i)).toBeInTheDocument()
    expect(screen.getByText(/\$125\.00/)).toBeInTheDocument()
  })

  it('forwards callbackUrl to the Google sign-in button', async () => {
    loadOrderSummary.mockResolvedValue({
      contextLabel: 'Purchase',
      callbackUrlPathLabel: 'product page',
      lineItems: [{ label: 'Vakaros Atlas 2 — Qty 1' }],
      totalCents: 99500,
    })
    const cb = '/products/atlas-2?reservation_type=purchase&product_id=atlas-2&quantity=1&warranty_selected=false'
    await renderPage({ callbackUrl: cb })

    const button = screen.getByTestId('google-button')
    expect(button.getAttribute('data-callback')).toBe(cb)
  })

  it('renders generic page when callbackUrl is malformed', async () => {
    await renderPage({ callbackUrl: '/reserve?reservation_type=garbage' })
    expect(screen.getByText(/just exploring/i)).toBeInTheDocument()
    expect(screen.queryByTestId('order-summary')).toBeNull()
  })

  it('shows a back-to-page exit link when summary is present', async () => {
    loadOrderSummary.mockResolvedValue({
      contextLabel: 'Package booking',
      callbackUrlPathLabel: 'package selection',
      lineItems: [{ label: 'Race Committee Package' }],
      totalCents: 45000,
    })
    const cb = '/packages?reservation_type=regatta_package&product_id=p1&start_date=2026-05-01&end_date=2026-05-03'
    await renderPage({ callbackUrl: cb })

    const exitLink = screen.getByRole('link', { name: /back to package selection/i })
    expect(exitLink).toBeInTheDocument()
    expect(exitLink.getAttribute('href')).toBe(cb)
  })

  it('still redirects an already-authed admin to /admin (legacy preserved)', async () => {
    auth.mockResolvedValue({ user: { email: 'admin@navomarine.com', id: 'u1' } })
    await expect(renderPage()).rejects.toThrow('__REDIRECT__/admin')
  })

  it('still redirects an already-authed customer to / (legacy preserved)', async () => {
    auth.mockResolvedValue({ user: { email: 'alice@example.com', id: 'u2' } })
    await expect(renderPage()).rejects.toThrow('__REDIRECT__/')
  })
})
