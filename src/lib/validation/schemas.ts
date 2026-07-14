/**
 * Zod Validation Schemas
 * ======================
 *
 * Single source of truth for all data validation across the POS system.
 * Every service that accepts user/API input MUST validate against these schemas.
 *
 * Usage:
 *   import { paymentSchemas, orderSchemas } from '@/lib/validation/schemas'
 *
 *   const safe = paymentSchemas.createPayment.parse(rawData)
 *   const result = paymentSchemas.createPayment.safeParse(rawData)
 *
 * Schemas mirror the DB CHECK constraints defined in migrations.
 */

import { z } from 'zod'
import { DB_PAYMENT_CHANNEL_VALUES } from '@/lib/payment-methods'

// ─── Helpers ───────────────────────────────────────────────────

/** UUID v4 pattern */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** ISO date string (e.g. "2026-07-14" or "2026-07-14T12:00:00Z") */
const isoDateString = z.string().min(1).refine(
  (v) => !isNaN(Date.parse(v)),
  { message: 'Must be a valid ISO date string' },
)

// ─── Shared Primitives ─────────────────────────────────────────

export const uuid = z.string().regex(uuidPattern, 'Must be a valid UUID')
export const positiveNumber = z.number().positive('Must be greater than 0')
export const nonNegativeNumber = z.number().min(0, 'Must not be negative')
export const monetaryAmount = z.number().min(0.01, 'Amount must be at least 0.01').max(999999999.99, 'Amount too large')
export const safeString = z.string().min(1).max(5000, 'String too long').trim()
export const shortString = z.string().max(500, 'Too long').transform(s => s.trim())
export const optionalSafeString = z.string().max(5000).trim().optional().or(z.literal(''))
export const referenceString = z.string().max(100, 'Reference too long').trim().optional().or(z.literal(''))

/** DB-safe payment method (the 4 base channels stored in payments table) */
export const dbPaymentMethod = z.enum(
  DB_PAYMENT_CHANNEL_VALUES as [string, ...string[]],
  { errorMap: () => ({ message: `Payment method must be one of: ${DB_PAYMENT_CHANNEL_VALUES.join(', ')}` })},
)

// ─── Payment Schemas ───────────────────────────────────────────

export const paymentSchemas = {
  /** Validate data before creating a payment record */
  createPayment: z.object({
    invoiceId: uuid,
    amount: monetaryAmount,
    paymentMethod: dbPaymentMethod,
    reference: referenceString,
    notes: optionalSafeString,
    userId: optionalSafeString,
    customerId: optionalSafeString,
    batchId: optionalSafeString,
  }),

  /** Validate invoice ID before fetching payments */
  fetchByInvoice: z.object({
    invoiceId: uuid,
  }),

  /** Validate payment ID before deletion */
  deletePayment: z.object({
    id: uuid,
  }),
}

// ─── Order Batch Schemas ───────────────────────────────────────

export const orderBatchSchemas = {
  /** Validate data before creating an order batch */
  createBatch: z.object({
    tableId: optionalSafeString,
    roomId: optionalSafeString,
    customerName: z.string().max(200).trim().optional().or(z.literal('')),
    customerId: optionalSafeString,
    status: z.enum(['pending', 'partial', 'paid', 'cancelled']).default('pending'),
    subtotal: nonNegativeNumber.default(0),
    discount: nonNegativeNumber.default(0),
  }),

  /** Validate status update */
  updateStatus: z.object({
    id: uuid,
    status: z.enum(['pending', 'partial', 'paid', 'cancelled']),
  }),
}

// ─── Order Batch Item Schemas ──────────────────────────────────

export const orderBatchItemSchemas = {
  /** Validate data before adding an item to a batch */
  createItem: z.object({
    batchId: uuid,
    menuItemId: optionalSafeString,
    name: safeString.min(1, 'Item name is required'),
    quantity: z.number().int().positive('Quantity must be at least 1').max(9999, 'Quantity too large'),
    unitPrice: monetaryAmount,
    notes: z.string().max(1000).trim().default(''),
    status: z.enum(['pending', 'paid', 'credit', 'cancelled']).default('pending'),
  }),

  /** Validate batch item ID lookup */
  findByBatchId: z.object({
    batchId: uuid,
  }),
}

// ─── Invoice Schemas ───────────────────────────────────────────

export const invoiceSchemas = {
  /** Validate invoice ID lookup */
  fetchById: z.object({
    id: uuid,
  }),
}

// ─── Invoice Item Schemas ──────────────────────────────────────

