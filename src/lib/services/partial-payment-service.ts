/**
 * Partial Payment Service — Pure Business Logic
 * ──────────────────────────────────────────────
 *
 * Single source of truth for all partial-payment calculations.
 * NO React, NO DB calls — pure functions that can be tested in isolation.
 *
 * Golden Rule:
 *   If Total Paid < Invoice Total, the ENTIRE remaining amount MUST
 *   automatically become Customer Credit. No exceptions.
 *   Every unpaid rupee always belongs to a customer.
 */

import { z } from 'zod'

// ─── Types ───────────────────────────────────────────────────

export interface PartialPaymentPlan {
  /** Amount the customer is paying right now (non-credit) */
  paidAmount: number
  /** Amount that will automatically become customer credit */
  creditAmount: number
  /** Total invoice value */
  invoiceTotal: number
  /** Whether this is a full settlement (no credit created) */
  isFullSettlement: boolean
  /** Whether credit will be created */
  hasCredit: boolean
  /** Invoice status after this payment */
  invoiceStatus: 'paid' | 'partially_paid'
  /** Customer name — required when hasCredit is true */
  customerName: string | null
}

export interface PartialPaymentInput {
  invoiceTotal: number
  paidAmount: number
  customerName?: string | null
}

// ─── Validation Schemas ──────────────────────────────────────

export const partialPaymentInputSchema = z.object({
  invoiceTotal: z.number().positive('Invoice total must be positive'),
  paidAmount: z.number().min(0, 'Paid amount cannot be negative'),
  customerName: z.string().nullable().optional(),
})

export const validatePartialPayment = (input: PartialPaymentInput): PartialPaymentInput => {
  const result = partialPaymentInputSchema.safeParse(input)
  if (!result.success) {
    const message = result.error.errors.map(e => e.message).join('; ')
    throw new Error(message)
  }
  return input
}

// ─── Core Calculation ────────────────────────────────────────

/**
 * Calculate the payment plan for a partial payment.
 *
 * If paidAmount < invoiceTotal, the remaining automatically becomes
 * customer credit. Customer validation is DEFERRED — the plan reports
 * `needsCustomer: true` when credit is involved but no customer is set.
 * The parent handles customer assignment AFTER payment succeeds.
 *
 * Pure function — no side effects, no DB calls.
 *
 * @throws {Error} If paidAmount > invoiceTotal
 */
export function calculatePartialPayment(input: PartialPaymentInput): PartialPaymentPlan {
  const safe = validatePartialPayment(input)
  const { invoiceTotal, paidAmount } = safe

  if (paidAmount > invoiceTotal) {
    throw new Error(
      `Payment amount (${formatAmount(paidAmount)}) exceeds invoice total (${formatAmount(invoiceTotal)}).`,
    )
  }

  if (paidAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.')
  }

  const creditAmount = Math.max(0, invoiceTotal - paidAmount)
  const hasCredit = creditAmount > 0
  const isFullSettlement = !hasCredit
  const customerName = safe.customerName ?? null

  // Customer validation is DEFERRED to after payment success.
  // The plan notifies the parent with needsCustomer flag.

  return {
    paidAmount,
    creditAmount,
    invoiceTotal,
    isFullSettlement,
    hasCredit,
    invoiceStatus: isFullSettlement ? 'paid' : 'partially_paid',
    customerName,
  }
}

/**
 * Calculate the plan from an amount input string (as the user types it).
 * Returns null for invalid input instead of throwing.
 */
export function calculatePartialPaymentSafe(
  input: PartialPaymentInput,
): { plan: PartialPaymentPlan } | { error: string } {
  try {
    return { plan: calculatePartialPayment(input) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid payment' }
  }
}

/**
 * After payment succeeds, verify that a customer is available for credit.
 * Returns an error string or null. Call this before creating credit records.
 */
export function validateCustomerForCredit(
  creditAmount: number,
  customerName: string | null | undefined,
): string | null {
  if (creditAmount > 0 && !customerName) {
    return 'A customer is required when creating credit. Please select or create a customer.'
  }
  return null
}

// ─── Helpers ─────────────────────────────────────────────────

export function formatAmount(amount: number): string {
  return `Rs. ${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

export const npr = formatAmount
