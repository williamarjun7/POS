/**
 * Process Payment RPC Service
 * ───────────────────────────
 * TypeScript wrapper around the `process_payment()` PostgreSQL function.
 *
 * This replaces 4+ client-side database round-trips with a single RPC call
 * that atomically creates the invoice, records the payment, and updates
 * batch items/statuses inside one database transaction.
 *
 * The RPC handles:
 *   - Authorization (user ID + role verification)
 *   - Input validation (amounts, IDs, payment method, table/batch consistency)
 *   - Invoice number generation (using DB sequence — no race condition)
 *   - New invoice creation or existing invoice status update
 *   - Payment recording (with server-side idempotency via UNIQUE reference)
 *   - Order batch items status update (concurrency gate)
 *   - Order batch status update (gated on NOT IN ('paid','cancelled'))
 *
 * Not handled here (deferred to client-side after navigation):
 *   - Invoice items insertion (Phase 3)
 *   - Inventory deduction (Phase 3)
 *   - Customer ledger updates (Phase 2)
 *   - Activity logging (already fire-and-forget)
 *
 * @see migrations/20260804000100_remove-tax-columns.sql
 */

import { insforge } from '@/lib/services/auth-service'
import type { PaymentMethod } from '@/types'

// ─── Error Codes (mapped from RPC response) ─────────────

export const PaymentErrorCode = {
  /** User not authorized to process payments */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Input validation failure */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** Invalid payment method supplied */
  INVALID_PAYMENT_METHOD: 'INVALID_PAYMENT_METHOD',
  /** Paid items don't match supplied batches */
  INVALID_BATCH: 'INVALID_BATCH',
  /** Batch doesn't belong to the specified table */
  INVALID_TABLE: 'INVALID_TABLE',
  /** Concurrency conflict — another cashier already paid these items */
  CONCURRENCY_CONFLICT: 'CONCURRENCY_CONFLICT',
  /** Unknown/unexpected error */
  UNKNOWN: 'UNKNOWN',
  /** Client-side error (network, timeout, etc.) */
  CLIENT_ERROR: 'CLIENT_ERROR',
  /** PostgREST RPC-level error */
  RPC_ERROR: 'RPC_ERROR',
} as const

export type PaymentErrorCodeType = typeof PaymentErrorCode[keyof typeof PaymentErrorCode]

// ─── Types ───────────────────────────────────────────────────

export interface ProcessPaymentParams {
  tableId: string
  customerName: string
  invoiceSubtotal: number
  invoiceDiscount: number
  invoiceTotal: number
  invoiceStatus: string
  paymentMethod: string
  paymentAmount: number
  paymentReference: string
  paymentNotes?: string
  userId?: string | null
  paidItemIds: string[]
  itemPaidStatus: string
  batchIds: string[]
  orderBatchIds: string[]
}

export interface ProcessPaymentResult {
  success: boolean
  isDuplicate?: boolean
  isNewInvoice?: boolean
  invoiceId?: string
  invoiceNumber?: string
  paymentId?: string | null
  batchUpdateCount?: number
  timingMs?: {
    total: number
    idempotency: number
    invoice: number
    payment: number
    batchItems: number
    batchStatus: number
  }
  /** Machine-readable error code (present when success=false) */
  code?: PaymentErrorCodeType
  /** Human-readable error description */
  error?: string
  /** PostgreSQL SQLSTATE code */
  sqlstate?: string
  /** Additional structured error details */
  details?: Record<string, unknown>
  /** Execution time in milliseconds (present on error paths) */
  elapsedMs?: number
}

// ─── RPC Caller ──────────────────────────────────────────────

/**
 * Call the `process_payment` PostgreSQL RPC.
 *
 * All critical payment operations execute inside a single database
 * transaction. Returns a structured JSON response with typed error codes.
 *
 * @param params - Payment parameters matching the RPC function signature
 * @returns Structured result with success/error information
 */
export async function callProcessPayment(
  params: ProcessPaymentParams,
): Promise<ProcessPaymentResult> {
  const startTime = performance.now()

  try {
    const { data, error } = await insforge.database.rpc('process_payment', {
      p_table_id: params.tableId,
      p_customer_name: params.customerName,
      p_invoice_subtotal: params.invoiceSubtotal,
      p_invoice_discount: params.invoiceDiscount,
      p_invoice_total: params.invoiceTotal,
      p_invoice_status: params.invoiceStatus,
      p_payment_method: params.paymentMethod,
      p_payment_amount: params.paymentAmount,
      p_payment_reference: params.paymentReference,
      p_payment_notes: params.paymentNotes ?? null,
      p_user_id: params.userId ?? null,
      p_paid_item_ids: params.paidItemIds,
      p_item_paid_status: params.itemPaidStatus,
      p_batch_ids: params.batchIds,
      p_order_batch_ids: params.orderBatchIds,
    })

    const elapsedMs = Math.round(performance.now() - startTime)

    if (error) {
      // RPC-level error (network, auth, or unhandled PG exception)
      return {
        success: false,
        error: error.message || 'RPC call failed',
        code: error.code === 'PGRST301' ? PaymentErrorCode.UNAUTHORIZED : PaymentErrorCode.RPC_ERROR,
        elapsedMs,
      }
    }

    // Parse the JSONB response from the RPC
    const result = data as unknown as ProcessPaymentResult

    // Merge client-side timing with server-side timing for observability
    const response = {
      ...result,
      elapsedMs: result.elapsedMs ?? elapsedMs,
    }

    // Log timing instrumentation in development
    if (import.meta.env.DEV && result.timingMs) {
      console.log('[PAYMENT:RPC]', JSON.stringify({
        event: 'payment.rpc_timing',
        invoiceNumber: result.invoiceNumber,
        isDuplicate: result.isDuplicate,
        isNewInvoice: result.isNewInvoice,
        code: result.code,
        timingMs: result.timingMs,
        elapsedMs,
      }))
    }

    return response
  } catch (err) {
    // Unexpected error (e.g., network failure, timeout)
    const elapsedMs = Math.round(performance.now() - startTime)
    const message = err instanceof Error ? err.message : 'Unexpected error calling process_payment RPC'
    if (import.meta.env.DEV) {
      console.error('[PAYMENT:RPC] Unexpected error:', message)
    }
    return {
      success: false,
      error: message,
      code: PaymentErrorCode.CLIENT_ERROR,
      elapsedMs,
    }
  }
}
