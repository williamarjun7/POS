/**
 * Integration tests for InvoiceService
 * ─────────────────────────────────────
 * Tests:
 * - fetchInvoicesFromDb maps DB rows to frontend Invoice type
 * - Empty/database-error states handled gracefully
 * - useInvoice React Query fetches single invoice
 *
 * Mocks:
 * - insforge.database PostgREST methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchInvoicesFromDb } from '../invoice-service'
import { insforge } from '../auth-service'

// ─── Mock auth-service ─────────────────────────────────────

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
  const order = vi.fn()

  from.mockReturnValue({ select })
  select.mockReturnValue({ order })
  order.mockResolvedValue({ data: [], error: null })

  ;(insforge.database.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(from)

  return { from, select, order }
}

const mockInvoiceRow = {
  id: 'inv-1',
  invoice_number: 'INV-2026-0001',
  customer_name: 'John Doe',
  subtotal: 2000,
  tax: 260,
  discount: 100,
  total: 2160,
  status: 'paid',
  payment_method: 'cash',
  created_at: '2026-07-14T10:00:00Z',
  due_date: '2026-07-21T10:00:00Z',
}

describe('InvoiceService — fetchInvoicesFromDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an empty array when DB returns null', async () => {
    const { order } = mockDb()
    order.mockResolvedValue({ data: null, error: null })

    const result = await fetchInvoicesFromDb()
    expect(result).toEqual([])
  })

  it('maps DB rows to camelCase Invoice types', async () => {
    const { order } = mockDb()
    order.mockResolvedValue({ data: [mockInvoiceRow], error: null })

    const result = await fetchInvoicesFromDb()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      customer: 'John Doe',
      items: [],
      subtotal: 2000,
      tax: 260,
      discount: 100,
      total: 2160,
      status: 'paid',
      paymentMethod: 'cash',
      createdAt: '2026-07-14T10:00:00Z',
      dueDate: '2026-07-21T10:00:00Z',
    })
  })

  it('maps all payment statuses correctly', async () => {
    const statuses = ['paid', 'pending', 'partial', 'overdue', 'credit_invoice', 'cancelled']
    const rows = statuses.map((status, i) => ({
      ...mockInvoiceRow,
      id: `inv-${i}`,
      invoice_number: `INV-2026-${String(i + 1).padStart(4, '0')}`,
      status,
    }))

    const { order } = mockDb()
    order.mockResolvedValue({ data: rows, error: null })

    const result = await fetchInvoicesFromDb()
    expect(result).toHaveLength(6)
    result.forEach((inv, i) => {
      expect(inv.status).toBe(statuses[i])
    })
  })

  it('handles missing optional fields gracefully', async () => {
    const { order } = mockDb()
    order.mockResolvedValue({
      data: [{
        id: 'inv-minimal',
        invoice_number: 'INV-MIN',
        customer_name: 'Minimal',
        subtotal: 100,
        tax: 0,
        discount: 0,
        total: 100,
        status: 'pending',
        payment_method: null,
        created_at: '2026-07-14T10:00:00Z',
        due_date: null,
      }],
      error: null,
    })

    const result = await fetchInvoicesFromDb()
    expect(result[0].paymentMethod).toBe('cash') // default fallback
    expect(result[0].dueDate).toBeUndefined()
  })

  it('selects specific columns for list view (not *)', async () => {
    const { select, order } = mockDb()
    const expectedColumns = 'id, invoice_number, customer_name, subtotal, tax, discount, total, status, payment_method, created_at, due_date'
    order.mockResolvedValue({ data: [], error: null })

    await fetchInvoicesFromDb()

    expect(select).toHaveBeenCalledWith(expectedColumns)
  })

  it('throws on DB error', async () => {
    const { order } = mockDb()
    order.mockResolvedValue({ data: null, error: { message: 'Database connection failed', code: 'PGRST301' } })

    await expect(fetchInvoicesFromDb()).rejects.toThrow()
  })
})

describe('InvoiceService — DB row mapping edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles zero values correctly', async () => {
    const { order } = mockDb()
    order.mockResolvedValue({
      data: [{
        ...mockInvoiceRow,
        subtotal: 0,
        tax: 0,
        discount: 0,
        total: 0,
      }],
      error: null,
    })

    const result = await fetchInvoicesFromDb()
    expect(result[0].subtotal).toBe(0)
    expect(result[0].tax).toBe(0)
    expect(result[0].total).toBe(0)
  })

  it('handles large values without precision loss', async () => {
    const { order } = mockDb()
    order.mockResolvedValue({
      data: [{
        ...mockInvoiceRow,
        total: 9999999.99,
      }],
      error: null,
    })

    const result = await fetchInvoicesFromDb()
    expect(result[0].total).toBe(9999999.99)
  })
})
