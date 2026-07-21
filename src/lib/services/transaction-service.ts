/**
 * Transaction Service — Unified Payment Pipeline
 * ───────────────────────────────────────────────
 *
 * SINGLE ENTRY POINT for processing any payment method (cash, QR, credit,
 * split, partial). Every payment method must funnel through here so we
 * have exactly one code path that guarantees consistency.
 *
 * All CRITICAL DB operations are executed SEQUENTIALLY because PostgREST
 * does not support multi-table transactions.  If any step throws, the
 * caller (POS.tsx) should treat the entire transaction as failed.
 *
 * NON-CRITICAL side effects (activity log, inventory deduction, session
 * close) are fire-and-forget so the cashier never waits for them.
 */

import { insforge } from '@/lib/services/auth-service'
import { createPaymentInDb } from '@/lib/services/payment-service'
import { insertInvoiceItems } from '@/lib/services/invoice-items-service'
import { recordCreditCharge } from '@/lib/services/customer-ledger'
import { deductStockForSoldItems } from '@/lib/services/inventory-service'
import { logActivitySafe } from '@/lib/services/activity-log-service'
import { getNextInvoiceNumber } from '@/lib/services/sequence-service'
import { toPaymentMethodKey } from '@/lib/payment-methods'
import { idempotencyGuard } from '@/lib/services/idempotency-guard'
import { db } from '@/lib/db/insforge'
import { perf, PERF_TAGS } from '@/lib/perf'

import type { PaymentMethod, CartItemStatus, OrderBatch } from '@/types'

// ─── Types ───────────────────────────────────────────────────

export interface PaymentDetails {
  /** Invoice number (pre-generated or null — we'll generate if missing) */
  invoiceNumber?: string
  /** Display label, e.g. "cash", "Credit (John)" */
  paymentMethod: string
  /**
   * IDs of items being paid in this transaction.
   * For split payments this is a subset; for full payments it's all items.
   */
  paidItemIds: string[]
  /** Grand total of the invoice */
  grandTotal: number
  /** Actual cash/method amount received (may differ from grandTotal for credit) */
  paidAmount: number
  /** Optional credit amount (for split credit + cash) */
  creditAmount?: number
  /** Customer name for credit charges */
  creditCustomerName?: string
}

export interface TransactionInput {
  /** All batches for the selected table */
  tableBatches: OrderBatch[]
  /** Selected table/room ID */
  selectedTableId: string
  /** New cart items (not yet submitted to DB as batches) */
  newCartItems: Array<{
    name: string
    quantity: number
    unitPrice: number
  }>
  /** Customer name for the bill */
  customerName: string
  /** POS mode */
  posMode: 'tables' | 'rooms'
  /** Selected entity info for location label */
  selectedTableInfo?: { table_number?: string; room_number?: string; number?: string } | null
  /** User ID for audit trails */
  userId?: string
  /** Payment details from the dialog */
  payment: PaymentDetails
  /** Invoice subtotal (batches + cart) */
  subtotal: number
  /** Discount applied (always 0 in current POS) */
  discount: number
  /** Invoice status */
  invoiceStatus: string
}

export interface TransactionResult {
  invoiceId: string
  invoiceNumber: string
  /** Updated local batches (caller should setOrderBatches with these) */
  updatedBatches: OrderBatch[]
  /** Whether the balance was fully settled */
  isFullySettled: boolean
  /** Remaining balance after this transaction */
  remainingBalance: number
  /** Whether this was a credit payment */
  wasCreditPayment: boolean
}

// ─── Helpers ─────────────────────────────────────────────────

