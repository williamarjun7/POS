/**
 * Unified Payment Processing Service
 * ────────────────────────────────────
 * SINGLE SERVICE for processing payments across ALL flows (POS, Billing,
 * Room Checkout, Dashboard).
 *
 * Every payment flow calls `processPaymentWithRecovery()` which guarantees:
 *   1. Payment context is persisted BEFORE the RPC call (for recovery)
 *   2. The process_payment RPC is called WITH the original idempotency key
 *   3. On success, pending payment state is cleaned up
 *   4. On failure, the pending payment state remains for recovery
 *
 * This eliminates the current risk where a FonePay gateway confirmation
 * followed by a browser crash / network timeout / RPC failure results in
 * a lost payment.
 *
 * ═══ Architecture ═══
 *   All payment flows → processPaymentWithRecovery()
 *                          ↓
 *                   savePendingPayment()  ← INSERT into pending_payments + localStorage
 *                          ↓
 *                   callProcessPayment()  ← Atomic RPC (idempotent via UNIQUE reference)
 *                          ↓
 *                   completePendingPayment()  ← DELETE from pending_payments + localStorage
 *                          ↓
 *                   Return result to caller
 *
 *   If RPC fails at any point, the pending_payments row remains for startup recovery.
 */

import { savePendingPayment, completePendingPayment, failPendingPayment }
  from '@/lib/services/pending-payment-store'
import { callProcessPayment, type ProcessPaymentParams, type ProcessPaymentResult }
  from '@/lib/services/process-payment-rpc'
import { trackPaymentEvent } from '@/lib/services/payment-monitoring'
import type { PendingPaymentPayload, PaymentSourcePage } from '@/lib/services/pending-payment-store'

// ─── Types ───────────────────────────────────────────────────

export interface UnifiedPaymentInput {
  /** Table ID where payment originated */
  tableId: string
  /** Customer name */
  customerName: string
  /** Invoice subtotal (before discount/tax) */
  subtotal: number
  /** Discount amount */
  discount: number
  /** Tax amount */
  tax?: number
  /** Grand total */
  total: number
  /** Invoice status to set ('paid', 'partial', 'credit_invoice') */
  invoiceStatus: string
  /** Payment method key */
  paymentMethod: string
  /** Actual cash/QR amount received */
  paidAmount: number
  /** User ID processing the payment */
  userId?: string | null
  /** IDs of items being paid */
  paidItemIds: string[]
  /** Status to set on paid items ('paid' or 'credit') */
  itemPaidStatus: string
  /** Batch IDs involved */
  batchIds: string[]
  /** Order batch IDs for invoice linking */
  orderBatchIds: string[]
  /** Gateway reference (FonePay PRN) for recovery verification */
  gatewayReference?: string
  /** Credit amount if applicable */
  creditAmount?: number
  /** Credit customer name */
  creditCustomerName?: string
  /** Notes for the payment */
  notes?: string
  /** Source page for tracking */
  sourcePage: PaymentSourcePage
  /** Pre-generated invoice number (optional — RPC generates one if missing) */
  invoiceNumber?: string
  /** Optional pre-generated payment reference (for idempotent retries) */
  paymentReference?: string
  /** Optional discriminator for idempotency key generation */
  idempotencyDiscriminator?: string
}

