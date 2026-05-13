/**
 * @jest-environment node
 */
import { auth as authImpl } from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const redirectMock = jest.fn((url: string) => {
  throw new Error(`__REDIRECT__${url}`)
})

jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const auth = authImpl as unknown as jest.Mock

const ADMIN = { user: { email: 'admin@navomarine.com', id: 'u1' } }
const CUSTOMER = { user: { email: 'alice@example.com', id: 'u2' } }

async function callPage() {
  const mod = await import('@/app/auth/redirect/page')
  return mod.default()
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('/auth/redirect — admin/non-admin routing gateway', () => {
  it('redirects to /login when no session', async () => {
    auth.mockResolvedValue(null)
    await expect(callPage()).rejects.toThrow('__REDIRECT__/login')
  })

  it('routes @navomarine.com users to /admin', async () => {
    auth.mockResolvedValue(ADMIN)
    await expect(callPage()).rejects.toThrow('__REDIRECT__/admin')
  })

  it('routes everyone else to /', async () => {
    auth.mockResolvedValue(CUSTOMER)
    await expect(callPage()).rejects.toThrow('__REDIRECT__/')
  })
})
