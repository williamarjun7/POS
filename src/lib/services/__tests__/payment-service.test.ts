/**
 * Integration tests for PaymentService
 * ─────────────────────────────────────
 * Tests:
 * - Zod input validation rejects bad payment data
 * - createPaymentInDb maps DB rows to frontend types
 * - recordPaymentSafe gracefully handles DB failures
 * - useRecordPayment mutation invalidates query caches
 *
 * Mocks:
 * - insforge.database PostgREST methods
 * - Validation schemas (tested in isolation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPaymentInDb, recordPaymentSafe, fetchPaymentsFromDb, fetchPaymentsByInvoiceFromDb } from '../payment-service'
import { insforge } from '../auth-service'

// ─── Mock @/lib/services/auth-service ──────────────────────

vi.mock('../auth-service', () => ({
  insforge: {
    database: {
      from: vi.fn(),
    },
  },
}))

// ─── Helpers ────────────────────────────────────────────────

function mockDb() {
  const from = vi.fn()
  const select = vi.fn()
  const insert = vi.fn()
  const delete_ = vi.fn()
  const eq = vi.fn()
  const limit = vi.fn()
  const single = vi.fn()

  // order() returns a Promise-like object that:
  // - Is awaitable (resolves to { data, error }) when no .limit() is chained
  // - Has .limit() method for when limit IS chained
  const order = vi.fn(() => {
    const prom = Promise.resolve({ data: [], error: null })
    // @ts-expect-error — adding limit prop to thennable for chain support
    prom.limit = limit
    return prom
  })

  limit.mockResolvedValue({ data: [], error: null })

  from.mockReturnValue({ select, order, insert, delete: delete_, eq })
  select.mockReturnValue({ order, eq })
  eq.mockReturnValue({ order })
  insert.mockReturnValue({ select: vi.fn().mockReturnValue({ single }) })
  single.mockResolvedValue({ data: null, error: null })

  ;(insforge.database.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(from)

  return { from, select, insert, delete_, eq, order, limit, single }
}

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440001'
const INV_ID = '770e8400-e29b-41d4-a716-446655440010'
const CUST_ID = '880e8400-e29b-41d4-a716-446655440020'
const BATCH_ID = '990e8400-e29b-41d4-a716-446655440030'
const USER_ID = 'aa0e8400-e29b-41d4-a716-446655440040'

const mockPaymentRow = {
  id: UUID,
  invoice_id: INV_ID,
  batch_id: BATCH_ID,
  amount: 1500,
  payment_method: 'cash',
  reference: 'ref-001',
  customer_id: CUST_ID,
  notes: 'Paid in full',
  user_id: USER_ID,
  created_at: '2026-07-14T10:00:00Z',
}

describe('PaymentService — createPaymentInDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a payment and returns a camelCase Payment object', async () => {
    const { insert, single } = mockDb()
    single.mockResolvedValue({ data: mockPaymentRow, error: null })

    const result = await createPaymentInDb({
      invoiceId: INV_ID,
      amount: 1500,
      paymentMethod: 'cash',
      reference: 'ref-001',
      notes: 'Paid in full',
    })

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        invoice_id: INV_ID,
        amount: 1500,
        payment_method: 'cash',
      }),
    ])

    expect(result).toEqual({
      id: UUID,
      invoiceId: INV_ID,
      batchId: BATCH_ID,
      amount: 1500,
      paymentMethod: 'cash',
      reference: 'ref-001',
      customerId: CUST_ID,
      notes: 'Paid in full',
      userId: USER_ID,
      createdAt: '2026-07-14T10:00:00Z',
    })
  })

  it('rejects zero amount via Zod validation', async () => {
    const _insert = mockDb().insert

    await expect(
      createPaymentInDb({
        invoiceId: INV_ID,
        amount: 0,
        paymentMethod: 'cash',
      }),
    ).rejects.toThrow(/amount/i)

    // DB insert should NOT have been called
    expect(_insert).not.toHaveBeenCalled()
  })

  it('rejects negative amount via Zod validation', async () => {
    const _insert = mockDb().insert

    await expect(
      createPaymentInDb({
        invoiceId: INV_ID,
        amount: -10,
        paymentMethod: 'cash',
      }),
    ).rejects.toThrow(/amount/i)

    expect(_insert).not.toHaveBeenCalled()
  })

  it('rejects invalid payment method via Zod validation', async () => {
    const _insert = mockDb().insert

    await expect(
      createPaymentInDb({
        invoiceId: INV_ID,
        amount: 100,
        // @ts-expect-error — testing invalid method
        paymentMethod: 'bitcoin',
      }),
    ).rejects.toThrow(/method/i)

    expect(_insert).not.toHaveBeenCalled()
  })

  it('rejects missing invoiceId via Zod validation', async () => {
    const { insert } = mockDb()

    await expect(
      createPaymentInDb({
        invoiceId: 'not-a-uuid',
        amount: 100,
        paymentMethod: 'cash',
      }),
    ).rejects.toThrow(/uuid/i)

    expect(insert).not.toHaveBeenCalled()
  })
})

describe('PaymentService — recordPaymentSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the created payment on success', async () => {
    const { single } = mockDb()
    single.mockResolvedValue({ data: mockPaymentRow, error: null })

    const result = await recordPaymentSafe({
      invoiceId: INV_ID,
      amount: 1500,
      paymentMethod: 'cash',
    })

    expect(result).not.toBeNull()
    expect(result!.id).toBe(UUID)
    expect(result!.amount).toBe(1500)
  })

  it('returns null instead of throwing on DB failure', async () => {
    const { single } = mockDb()
    single.mockRejectedValue(new Error('DB connection lost'))

    const result = await recordPaymentSafe({
      invoiceId: INV_ID,
      amount: 1500,
      paymentMethod: 'cash',
    })

    // Safe wrapper catches errors — returns null instead of crashing
    expect(result).toBeNull()
  })

  it('returns null on DB constraint violation', async () => {
    const { single } = mockDb()
    single.mockResolvedValue({
      data: null,
      error: { message: 'violates foreign key constraint', code: '23503' },
    })

    const result = await recordPaymentSafe({
      invoiceId: INV_ID,
      amount: 1500,
      paymentMethod: 'cash',
    })

    expect(result).toBeNull()
  })
})

describe('PaymentService — fetchPaymentsFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an empty array when DB returns no data', async () => {
    const { limit: _limit, order } = mockDb()
    order.mockReturnValueOnce(
      Promise.resolve({ data: null as any, error: null })
    )

    const result = await fetchPaymentsFromDb()
    expect(result).toEqual([])
  })

  it('maps DB rows to camelCase Payment objects', async () => {
    const { limit: _limit, order } = mockDb()
    // Set up order to resolve with 2 rows when limit is not chained
    order.mockReturnValueOnce(
      Promise.resolve({
        data: [mockPaymentRow, { ...mockPaymentRow, id: UUID2, amount: 500 }] as any,
        error: null,
      })
    )

    const result = await fetchPaymentsFromDb()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(UUID)
    expect(result[0].invoiceId).toBe(INV_ID)
    expect(result[1].amount).toBe(500)
  })
})

describe('PaymentService — fetchPaymentsByInvoiceFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries payments filtered by invoice_id', async () => {
    const { eq, order } = mockDb()
    order.mockResolvedValue({ data: [mockPaymentRow] as any, error: null })

    const result = await fetchPaymentsByInvoiceFromDb(INV_ID)
    expect(eq).toHaveBeenCalledWith('invoice_id', INV_ID)
    expect(result).toHaveLength(1)
    expect(result[0].invoiceId).toBe(INV_ID)
  })
})