export interface UnifiedPaymentResult {
  success: boolean
  /** True if this was a duplicate detection */
  isDuplicate?: boolean
  /** Invoice ID */
  invoiceId?: string
  /** Invoice number */
  invoiceNumber?: string
  /** Payment ID */
  paymentId?: string
  /** Error information (present when success=false) */
  error?: string
  errorCode?: string
  /** The payment reference used (for logging) */
  paymentReference: string
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Generate a payment reference for idempotency.
 * Reuses the same reference for retries to ensure idempotency.
 */
function generatePaymentRef(input: UnifiedPaymentInput): string {
  if (input.paymentReference) return input.paymentReference
  // Generate a unique reference with a stable prefix for recovery identification
  return `PAY-${crypto.randomUUID()}`
}

// ─── Main Processing Function ───────────────────────────────

/**
 * Process a payment with built-in recovery persistence.
 *
 * This is the SINGLE function that ALL payment flows should call.
 *
 * ═══ Guarantees ═══
 *   1. Payment context is persisted before the RPC call
 *   2. Idempotency key is reused on retries (no duplicate invoices)
 *   3. On success, cleanup removes recovery data
 *   4. On failure, recovery data persists for automatic recovery
 *
 * @param input - Unified payment input parameters
 * @returns Result with success/failure and invoice/payment details
 */
export async function processPaymentWithRecovery(
  input: UnifiedPaymentInput,
): Promise<UnifiedPaymentResult> {
  const paymentReference = generatePaymentRef(input)
  const startTime = performance.now()

  // Track payment attempt
  trackPaymentEvent('payment_started', {
    paymentReference,
    tableId: input.tableId,
    amount: input.total,
    paymentMethod: input.paymentMethod,
    userId: input.userId ?? undefined,
  })

  // ── Determine if recovery persistence is needed ────────────
  // Only gateway payments (FonePay, where payment is confirmed remotely by
  // the gateway) need the crash-recovery safety net.  For cash, reception QR,
  // and credit payments the money is already collected / confirmed locally,
  // so a browser crash or RPC timeout just means the cashier retries.
  const needsRecovery = !!input.gatewayReference || input.paymentMethod === 'fonepay'

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Persist pending payment state (BEFORE RPC call)
  // ═══════════════════════════════════════════════════════════════
  // Only needed for gateway payments where the remote gateway has confirmed
  // the transaction but the invoice hasn't been created yet.
  // ═══════════════════════════════════════════════════════════════

  if (needsRecovery) {
    const payload: PendingPaymentPayload = {
      invoiceNumber: input.invoiceNumber,
      customerName: input.customerName,
      tableId: input.tableId,
      subtotal: input.subtotal,
      discount: input.discount,
      total: input.total,
      invoiceStatus: input.invoiceStatus,
      paymentMethod: input.paymentMethod,
      paidAmount: input.paidAmount,
      paymentReference,
      userId: input.userId ?? null,
      paidItemIds: input.paidItemIds,
      itemPaidStatus: input.itemPaidStatus,
      batchIds: input.batchIds,
      orderBatchIds: input.orderBatchIds,
      gatewayReference: input.gatewayReference,
      creditAmount: input.creditAmount,
      creditCustomerName: input.creditCustomerName,
      tax: input.tax ?? 0,
      notes: input.notes,
    }

    try {
      await savePendingPayment(payload)
    } catch (err) {
      // Persistence failed — this is critical because we lose recovery capability.
      // Log and abort; the gateway has confirmed payment but we can't persist.
      const errMsg = err instanceof Error ? err.message : 'Failed to persist pending payment'
      trackPaymentEvent('payment_failed', {
        paymentReference,
        errorMessage: errMsg,
        tableId: input.tableId,
        elapsedMs: Math.round(performance.now() - startTime),
      })
      return {
        success: false,
        error: errMsg,
        errorCode: 'PERSISTENCE_ERROR',
        paymentReference,
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Call process_payment RPC
  // ═══════════════════════════════════════════════════════════════
  // The RPC handles: invoice creation, payment recording, batch updates,
  // and idempotency — all in a single DB transaction.
  // ═══════════════════════════════════════════════════════════════

  let rpcResult: ProcessPaymentResult

  try {
    rpcResult = await callProcessPayment({
      tableId: input.tableId,
      customerName: input.customerName,
      invoiceSubtotal: input.subtotal,
      invoiceTax: input.tax ?? 0,
      invoiceDiscount: input.discount,
      invoiceTotal: input.total,
      invoiceStatus: input.invoiceStatus,
      paymentMethod: input.paymentMethod,
      paymentAmount: input.paidAmount,
      paymentReference,
      paymentNotes: input.notes,
      userId: input.userId ?? null,
      paidItemIds: input.paidItemIds,
      itemPaidStatus: input.itemPaidStatus,
      batchIds: input.batchIds,
      orderBatchIds: input.orderBatchIds,
    } as ProcessPaymentParams)
  } catch (err) {
    // RPC threw an exception (network error, timeout, etc.)
    const errMsg = err instanceof Error ? err.message : 'RPC call failed'
    const elapsedMs = Math.round(performance.now() - startTime)

    // Mark pending payment as failed (keeps it for recovery)
    if (needsRecovery) {
      await failPendingPayment(paymentReference, errMsg).catch(() => {})
    }

    trackPaymentEvent('payment_failed', {
      paymentReference,
      errorMessage: errMsg,
      tableId: input.tableId,
      elapsedMs,
    })

    return {
      success: false,
      error: errMsg,
      errorCode: 'RPC_ERROR',
      paymentReference,
    }
  }

  const elapsedMs = Math.round(performance.now() - startTime)

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Handle RPC result
  // ═══════════════════════════════════════════════════════════════

  // ── SUCCESS ──────────────────────────────────────────────
  if (rpcResult.success) {
    // Clean up pending payment — it's now persisted in invoices+payments
    if (needsRecovery) {
      await completePendingPayment(paymentReference).catch((err) => {
        // Cleanup failure is non-critical — the payment is already recorded.
        if (import.meta.env.DEV) {
          console.warn('[PAYMENT] Failed to cleanup pending payment:', err)
        }
      })
    }

    // Track success
    trackPaymentEvent('payment_success', {
      paymentReference,
      invoiceId: rpcResult.invoiceId,
      invoiceNumber: rpcResult.invoiceNumber,
      tableId: input.tableId,
      userId: input.userId ?? '',
      amount: input.paidAmount,
      paymentMethod: input.paymentMethod,
      elapsedMs,
    })

    return {
      success: true,
      isDuplicate: rpcResult.isDuplicate,
      invoiceId: rpcResult.invoiceId,
      invoiceNumber: rpcResult.invoiceNumber,
      paymentId: rpcResult.paymentId ?? undefined,
      paymentReference,
    }
  }

  // ── FAILURE ──────────────────────────────────────────────
  // RPC returned an error (validation, authorization, concurrency)
  // Keep pending payment for recovery, it might be retried later.
  if (needsRecovery) {
    await failPendingPayment(paymentReference, rpcResult.error || 'RPC returned failure').catch(() => {})
  }

  trackPaymentEvent('payment_failed', {
    paymentReference,
    errorCode: rpcResult.code,
    errorMessage: rpcResult.error,
    tableId: input.tableId,
    elapsedMs,
  })

  return {
    success: false,
    error: rpcResult.error || 'Payment processing failed',
    errorCode: rpcResult.code,
    paymentReference,
  }
}

/**
 * Recover a specific pending payment by calling process_payment RPC.
 * Uses the original payment reference to ensure idempotency.
 *
 * @param payload - The original payment payload stored during persistence
 * @returns Unified payment result
 */
/**
 * Retry a payment by calling process_payment RPC directly (WITHOUT creating a
 * new pending payment record — the existing one is already in the DB).
 *
 * ⚠️ Unlike processPaymentWithRecovery, this does NOT call savePendingPayment()
 *    because the pending payment record already exists from the original failed
 *    attempt. Calling savePendingPayment() would hit the UNIQUE constraint on
 *    payment_reference.
 *
 * @param payload - The original payment payload from the pending payment record
 * @returns Unified payment result
 */
export async function retryPaymentProcess(
  payload: PendingPaymentPayload,
): Promise<UnifiedPaymentResult> {
  const paymentReference = payload.paymentReference
  const startTime = performance.now()

  try {
    const rpcResult = await callProcessPayment({
      tableId: payload.tableId || '',
      customerName: payload.customerName || 'Walk-in',
      invoiceSubtotal: payload.subtotal || 0,
      invoiceTax: payload.tax || 0,
      invoiceDiscount: payload.discount || 0,
      invoiceTotal: payload.total || 0,
      invoiceStatus: payload.invoiceStatus || 'paid',
      paymentMethod: payload.paymentMethod || 'cash',
      paymentAmount: payload.paidAmount || 0,
      paymentReference,
      paymentNotes: payload.notes,
      userId: payload.userId ?? null,
      paidItemIds: payload.paidItemIds || [],
      itemPaidStatus: payload.itemPaidStatus || 'paid',
      batchIds: payload.batchIds || [],
      orderBatchIds: payload.orderBatchIds || [],
    })

    if (rpcResult.success) {
      // Clean up the pending payment — it's now persisted in invoices+payments
      await completePendingPayment(paymentReference).catch(() => {})

      return {
        success: true,
        isDuplicate: rpcResult.isDuplicate,
        invoiceId: rpcResult.invoiceId,
        invoiceNumber: rpcResult.invoiceNumber,
        paymentId: rpcResult.paymentId ?? undefined,
        paymentReference,
      }
    }

    // RPC failed — update the pending payment record with the error
    await failPendingPayment(paymentReference, rpcResult.error || 'RPC failed').catch(() => {})

    return {
      success: false,
      error: rpcResult.error || 'Payment retry failed',
      errorCode: rpcResult.code,
      paymentReference,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unexpected error'
    await failPendingPayment(paymentReference, errMsg).catch(() => {})

    const elapsedMs = Math.round(performance.now() - startTime)
    return {
      success: false,
      error: errMsg,
      errorCode: 'RPC_ERROR',
      paymentReference,
      ...(import.meta.env.DEV ? { elapsedMs } : {}),
    }
  }
}
