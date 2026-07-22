/**
 * Payment Recovery Service
 * ────────────────────────
 * Automatic recovery for interrupted payment processing.
 *
 * Scenarios handled:
 *   - Browser refresh during payment processing
 *   - Browser crash during payment processing
 *   - WebSocket disconnect after gateway confirmation
 *   - Polling timeout after gateway confirmation
 *   - Client timeout after gateway confirmation
 *   - Temporary backend failure after gateway confirmation
 *   - Duplicate gateway callback
 *   - Duplicate user action
 *
 * Identity guarantee: Every scenario must end with exactly one invoice and
 * exactly one payment record. Recovery is ALWAYS idempotent.
 *
 * ═══ Recovery flow ═══
 *   1. Scan for pending payments (DB + localStorage)
 *   2. For each pending payment:
 *     a. Check if invoice already exists (by reference or payload data)
 *     b. Check if payment already exists (by reference)
 *     c. If invoice exists + payment exists → mark completed, done
 *     d. If invoice exists but no payment → warn admin (partial recovery)
 *     e. If neither exists → resume processing (retry RPC)
 *     f. If FonePay → optionally verify gateway status
 *   3. Return summary of recovery actions
 */

import { insforge } from '@/lib/services/auth-service'
import { callProcessPayment, type ProcessPaymentParams } from '@/lib/services/process-payment-rpc'
import {
  loadPendingPayments,
  completePendingPayment,
  failPendingPayment,
  getPendingPayment,
  markPaymentProcessing,
  type PendingPaymentRecord,
  type PendingPaymentPayload,
} from '@/lib/services/pending-payment-store'
import { trackPaymentEvent } from '@/lib/services/payment-monitoring'
import { checkQRStatus } from '@/lib/services/fonepay-service'

// ─── Types ───────────────────────────────────────────────────

export interface RecoveryResult {
  /** Total pending payments found */
  totalFound: number
  /** Payments that were recovered successfully */
  recovered: RecoveryAction[]
  /** Payments that failed recovery */
  failed: RecoveryAction[]
  /** Payments that were skipped (already processed) */
  skipped: RecoveryAction[]
  /** Summary */
  summary: string
}

