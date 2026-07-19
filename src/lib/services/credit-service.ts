/**
 * Credit Service — Automatic Credit Creation for Partial Payments
 * ────────────────────────────────────────────────────────────────
 *
 * When a customer pays less than the invoice total, the ENTIRE remaining
 * amount MUST automatically become customer credit. This service handles
 * that conversion.
 *
 * This wraps the lower-level recordCreditCharge from customer-ledger.ts
 * with additional validation, idempotency checks, and cache invalidation.
 */

import { recordCreditCharge } from '@/lib/services/customer-ledger'
import type { PartialPaymentPlan } from '@/lib/services/partial-payment-service'
import { insforge } from '@/lib/services/auth-service'

// ─── Types ───────────────────────────────────────────────────

export interface AutoCreditResult {
  success: true
  creditAmount: number
  customerName: string
  invoiceId?: string
} | {
  success: false
  error: string
}

export interface CreditCreationInput {
  customerName: string
  creditAmount: number
  invoiceNumber: string
  invoiceId?: string
  paymentMethod: string
}

// ─── Auto-Credit Creation ────────────────────────────────────

/**
 * Automatically create a credit payment record when a partial payment is processed.
 *
 * This is called AFTER the primary payment record has been created.
 * It creates an ADDITIONAL payment record with method 'credit' for the
 * remaining amount and updates the customer's credit balance.
 *
 * The operation is designed to be idempotent — calling it twice with the
 * same invoiceNumber and customerName will skip if a credit record already exists.
 */
export async function createAutoCredit(
  input: CreditCreationInput,
): Promise<AutoCreditResult> {
  const { customerName, creditAmount, invoiceNumber, invoiceId, paymentMethod } = input

  if (creditAmount <= 0) {
    return { success: false, error: 'Credit amount must be greater than zero.' }
  }

  if (!customerName || !customerName.trim()) {
    return { success: false, error: 'Customer name is required for credit transactions.' }
  }

  try {
    // Check idempotency — has this credit already been recorded for this invoice?
    const { data: existingCredit } = await insforge.database
      .from('payments')
      .select('id')
      .eq('reference', invoiceNumber)
      .eq('payment_method', 'credit')
      .maybeSingle()

    if (existingCredit) {
      // Already recorded — idempotent skip
      return { success: true, creditAmount, customerName, invoiceId }
    }

    // Record the credit charge (creates payment record + updates customer balance)
    await recordCreditCharge(
      customerName.trim(),
      creditAmount,
      invoiceNumber,
      `Auto-credit from partial payment via ${paymentMethod}`,
      invoiceId,
    )

    return { success: true, creditAmount, customerName, invoiceId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error creating credit'
    console.error('[CreditService] Failed to create auto-credit:', message)
    return { success: false, error: message }
  }
}

/**
 * Create auto-credit from a PartialPaymentPlan.
 * Convenience wrapper that extracts fields from the plan.
 */
export async function createAutoCreditFromPlan(
  plan: PartialPaymentPlan,
  invoiceNumber: string,
  invoiceId: string | undefined,
  paymentMethod: string,
): Promise<AutoCreditResult> {
  if (!plan.hasCredit || !plan.customerName) {
    return { success: false, error: 'No credit needed or missing customer' }
  }

  return createAutoCredit({
    customerName: plan.customerName,
    creditAmount: plan.creditAmount,
    invoiceNumber,
    invoiceId,
    paymentMethod,
  })
}