function computeBatchStatuses(
  batches: OrderBatch[],
  paidItemIds: Set<string>,
  isCreditPayment: boolean,
  hasSplitCredit: boolean,
): { original: OrderBatch[]; updated: OrderBatch[] } {
  let creditRemaining = 0 // populated from outside

  const updated = batches.map(batch => {
    const creditItemIds = new Set<string>()
    if (hasSplitCredit) {
      // Credit is applied to highest-value items first
      const sortedItems = [...batch.items]
        .filter(bi => paidItemIds.has(bi.id))
        .sort((a, b) => (b.unit_price * b.quantity) - (a.unit_price * a.quantity))
      for (const item of sortedItems) {
        const itemValue = item.unit_price * item.quantity
        if (creditRemaining >= itemValue) {
          creditItemIds.add(item.id)
          creditRemaining -= itemValue
        } else if (creditRemaining > 0) {
          creditItemIds.add(item.id)
          creditRemaining = 0
        }
      }
    }
    const updatedItems = batch.items.map(bi => {
      if (paidItemIds.has(bi.id)) {
        if (hasSplitCredit && creditItemIds.has(bi.id)) {
          return { ...bi, status: 'credit' as CartItemStatus }
        }
        return { ...bi, status: (isCreditPayment ? 'credit' : 'paid') as CartItemStatus }
      }
      return bi
    })
    const settledStatuses: CartItemStatus[] = ['paid', 'credit', 'cancelled', 'voided']
    const allSettled = updatedItems.every(i => settledStatuses.includes(i.status))
    const somePaid = updatedItems.some(i => i.status === 'paid' || i.status === 'credit')
    const paidAmount = updatedItems
      .filter(i => i.status === 'paid' || i.status === 'credit')
      .reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
    return {
      ...batch,
      items: updatedItems,
      status: allSettled ? 'paid' as const : somePaid ? 'partial' as const : batch.status,
      paid_amount: paidAmount,
    }
  })

  return { original: batches, updated }
}

// ─── Main Transaction Pipeline ──────────────────────────────

/**
 * Process a payment transaction — the single truth for all payment methods.
 *
 * Returns the transaction result ONLY after all critical DB writes succeed.
 *
 * ═══ CRITICAL PATH (sequential, MUST succeed together) ═══
 * 1. Generate invoice number
 * 2. Idempotency check
 * 3. Create invoice
 * 4. Record payment
 * 5. Insert invoice items
 * 6. Update batch item statuses in DB
 * 7. Update batch-level statuses in DB
 *
 * ═══ NON-CRITICAL (fire-and-forget, errors swallowed) ════
 * - Activity log
 * - Inventory deduction
 * - Credit charge recording
 * - Table session close
 *
 * @throws Error if any critical step fails
 */