export const invoiceItemSchemas = {
  /** Validate data before inserting invoice items (batch insert) */
  insertItems: z.object({
    invoiceId: uuid,
    items: z.array(z.object({
      menuItemId: optionalSafeString,
      name: safeString.min(1, 'Item name is required'),
      quantity: z.number().int().positive('Quantity must be at least 1').max(9999),
      unitPrice: monetaryAmount,
    })).min(1, 'At least one item is required').max(500, 'Too many items'),
  }),

  /** Validate invoice ID for fetching items */
  fetchByInvoiceId: z.object({
    invoiceId: uuid,
  }),
}

// ─── Customer Ledger Schemas ───────────────────────────────────

export const customerLedgerSchemas = {
  /** Validate credit charge (customer buys on credit) */
  creditCharge: z.object({
    customerName: safeString.min(1, 'Customer name is required').max(200),
    amount: monetaryAmount,
    invoiceNumber: referenceString,
    description: optionalSafeString,
    invoiceId: optionalSafeString,
  }),

  /** Validate credit payment (customer pays down balance) */
  creditPayment: z.object({
    customerName: safeString.min(1, 'Customer name is required').max(200),
    amount: monetaryAmount,
    description: optionalSafeString,
  }),
}

// ─── Expense Schemas ───────────────────────────────────────────

export const expenseSchemas = {
  /** Validate expense creation */
  createExpense: z.object({
    description: safeString.min(1, 'Description is required').max(2000),
    category: z.enum(['utilities', 'supplies', 'maintenance', 'staff', 'marketing', 'other']),
    amount: monetaryAmount,
    date: isoDateString,
    paymentMethod: dbPaymentMethod,
    recordedBy: optionalSafeString,
    receiptUrl: optionalSafeString,
    notes: optionalSafeString,
    vendor: optionalSafeString,
    receiptNumber: optionalSafeString,
  }),
}

// ─── Customer Schemas ──────────────────────────────────────────

export const customerSchemas = {
  /** Validate customer creation */
  createCustomer: z.object({
    name: safeString.min(1, 'Name is required').max(200),
    phone: z.string().max(50).trim().default(''),
    email: z.string().email('Invalid email').max(255).or(z.literal('')).default(''),
    address: z.string().max(500).trim().default(''),
  }),

  /** Validate customer lookup */
  findByName: z.object({
    name: safeString.min(1),
  }),
}

// ─── Inventory Schemas ─────────────────────────────────────────

export const inventorySchemas = {
  /** Validate inventory item creation */
  createItem: z.object({
    name: safeString.min(1, 'Name is required').max(200),
    category: z.string().max(100).trim().default(''),
    currentStock: nonNegativeNumber.default(0),
    minStock: nonNegativeNumber.default(0),
    unit: z.string().max(50).trim().default('kg'),
    costPerUnit: nonNegativeNumber.default(0),
  }),

  /** Validate stock adjustment */
  adjustStock: z.object({
    itemId: uuid,
    quantity: z.number().finite(),
    notes: optionalSafeString,
  }),
}

// ─── Booking Schemas ───────────────────────────────────────────

export const bookingSchemas = {
  /** Validate booking creation */
  createBooking: z.object({
    guestName: safeString.min(1, 'Guest name is required').max(200),
    guestEmail: z.string().email('Invalid email').max(255).or(z.literal('')).default(''),
    guestPhone: z.string().max(50).trim().default(''),
    roomId: uuid,
    checkIn: isoDateString,
    checkOut: isoDateString,
    status: z.enum(['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled']).default('pending'),
    totalAmount: nonNegativeNumber.default(0),
    paidAmount: nonNegativeNumber.default(0),
    paymentStatus: z.enum(['pending', 'partial', 'paid', 'refunded']).default('pending'),
    specialRequests: optionalSafeString,
    adults: z.number().int().min(1).default(1),
    children: z.number().int().min(0).default(0),
  }),
}

// ─── Validation Error Formatting ───────────────────────────────

/**
 * Formats a Zod validation error into a user-friendly message string.
 *
 * @example
 *   const result = paymentSchemas.createPayment.safeParse(data)
 *   if (!result.success) {
 *     const msg = formatZodError(result.error)
 *     showError(msg)
 *   }
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    .join('; ')
}

/**
 * Throws a user-friendly validation error if the input is invalid.
 * The error message concatenates all issues.
 *
 * @example
 *   const safe = validateOrThrow(paymentSchemas.createPayment, rawData)
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(formatZodError(result.error))
  }
  return result.data
}