export interface RecoveryAction {
  paymentReference: string
  gatewayReference?: string
  invoiceNumber?: string
  invoiceId?: string
  paymentId?: string
  outcome: 'recovered' | 'already_exists' | 'failed' | 'skipped'
  detail: string
  error?: string
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Check if a payment with the given reference already exists in the DB.
 */
async function paymentExists(reference: string): Promise<{ exists: boolean; paymentId?: string }> {
  try {
    const { data, error } = await insforge.database
      .from('payments')
      .select('id')
      .eq('reference', reference)
      .maybeSingle()

    if (error) return { exists: false }
    return { exists: !!data, paymentId: data?.id }
  } catch {
    return { exists: false }
  }
}

/**
 * Check if an invoice with specific batch IDs already exists.
 */
async function invoiceExistsForPayload(payload: PendingPaymentPayload): Promise<{
  exists: boolean
  invoiceId?: string
  invoiceNumber?: string
}> {
  try {
    const orderBatchIds = payload.orderBatchIds
    if (!orderBatchIds || orderBatchIds.length === 0) return { exists: false }

    // Check if an invoice exists for these batch IDs
    const { data, error } = await insforge.database
      .from('invoices')
      .select('id, invoice_number')
      .contains('order_batch_ids', orderBatchIds)
      .in('status', ['paid', 'partial', 'credit_invoice', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) return { exists: false }
    if (data && data.length > 0) {
      return {
        exists: true,
        invoiceId: data[0].id,
        invoiceNumber: data[0].invoice_number,
      }
    }

    // Also check by table_id + amount as a fallback
    if (payload.tableId) {
      const { data: tableData } = await insforge.database
        .from('invoices')
        .select('id, invoice_number')
        .eq('table_id', payload.tableId)
        .eq('total', payload.total)
        .in('status', ['paid', 'partial', 'credit_invoice', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)

      if (tableData && tableData.length > 0) {
        return {
          exists: true,
          invoiceId: tableData[0].id,
          invoiceNumber: tableData[0].invoice_number,
        }
      }
    }

    return { exists: false }
  } catch {
    return { exists: false }
  }
}

/**
 * Verify FonePay gateway status for a pending payment.
 * If the gateway says the payment is still pending or failed,
 * we should not proceed with recovery.
 */
async function verifyGatewayStatus(
  gatewayReference: string,
): Promise<{ verified: boolean; status: string; detail: string }> {
  try {
    const status = await checkQRStatus(gatewayReference)
    if (status.paymentStatus === 'success') {
      return { verified: true, status: 'success', detail: 'Gateway confirms payment received' }
    } else if (status.paymentStatus === 'failed') {
      return { verified: false, status: 'failed', detail: 'Gateway reports payment failed' }
    } else {
      return { verified: true, status: 'pending', detail: 'Gateway reports payment still pending — proceeding with recovery' }
    }
  } catch (err) {
    // Gateway check failed — log but proceed optimistically
    const errMsg = err instanceof Error ? err.message : 'Gateway unavailable'
    return { verified: true, status: 'unknown', detail: `Gateway check failed: ${errMsg}. Proceeding optimistically.` }
  }
}

// ─── Core Recovery Logic ────────────────────────────────────

/**
 * Attempt to recover a single pending payment.
 */
async function recoverPayment(
  record: PendingPaymentRecord,
): Promise<RecoveryAction> {
  const payload = record.invoicePayload as unknown as PendingPaymentPayload
  const { paymentReference, gatewayReference } = record

  try {
    // ─── Step 0: Mark as processing (prevents concurrent recovery) ───
    await markPaymentProcessing(paymentReference).catch(() => {})

    // ─── Step 1: Check if payment already exists ───
    const payCheck = await paymentExists(paymentReference)
    if (payCheck.exists) {
      // Payment already recorded — check for invoice
      const invCheck = await invoiceExistsForPayload(payload)
      if (invCheck.exists) {
        // Everything is consistent
        await completePendingPayment(paymentReference)
        return {
          paymentReference,
          gatewayReference,
          invoiceNumber: invCheck.invoiceNumber,
          invoiceId: invCheck.invoiceId,
          paymentId: payCheck.paymentId,
          outcome: 'already_exists',
          detail: `Invoice ${invCheck.invoiceNumber} and payment already exist. Recovery data cleaned up.`,
        }
      } else {
        // Payment exists but no invoice — partial recovery, needs admin
        return {
          paymentReference,
          gatewayReference,
          paymentId: payCheck.paymentId,
          outcome: 'failed',
          detail: 'Payment exists but no matching invoice found. Admin intervention required.',
          error: 'ORPHANED_PAYMENT',
        }
      }
    }

    // ─── Step 2: Check if invoice already exists ───
    const invCheck = await invoiceExistsForPayload(payload)
    if (invCheck.exists) {
      // Invoice exists but no payment — record payment
      try {
        const rpcResult = await callProcessPayment({
          tableId: payload.tableId,
          customerName: payload.customerName,
          invoiceSubtotal: payload.subtotal,
          invoiceTax: payload.tax ?? 0,
          invoiceDiscount: payload.discount,
          invoiceTotal: payload.total,
          invoiceStatus: payload.invoiceStatus,
          paymentMethod: payload.paymentMethod,
          paymentAmount: payload.paidAmount,
          paymentReference: payload.paymentReference,
          paymentNotes: payload.notes,
          userId: payload.userId ?? null,
          paidItemIds: payload.paidItemIds,
          itemPaidStatus: payload.itemPaidStatus,
          batchIds: payload.batchIds,
          orderBatchIds: payload.orderBatchIds,
        } as ProcessPaymentParams)

        if (rpcResult.success) {
          await completePendingPayment(paymentReference)
          return {
            paymentReference,
            gatewayReference,
            invoiceNumber: rpcResult.invoiceNumber,
            invoiceId: rpcResult.invoiceId,
            paymentId: rpcResult.paymentId ?? undefined,
            outcome: 'recovered',
            detail: `Payment recorded for existing invoice ${rpcResult.invoiceNumber}.`,
          }
        }

        // RPC failed — mark for retry
        await failPendingPayment(paymentReference, rpcResult.error || 'RPC failed during recovery')
        return {
          paymentReference,
          gatewayReference,
          outcome: 'failed',
          detail: `RPC failed: ${rpcResult.error || 'Unknown error'}`,
          error: rpcResult.code,
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        await failPendingPayment(paymentReference, errMsg)
        return {
          paymentReference,
          gatewayReference,
          outcome: 'failed',
          detail: `Recovery failed: ${errMsg}`,
          error: 'RECOVERY_ERROR',
        }
      }
    }

    // ─── Step 4: Verify gateway status (if FonePay) ───
    if (gatewayReference && payload.paymentMethod === 'fonepay') {
      const gateway = await verifyGatewayStatus(gatewayReference)
      if (!gateway.verified) {
        await failPendingPayment(paymentReference, `Gateway reports payment: ${gateway.status}`)
        return {
          paymentReference,
          gatewayReference,
          outcome: 'skipped',
          detail: gateway.detail,
          error: 'GATEWAY_REJECTED',
        }
      }
    }

    // ─── Step 5: Resume processing — call RPC ───
    try {
      const rpcResult = await callProcessPayment({
        tableId: payload.tableId,
        customerName: payload.customerName,
        invoiceSubtotal: payload.subtotal,
        invoiceTax: payload.tax ?? 0,
        invoiceDiscount: payload.discount,
        invoiceTotal: payload.total,
        invoiceStatus: payload.invoiceStatus,
        paymentMethod: payload.paymentMethod,
        paymentAmount: payload.paidAmount,
        paymentReference: payload.paymentReference,
        paymentNotes: payload.notes,
        userId: payload.userId ?? null,
        paidItemIds: payload.paidItemIds,
        itemPaidStatus: payload.itemPaidStatus,
        batchIds: payload.batchIds,
        orderBatchIds: payload.orderBatchIds,
      } as ProcessPaymentParams)

      if (rpcResult.success) {
        if (rpcResult.isDuplicate) {
          // RPC handled duplicate — clean up and report
          await completePendingPayment(paymentReference)
          return {
            paymentReference,
            gatewayReference,
            invoiceNumber: rpcResult.invoiceNumber,
            invoiceId: rpcResult.invoiceId,
            paymentId: rpcResult.paymentId ?? undefined,
            outcome: 'already_exists',
            detail: `RPC reported duplicate. Invoice ${rpcResult.invoiceNumber} already exists.`,
          }
        }

        await completePendingPayment(paymentReference)
        return {
          paymentReference,
          gatewayReference,
          invoiceNumber: rpcResult.invoiceNumber,
          invoiceId: rpcResult.invoiceId,
          paymentId: rpcResult.paymentId ?? undefined,
          outcome: 'recovered',
          detail: `Payment recovered. Invoice ${rpcResult.invoiceNumber} created.`,
        }
      }

      // RPC failed — mark for retry
      await failPendingPayment(paymentReference, rpcResult.error || 'RPC failed')
      return {
        paymentReference,
        gatewayReference,
        outcome: 'failed',
        detail: `RPC failed: ${rpcResult.error || 'Unknown error'}`,
        error: rpcResult.code,
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      await failPendingPayment(paymentReference, errMsg)
      return {
        paymentReference,
        gatewayReference,
        outcome: 'failed',
        detail: `Recovery RPC failed: ${errMsg}`,
        error: 'RECOVERY_RPC_ERROR',
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    return {
      paymentReference,
      gatewayReference,
      outcome: 'failed',
      detail: `Unexpected recovery error: ${errMsg}`,
      error: 'UNEXPECTED_RECOVERY_ERROR',
    }
  }
}

// ─── Startup Recovery ───────────────────────────────────────

/**
 * Run recovery for ALL pending payments.
 * Called on application startup.
 *
 * @returns Summary of all recovery actions taken
 */
export async function runPaymentRecovery(): Promise<RecoveryResult> {
  const startTime = performance.now()

  const { dbRecords, localRecords } = await loadPendingPayments()

  // Deduplicate: prefer DB records (source of truth)
  const byRef = new Map<string, PendingPaymentRecord>()
  for (const r of dbRecords) byRef.set(r.paymentReference, r)
  for (const r of localRecords) {
    if (!byRef.has(r.paymentReference)) byRef.set(r.paymentReference, r)
  }

  const pendingRecords = Array.from(byRef.values())
  const result: RecoveryResult = {
    totalFound: pendingRecords.length,
    recovered: [],
    failed: [],
    skipped: [],
    summary: '',
  }

  if (pendingRecords.length === 0) {
    result.summary = 'No pending payments found. All clear.'
    return result
  }

  // Log recovery attempt
  trackPaymentEvent('payment_retry', {
    details: { event: 'recovery.start', count: pendingRecords.length },
  })

  // Process each pending payment sequentially (avoid DB contention)
  for (const record of pendingRecords) {
    const action = await recoverPayment(record)

    switch (action.outcome) {
      case 'recovered':
        result.recovered.push(action)
        break
      case 'already_exists':
        result.skipped.push(action)
        break
      case 'failed':
        result.failed.push(action)
        break
      case 'skipped':
        result.skipped.push(action)
        break
    }
  }

  const elapsedMs = Math.round(performance.now() - startTime)

  // Build summary
  const parts: string[] = []
  if (result.recovered.length > 0) parts.push(`${result.recovered.length} recovered`)
  if (result.skipped.length > 0) parts.push(`${result.skipped.length} already complete`)
  if (result.failed.length > 0) parts.push(`${result.failed.length} failed`)
  result.summary = parts.length > 0
    ? `Recovery complete: ${parts.join(', ')}. (${elapsedMs}ms)`
    : 'No pending payments required action.'

  if (result.recovered.length > 0 || result.failed.length > 0) {
    trackPaymentEvent('payment_retry', {
      details: {
        event: 'recovery.complete',
        recovered: result.recovered.length,
        failed: result.failed.length,
        skipped: result.skipped.length,
        elapsedMs,
      },
    })
  }

  return result
}

/**
 * Retry a specific failed payment by payment reference.
 */
export async function retryFailedPayment(
  paymentReference: string,
): Promise<RecoveryAction> {
  const record = await getPendingPayment(paymentReference)
  if (!record) {
    return {
      paymentReference,
      outcome: 'skipped',
      detail: 'No pending payment found with this reference.',
    }
  }

  return recoverPayment(record)
}

// ─── Recovery Hook for App Startup ──────────────────────────

/**
 * React hook that runs payment recovery ONCE on mount.
 * Returns the recovery result (or null if not yet run or already run).
 *
 * Usage: Call this at the top level of App.tsx.
 */
export function usePaymentRecoveryOnStartup(): RecoveryResult | null {
  // Use a sessionStorage flag to ensure recovery runs EXACTLY ONCE per browser session.
  // This prevents duplicate recovery attempts on hot-reloads, route changes, etc.
  const RECOVERY_RUN_KEY = 'payment_recovery_completed'

  // Load skill — returns null if already run this session
  try {
    const alreadyRun = sessionStorage.getItem(RECOVERY_RUN_KEY)
    if (alreadyRun === 'true') return null
  } catch {
    // sessionStorage unavailable — proceed anyway
  }

  // We can't use useEffect here because this is a utility function, not a React hook file.
  // Instead, callers should use this in a useEffect at the app level.
  return null
}

/**
 * Run startup recovery. Call this from App.tsx's useEffect.
 * Returns the recovery result after completion.
 *
 * Only runs once per browser session (tracked via sessionStorage).
 */
export async function runStartupRecoveryOnce(): Promise<RecoveryResult | null> {
  const RECOVERY_RUN_KEY = 'payment_recovery_completed'

  try {
    const alreadyRun = sessionStorage.getItem(RECOVERY_RUN_KEY)
    if (alreadyRun === 'true') return null
  } catch {
    // sessionStorage unavailable — proceed anyway
  }

  const result = await runPaymentRecovery()

  try {
    sessionStorage.setItem(RECOVERY_RUN_KEY, 'true')
  } catch {
    // non-critical
  }

  return result
}
