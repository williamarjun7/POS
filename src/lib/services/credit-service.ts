/**
 * Credit Service — Automatic Customer Linking for Partial Payments
 * ────────────────────────────────────────────────────────────────
 *
 * When a customer pays less than the invoice total, the ENTIRE remaining
 * amount is tracked as outstanding on the invoice (status = 'credit_invoice').
 * This service links the customer to the invoice so the customer profile
 * can display the outstanding balance.
 *
 * NOTE: This service no longer creates payment records or mutable counters.
 * Invoices are the single source of truth for outstanding credit.
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
 * Link a customer to an invoice when a partial payment is processed.
 *
 * This is called AFTER the primary payment record has been created.
 * It ensures the customer record exists and backfills customer_id on
 * the invoice so the outstanding balance appears in the customer profile.
 *
 * The operation is idempotent — calling it twice with the same invoiceId
 * is safe since it just re-links the customer.
 */
export async function createAutoCredit(
  input: CreditCreationInput,
): Promise<AutoCreditResult> {
  const { customerName, creditAmount, invoiceId } = input

  if (creditAmount <= 0) {
    return { success: false, error: 'Credit amount must be greater than zero.' }
  }

  if (!customerName || !customerName.trim()) {
    return { success: false, error: 'Customer name is required for credit transactions.' }
  }

  try {
    // Check idempotency — has this invoice already been linked to a customer?
    if (invoiceId) {
      const { data: existingInvoice } = await insforge.database
        .from('invoices')
        .select('customer_id')
        .eq('id', invoiceId)
        .maybeSingle()

      if (existingInvoice?.customer_id) {
        // Already linked — idempotent skip
        return { success: true, creditAmount, customerName, invoiceId }
      }
    }

    // Link customer to invoice (ensures customer exists + backfills customer_id)
    await recordCreditCharge(
      customerName.trim(),
      creditAmount,
      input.invoiceNumber,
      `Auto-credit from partial payment via ${input.paymentMethod}`,
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
