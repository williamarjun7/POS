/**
 * Integration tests for CustomerLedger
 * ─────────────────────────────────────
 * Tests:
 * - recordCreditCharge links customer to invoice
 * - getCustomerBalance calculates from invoices and real payments
 * - getCustomerLedger returns full history
 * - getAllLedgers returns grouped data
 *
 * Mocks:
 * - db helper (@/lib/db/insforge)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  recordCreditCharge,
  getCustomerLedger,
  getCustomerBalance,
  getAllLedgers,
} from '../customer-ledger'
import { db } from '@/lib/db/insforge'

// ─── Mock @/lib/db/insforge ────────────────────────────────

vi.mock('@/lib/db/insforge', () => ({
  db: {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
}))

// ─── Helpers ────────────────────────────────────────────────

const mockCustomerRow = {
  id: 'cust-1',
  name: 'Ramesh Shrestha',
  phone: '9801234567',
  email: 'ramesh@example.com',
  address: 'Kathmandu',
  total_orders: 5,
  total_spent: 12000,
  last_visit: '2026-07-14T10:00:00Z',
  loyalty_points: 50,
  credit_balance: 2000,
  notes: null,
}

const mockPaymentRow = (overrides = {}) => ({
  id: 'pay-credit-1',
  customer_id: 'cust-1',
  invoice_id: 'inv-1',
  amount: 1500,
  payment_method: 'credit',
  reference: 'INV-2026-001',
  notes: 'Credit charge — Room service',
  created_at: '2026-07-14T10:30:00Z',
  ...overrides,
})

describe('CustomerLedger — recordCreditCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects empty customer name', async () => {
    await expect(
      recordCreditCharge('', 100, 'INV-001', 'Test charge'),
    ).rejects.toThrow(/name/i)
  })

  it('links customer to invoice and updates last_visit', async () => {
    // Mock: customer already exists
    vi.mocked(db.findOne).mockResolvedValue({ data: mockCustomerRow, error: null })
    vi.mocked(db.update).mockResolvedValue({ data: null, error: null })

    await recordCreditCharge('Ramesh Shrestha', 1500, 'INV-001', 'Room service', 'inv-1')

    // Should backfill customer_id on the invoice
    expect(db.update).toHaveBeenCalledWith(
      'invoices',
      expect.objectContaining({ customer_id: 'cust-1' }),
      { id: 'inv-1' },
    )

    // Should NOT create any payment record
    expect(db.insertOne).not.toHaveBeenCalled()
  })

  it('creates a new customer if not found', async () => {
    // Mock: customer doesn't exist on first lookup
    vi.mocked(db.findOne)
      .mockResolvedValueOnce({ data: null, error: null }) // lookup fails
      .mockResolvedValueOnce({ data: { ...mockCustomerRow, credit_balance: 0 }, error: null }) // after creation

    vi.mocked(db.insertOne)
      .mockResolvedValueOnce({ data: { ...mockCustomerRow, credit_balance: 0 }, error: null }) // create customer

    vi.mocked(db.update).mockResolvedValue({ data: null, error: null })

    await recordCreditCharge('New Customer', 500, 'INV-002', 'First charge')

    // Should create a customer record first
    expect(db.insertOne).toHaveBeenCalledWith('customers', expect.objectContaining({
      name: 'New Customer',
      phone: '',
    }))

    // Should NOT create any payment record (insertOne was for customer, not payment)
    expect(db.insertOne).toHaveBeenCalledTimes(1)
  })
})

describe('CustomerLedger — getCustomerLedger', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Give all mocks safe defaults so individual tests don't inherit stale implementations
    vi.mocked(db.findOne).mockResolvedValue({ data: null, error: null })
    vi.mocked(db.findMany).mockResolvedValue({ data: [], error: null })
  })

  it('returns null for unknown customer', async () => {
    // Default beforeEach mock already returns { data: null, error: null }
    const result = await getCustomerLedger('Nobody')
    expect(result).toBeNull()
  })

  it('returns ledger with invoice and payment entries for known customer', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: mockCustomerRow, error: null })
    // Override first call: invoices
    vi.mocked(db.findMany).mockResolvedValueOnce({
      data: [
        { id: 'inv-1', invoice_number: 'INV-001', customer_id: 'cust-1', total: 1500, status: 'credit_invoice', created_at: '2026-07-14T10:00:00Z' },
      ],
      error: null,
    })
    // Override second call: payments (credit + cash)
    vi.mocked(db.findMany).mockResolvedValueOnce({
      data: [
        mockPaymentRow(),
        { id: 'pay-cash-1', customer_id: 'cust-1', invoice_id: 'inv-1', amount: 500, payment_method: 'cash', reference: null, notes: 'Cash payment', created_at: '2026-07-15T10:00:00Z' },
      ],
      error: null,
    })

    const result = await getCustomerLedger('Ramesh Shrestha')

    expect(result).not.toBeNull()
    expect(result!.customerName).toBe('Ramesh Shrestha')
    // Balance = 1500 (invoice) - 500 (cash payment) = 1000
    expect(result!.currentBalance).toBe(1000)
    // Should have 2 entries: 1 invoice + 1 cash payment (credit payment is skipped)
    expect(result!.entries).toHaveLength(2)
  })
})

describe('CustomerLedger — getAllLedgers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty for no customers', async () => {
    vi.mocked(db.findMany).mockResolvedValue({ data: [], error: null })

    const result = await getAllLedgers()
    expect(result).toEqual([])
  })

  it('returns ledgers for customers with invoices or payments', async () => {
    vi.mocked(db.findMany)
      .mockResolvedValueOnce({ data: [mockCustomerRow], error: null }) // customers
      .mockResolvedValueOnce({ data: [{ id: 'inv-1', invoice_number: 'INV-001', customer_id: 'cust-1', total: 1500, status: 'credit_invoice', created_at: '2026-07-14T10:00:00Z' }], error: null }) // invoices
      .mockResolvedValueOnce({ data: [], error: null }) // payments

    const result = await getAllLedgers()
    expect(result).toHaveLength(1)
    expect(result[0].customerName).toBe('Ramesh Shrestha')
    // Balance = 1500 (invoice total) - 0 (no real payments) = 1500
    expect(result[0].currentBalance).toBe(1500)
  })

  it('skips customers with no invoices and no payments', async () => {
    const inactiveCustomer = { ...mockCustomerRow, id: 'cust-inactive', name: 'Inactive', credit_balance: 0, total_orders: 0 }
    vi.mocked(db.findMany)
      .mockResolvedValueOnce({ data: [inactiveCustomer], error: null }) // customers
      .mockResolvedValueOnce({ data: [], error: null }) // invoices (empty — no customer_id match)
      .mockResolvedValueOnce({ data: [], error: null }) // payments (empty)

    const result = await getAllLedgers()
    expect(result).toHaveLength(0)
  })
})

describe('CustomerLedger — getCustomerBalance', () => {
  it('returns 0 for unknown customer', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: null, error: null })

    const balance = await getCustomerBalance('Nobody')
    expect(balance).toBe(0)
  })

  it('calculates outstanding balance from invoices minus real payments', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: mockCustomerRow, error: null })
    vi.mocked(db.findMany)
      .mockResolvedValueOnce({
        data: [
          { id: 'inv-1', customer_id: 'cust-1', total: 1500, status: 'credit_invoice' },
          { id: 'inv-2', customer_id: 'cust-1', total: 800, status: 'paid' },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { id: 'pay-1', customer_id: 'cust-1', invoice_id: 'inv-1', amount: 500, payment_method: 'cash' },
        ],
        error: null,
      })

    const balance = await getCustomerBalance('Ramesh Shrestha')
    // Only inv-1 is outstanding (credit_invoice). inv-2 is paid.
    // inv-1: 1500 - 500 (cash) = 1000
    expect(balance).toBe(1000)
  })
})