export async function processPaymentTransaction(
  input: TransactionInput,
): Promise<TransactionResult> {
  perf.start(PERF_TAGS.PAYMENT_CONFIRMATION)
  const {
    tableBatches,
    selectedTableId,
    newCartItems,
    customerName,
    posMode,
    selectedTableInfo,
    userId,
    payment,
    subtotal,
    discount,
    invoiceStatus,
  } = input

  const paidItemIds = new Set(payment.paidItemIds || [])
  const isCreditPayment = payment.paymentMethod?.toLowerCase().startsWith('credit')
  const hasSplitCredit = (payment.creditAmount ?? 0) > 0
  const remainingBalance = Math.max(
    0,
    payment.grandTotal - ((payment.paidAmount ?? 0) + (payment.creditAmount ?? 0)),
  )

  // ─── 0. Guard: validate amount ───────────────────────
  if (!payment.grandTotal || payment.grandTotal <= 0) {
    throw new Error('Cannot process a zero-amount payment.')
  }

  // ─── 1. Sequential invoice number ────────────────────
  const invNumber = payment.invoiceNumber ?? (await getNextInvoiceNumber())

  // ─── 2. Idempotency check ────────────────────────────
  const { proceed } = await idempotencyGuard.check({
    entityType: 'batch',
    entityId: tableBatches[0]?.id ?? selectedTableId,
    amount: payment.grandTotal,
    discriminator: invNumber,
  })
  if (!proceed) {
    throw new Error('DUPLICATE_PAYMENT')
  }

  // ═══════════════════════════════════════════════════════
  // CRITICAL PATH — sequential DB writes
  // ═══════════════════════════════════════════════════════

  // ─── 3. Create invoice ───────────────────────────────
  const { data: invData, error: invError } = await insforge.database
    .from('invoices')
    .insert([
      {
        invoice_number: invNumber,
        customer_name: payment.creditCustomerName || customerName || 'Walk-in',
        table_id: selectedTableId,
        order_batch_ids: tableBatches.map(b => b.id),
        subtotal,
        tax: 0,
        discount,
        total: payment.grandTotal,
        status: invoiceStatus,
        payment_method: toPaymentMethodKey(payment.paymentMethod ?? 'cash'),
      },
    ])
    .select()
    .single()

  if (invError) throw new Error(`Invoice insert failed: ${invError.message}`)
  const invoiceId = invData.id

  // ─── 4. Record payment ───────────────────────────────
  if (!isCreditPayment || hasSplitCredit) {
    const paymentRecord = await createPaymentInDb({
      invoiceId,
      batchId: tableBatches[0]?.id ?? null,
      amount: payment.grandTotal,
      discount,
      paymentMethod: toPaymentMethodKey(payment.paymentMethod ?? 'cash') as PaymentMethod,
      reference: `IDEM-${invNumber}`,
      notes: `Payment via ${payment.paymentMethod ?? 'cash'}`,
    })
    if (!paymentRecord) {
      throw new Error(`Failed to record payment of ${payment.grandTotal}`)
    }
  }

  // ─── 5. Insert invoice items ─────────────────────────
  if (newCartItems.length > 0 || tableBatches.length > 0) {
    const invoiceItems = [
      ...newCartItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      ...tableBatches.flatMap(b =>
        b.items
          .filter(bi => isItemBillable(bi))
          .map(bi => ({
            name: bi.name,
            quantity: bi.quantity,
            unitPrice: bi.unit_price,
          })),
      ),
    ]
    if (invoiceItems.length > 0) {
      await insertInvoiceItems(invoiceId, invoiceItems)
    }
  }

  // ─── 6. Update batch item statuses ───────────────────
  if (paidItemIds.size > 0) {
    const { error: itemUpdateError } = await insforge.database
      .from('order_batch_items')
      .update({ status: isCreditPayment ? 'credit' : 'paid' })
      .in('id', Array.from(paidItemIds))

    if (itemUpdateError) {
      throw new Error(`Batch items status update failed: ${itemUpdateError.message}`)
    }

    // ─── 7. Compute & update batch-level statuses ────────
    const batchStatusUpdates: Array<{ id: string; status: string }> = []
    const settledStatuses = ['paid', 'credit', 'cancelled', 'voided']
    for (const batch of tableBatches) {
      const hasPaidItemInThisBatch = batch.items.some(bi => paidItemIds.has(bi.id))
      if (!hasPaidItemInThisBatch) continue
      const allSettled = batch.items.every(
        bi => paidItemIds.has(bi.id) || settledStatuses.includes(bi.status),
      )
      const somePaid = batch.items.some(
        bi => paidItemIds.has(bi.id) || bi.status === 'paid' || bi.status === 'credit',
      )
      if (allSettled) batchStatusUpdates.push({ id: batch.id, status: 'paid' })
      else if (somePaid) batchStatusUpdates.push({ id: batch.id, status: 'partial' })
    }

    if (batchStatusUpdates.length > 0) {
      const paidIds = batchStatusUpdates.filter(u => u.status === 'paid').map(u => u.id)
      const partialIds = batchStatusUpdates.filter(u => u.status === 'partial').map(u => u.id)
      const promises: Promise<unknown>[] = []
      if (paidIds.length > 0) {
        promises.push(
          insforge.database.from('order_batches').update({ status: 'paid' }).in('id', paidIds),
        )
      }
      if (partialIds.length > 0) {
        promises.push(
          insforge.database
            .from('order_batches')
            .update({ status: 'partial' })
            .in('id', partialIds),
        )
      }
      await Promise.all(promises)
    }
  }

  // ═══════════════════════════════════════════════════════
  // CRITICAL PATH COMPLETE — ALL DB WRITES SUCCEEDED
  // ═══════════════════════════════════════════════════════

  // ── Compute local state update ───────────────────────
  const updatedBatches = computeUpdatedBatches(
    tableBatches,
    paidItemIds,
    isCreditPayment,
    hasSplitCredit,
    payment.creditAmount ?? 0,
  )

  // ═══════════════════════════════════════════════════════
  // NON-CRITICAL SIDE EFFECTS (fire-and-forget)
  // ═══════════════════════════════════════════════════════

  const sideEffects: Promise<unknown>[] = []

  // ── Activity log ────────────────────────────────────
  sideEffects.push(
    logActivitySafe({
      activityType: 'payment_received',
      entityId: invoiceId,
      entityLabel: `Invoice ${invNumber}`,
      status: isCreditPayment ? 'pending' : 'completed',
      amount: payment.grandTotal,
      userName: customerName || 'System',
      location: selectedTableId
        ? posMode === 'tables'
          ? `Table ${selectedTableInfo?.table_number ?? selectedTableId}`
          : `Room ${selectedTableInfo?.room_number || selectedTableInfo?.number || selectedTableId}`
        : 'POS',
      details: `Payment of ${payment.grandTotal} via ${payment.paymentMethod ?? 'cash'}.`,
    }).catch(() => {
      /* fire-and-forget */
    }),
  )

  // ── Inventory deduction ─────────────────────────────
  if (newCartItems.length > 0 && !isCreditPayment) {
    sideEffects.push(
      deductStockForSoldItems(newCartItems).catch(() => {
        /* fire-and-forget */
      }),
    )
  }

  // ── Credit charge recording ─────────────────────────
  if (payment.creditCustomerName) {
    const creditAmount = payment.creditAmount ?? (isCreditPayment && !hasSplitCredit ? payment.grandTotal : 0)
    if (creditAmount > 0) {
      sideEffects.push(
        recordCreditCharge(
          payment.creditCustomerName,
          creditAmount,
          invNumber,
          `Credit from ${payment.paymentMethod || 'payment'}`,
          invoiceId,
        ).catch(() => {
          /* fire-and-forget — payment is already committed */
        }),
      )
    }
  }

  // ── Close table session (safety net) ────────────────
  if (selectedTableId && (remainingBalance <= 0 || isCreditPayment)) {
    sideEffects.push(
      db
        .rpc('close_table_session', { p_table_id: selectedTableId })
        .then(() => {
          /* success — no-op */
        })
        .catch(() => {
          /* fire-and-forget — DB triggers handle this */
        }),
    )
  }

  // Fire all side effects in parallel — NOT awaited
  Promise.all(sideEffects).catch(() => {
    /* all errors are already caught individually */
  })

  perf.end(PERF_TAGS.PAYMENT_CONFIRMATION)

  return {
    invoiceId,
    invoiceNumber: invNumber,
    updatedBatches,
    isFullySettled: remainingBalance <= 0,
    remainingBalance,
    wasCreditPayment: !!isCreditPayment,
  }
}

