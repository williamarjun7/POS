/**
 * Integration tests for CustomerLedger
 * ─────────────────────────────────────
 * Tests:
 * - recordCreditCharge validates input and creates payment + updates balance
 * - recordCreditPayment pays down balance
 * - getCustomerLedger returns full history
 * - ensureCustomer creates missing records
 *
 * Mocks:
 * - db helper (@/lib/db/insforge)
 * - Validation schemas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  recordCreditCharge,
  recordCreditPayment,
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

  it('rejects zero amount via Zod', async () => {
    await expect(
      recordCreditCharge('Ramesh Shrestha', 0, 'INV-001', 'Test charge'),
    ).rejects.toThrow(/amount/i)
  })

  it('rejects negative amount via Zod', async () => {
    await expect(
      recordCreditCharge('Ramesh Shrestha', -100, 'INV-001', 'Test charge'),
    ).rejects.toThrow(/amount/i)
  })

  it('rejects empty customer name via Zod', async () => {
    await expect(
      recordCreditCharge('', 100, 'INV-001', 'Test charge'),
    ).rejects.toThrow(/name/i)
  })

  it('creates a credit charge and updates balance', async () => {
    // Mock: customer already exists
    vi.mocked(db.findOne).mockResolvedValue({ data: mockCustomerRow, error: null })
    vi.mocked(db.insertOne).mockResolvedValue({ data: mockPaymentRow(), error: null })
    vi.mocked(db.update).mockResolvedValue({ data: null, error: null })

    await recordCreditCharge('Ramesh Shrestha', 1500, 'INV-001', 'Room service')

    // Should insert a payment record with method 'credit'
    expect(db.insertOne).toHaveBeenCalledWith('payments', expect.objectContaining({
      amount: 1500,
      payment_method: 'credit',
      customer_id: 'cust-1',
    }))

    // Should update the customer's balance: 2000 + 1500 = 3500
    expect(db.update).toHaveBeenCalledWith(
      'customers',
      expect.objectContaining({
        credit_balance: 3500,
      }),
      { id: 'cust-1' },
    )
  })

  it('creates a new customer if not found', async () => {
    // Mock: customer doesn't exist on first lookup
    vi.mocked(db.findOne)
      .mockResolvedValueOnce({ data: null, error: null }) // lookup fails
      .mockResolvedValueOnce({ data: { ...mockCustomerRow, credit_balance: 0 }, error: null }) // after creation

    vi.mocked(db.insertOne)
      .mockResolvedValueOnce({ data: { ...mockCustomerRow, credit_balance: 0 }, error: null })
      .mockResolvedValueOnce({ data: mockPaymentRow({ amount: 500 }), error: null })

    vi.mocked(db.update).mockResolvedValue({ data: null, error: null })

    await recordCreditCharge('New Customer', 500, 'INV-002', 'First charge')

    // Should create a customer record first
    expect(db.insertOne).toHaveBeenCalledWith('customers', expect.objectContaining({
      name: 'New Customer',
      phone: '',
    }))
  })
})

describe('CustomerLedger — recordCreditPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reduces customer credit balance', async () => {
    db.findOne = vi.fn().mockResolvedValue({ data: mockCustomerRow, error: null })
    db.insertOne = vi.fn().mockResolvedValue({ data: mockPaymentRow({ notes: 'Credit payment of Rs. 500.00' }), error: null })
    db.update = vi.fn().mockResolvedValue({ data: null, error: null })

    await recordCreditPayment('Ramesh Shrestha', 500, 'Paying down balance')

    // Insert payment record
    expect(db.insertOne).toHaveBeenCalledWith('payments', expect.objectContaining({
      amount: 500,
      payment_method: 'credit',
    }))

    // Reduce balance: 2000 - 500 = 1500
    expect(db.update).toHaveBeenCalledWith(
      'customers',
      expect.objectContaining({ credit_balance: 1500 }),
      { id: 'cust-1' },
    )
  })

  it('does nothing when balance is zero', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: { ...mockCustomerRow, credit_balance: 0 }, error: null })

    await recordCreditPayment('Ramesh Shrestha', 500)

    // No insert or update should happen
    expect(db.insertOne).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('caps payment at current balance (no negative balance)', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: mockCustomerRow, error: null })
    vi.mocked(db.insertOne).mockResolvedValue({ data: mockPaymentRow({ amount: 2000 }), error: null })
    vi.mocked(db.update).mockResolvedValue({ data: null, error: null })

    // Attempt to pay more than balance
    await recordCreditPayment('Ramesh Shrestha', 5000, 'Overpay')

    // Should only pay the actual balance (2000)
    expect(db.insertOne).toHaveBeenCalledWith('payments', expect.objectContaining({
      amount: 2000,
    }))
    expect(db.update).toHaveBeenCalledWith(
      'customers',
      expect.objectContaining({ credit_balance: 0 }),
      { id: 'cust-1' },
    )
  })
})

describe('CustomerLedger — getCustomerLedger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for unknown customer', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: null, error: null })

    const result = await getCustomerLedger('Nobody')
    expect(result).toBeNull()
  })

  it('returns ledger with entries for known customer', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: mockCustomerRow, error: null })
    vi.mocked(db.findMany).mockResolvedValue({
      data: [
        mockPaymentRow(),
        mockPaymentRow({ id: 'pay-2', amount: 500, notes: 'Credit payment' }),
      ],
      error: null,
    })

    const result = await getCustomerLedger('Ramesh Shrestha')

    expect(result).not.toBeNull()
    expect(result!.customerName).toBe('Ramesh Shrestha')
    expect(result!.currentBalance).toBe(2000)
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

  it('returns ledgers for active customers', async () => {
    vi.mocked(db.findMany)
      .mockResolvedValueOnce({ data: [mockCustomerRow], error: null }) // customers
      .mockResolvedValueOnce({ data: [mockPaymentRow()], error: null }) // payments

    const result = await getAllLedgers()
    expect(result).toHaveLength(1)
    expect(result[0].customerName).toBe('Ramesh Shrestha')
    expect(result[0].currentBalance).toBe(2000)
  })
})

describe('CustomerLedger — getCustomerBalance', () => {
  it('returns 0 for unknown customer', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: null, error: null })

    const balance = await getCustomerBalance('Nobody')
    expect(balance).toBe(0)
  })

  it('returns the credit_balance for known customer', async () => {
    vi.mocked(db.findOne).mockResolvedValue({ data: mockCustomerRow, error: null })

    const balance = await getCustomerBalance('Ramesh Shrestha')
    expect(balance).toBe(2000)
  })
})
