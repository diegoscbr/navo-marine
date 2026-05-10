/**
 * @jest-environment node
 */
import { auth as authImpl } from '@/lib/auth'
import { supabaseAdmin as supabaseAdminImpl } from '@/lib/db/client'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const auth = authImpl as unknown as jest.Mock
const supabaseAdmin = supabaseAdminImpl as unknown as { from: jest.Mock }

const ADMIN_SESSION = { user: { email: 'admin@navomarine.com', id: 'u1' } }
const NON_ADMIN = { user: { email: 'user@gmail.com', id: 'u2' } }

type SupabaseResult = { data: unknown; error: unknown }

function mockTables(tables: Record<string, SupabaseResult>) {
  supabaseAdmin.from.mockImplementation((table: string) => {
    const result = tables[table] ?? { data: [], error: null }
    const builder: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue(result),
      then: (resolve: (value: SupabaseResult) => unknown) => resolve(result),
    }
    return builder
  })
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/admin/reservations/export', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue(NON_ADMIN)
    const { GET } = await import('@/app/api/admin/reservations/export/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns CSV with header and reservation rows for admin', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)

    mockTables({
      reservations: {
        data: [
          {
            id: 'r1',
            customer_email: 'alice@example.com',
            status: 'reserved_paid',
            reservation_type: 'rental_event',
            start_date: null,
            end_date: null,
            total_cents: 12500,
            created_at: '2026-04-01T12:00:00.000Z',
            unit_id: 'u-1',
            rental_events: {
              name: 'Spring Regatta',
              location: 'Miami, FL',
              start_date: '2026-04-10',
              end_date: '2026-04-12',
            },
            products: { name: 'Atlas 2 Rental' },
          },
          {
            id: 'r2',
            customer_email: 'bob@example.com',
            status: 'reserved_unpaid',
            reservation_type: 'regatta_package',
            start_date: '2026-05-01',
            end_date: '2026-05-03',
            total_cents: 0,
            created_at: '2026-04-02T12:00:00.000Z',
            unit_id: null,
            rental_events: null,
            products: { name: 'Package, Premium "Plus"' },
          },
        ],
        error: null,
      },
      units: {
        data: [
          { id: 'u-1', navo_number: 'NAVO-001' },
          { id: 'u-2', navo_number: 'NAVO-002' },
          { id: 'u-3', navo_number: 'NAVO-003' },
        ],
        error: null,
      },
      reservation_units: {
        data: [
          { reservation_id: 'r2', unit_id: 'u-2' },
          { reservation_id: 'r2', unit_id: 'u-3' },
        ],
        error: null,
      },
    })

    const { GET } = await import('@/app/api/admin/reservations/export/route')
    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="navo-reservations-\d{4}-\d{2}-\d{2}\.csv"/)

    const text = await res.text()
    const withoutBom = text.replace(/^﻿/, '')
    const lines = withoutBom.split('\r\n')

    expect(lines[0]).toBe(
      'Customer Email,Product,Reservation Type,Event Name,Event Location,Status,Start Date,End Date,Total (USD),Unit,Created At',
    )

    expect(lines[1]).toBe(
      'alice@example.com,Atlas 2 Rental,rental_event,Spring Regatta,"Miami, FL",RESERVED PAID,2026-04-10,2026-04-12,125.00,NAVO-001,2026-04-01',
    )

    // Quotes inside product name must be doubled per RFC 4180.
    expect(lines[2]).toBe(
      'bob@example.com,"Package, Premium ""Plus""",regatta_package,,,RESERVED UNPAID,2026-05-01,2026-05-03,0.00,NAVO-002 + NAVO-003,2026-04-02',
    )
  })

  it('returns 500 when reservations query fails', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    mockTables({
      reservations: { data: null, error: { message: 'db down' } },
    })

    const { GET } = await import('@/app/api/admin/reservations/export/route')
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('db down')
  })
})