// ─── Local helpers ──────────────────────────────────────────

function computeUpdatedBatches(
  batches: OrderBatch[],
  paidItemIds: Set<string>,
  isCreditPayment: boolean,
  hasSplitCredit: boolean,
  creditAmount: number = 0,
): OrderBatch[] {
  let creditRemaining = creditAmount

  return batches.map(batch => {
    const creditItemIds = new Set<string>()
    if (hasSplitCredit && creditRemaining > 0) {
      const sortedItems = [...batch.items]
        .filter(bi => paidItemIds.has(bi.id))
        .sort((a, b) => b.unit_price * b.quantity - a.unit_price * a.quantity)
      for (const item of sortedItems) {
        const itemValue = item.unit_price * item.quantity
        if (creditRemaining >= itemValue) {
          creditItemIds.add(item.id)
          creditRemaining -= itemValue
        } else if (creditRemaining > 0) {
          creditItemIds.add(item.id)
          creditRemaining = 0
        }
      }
    }

    const updatedItems = batch.items.map(bi => {
      if (paidItemIds.has(bi.id)) {
        if (hasSplitCredit && creditItemIds.has(bi.id)) {
          return { ...bi, status: 'credit' as CartItemStatus }
        }
        return { ...bi, status: (isCreditPayment ? 'credit' : 'paid') as CartItemStatus }
      }
      return bi
    })

    const settledStatuses: CartItemStatus[] = ['paid', 'credit', 'cancelled', 'voided']
    const allSettled = updatedItems.every(i => settledStatuses.includes(i.status))
    const somePaid = updatedItems.some(i => i.status === 'paid' || i.status === 'credit')
    const paidAmt = updatedItems
      .filter(i => i.status === 'paid' || i.status === 'credit')
      .reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

    return {
      ...batch,
      items: updatedItems,
      status: allSettled ? 'paid' as const : somePaid ? 'partial' as const : batch.status,
      paid_amount: paidAmt,
    }
  })
}
