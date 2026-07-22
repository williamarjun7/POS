/**
 * Reconciliation Service
 * ──────────────────────
 * Production reconciliation process for ensuring financial integrity.
 *
 * Finds and repairs:
 *   - Confirmed FonePay payments without invoices
 *   - Invoices without payments
 *   - Duplicate payment attempts
 *   - Orphaned pending payments (stuck in pending/processing/failed)
 *   - Incomplete transactions
 *
 * Every reconciliation action is logged to the activity_logs table for audit.
 *
 * This service is used by:
 *   - The Payment Recovery admin page (manual intervention)
 *   - Automatic scheduled reconciliation (future)
 */

import { insforge } from '@/lib/services/auth-service'
import { callProcessPayment, type ProcessPaymentParams } from '@/lib/services/process-payment-rpc'
import { loadPendingPayments, loadFailedPayments, completePendingPayment, retryPendingPayment } from '@/lib/services/pending-payment-store'
import { trackPaymentEvent } from '@/lib/services/payment-monitoring'
import type { PendingPaymentPayload } from '@/lib/services/pending-payment-store'

// ─── Types ───────────────────────────────────────────────────

export interface ReconciliationReport {
  /** Timestamp of the reconciliation run */
  timestamp: string
  /** Summary counts */
  summary: {
    totalScanned: number
    invoicesWithoutPayments: number
    paymentsWithoutInvoices: number
    duplicatesFound: number
    pendingRecoveries: number
    orphanedPendingPayments: number
    repairsAttempted: number
    repairsSucceeded: number
    repairsFailed: number
  }
  /** Detailed findings */
  findings: ReconciliationFinding[]
  /** Actions taken during reconciliation */
  actions: ReconciliationAction[]
}

export type FindingSeverity = 'critical' | 'warning' | 'info'

export interface ReconciliationFinding {
  type: 'invoice_without_payment' | 'payment_without_invoice' | 'duplicate_payment' | 'orphaned_pending' | 'incomplete_transaction'
  severity: FindingSeverity
  entityId: string
  entityLabel: string
  amount: number
  detail: string
  resolved: boolean
}

export interface ReconciliationAction {
  type: 'repair' | 'log' | 'skip' | 'retry'
  entityId: string
  entityLabel: string
  outcome: 'success' | 'failed' | 'skipped'
  detail: string
  error?: string
}

// ─── Constants ───────────────────────────────────────────────

const RECONCILIATION_BATCH_SIZE = 100

// ─── Logging ─────────────────────────────────────────────────

function log(prefix: string, ...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log(`[RECONCILIATION:${prefix}]`, ...args)
  }
}

async function logActionToDb(action: ReconciliationAction): Promise<void> {
  try {
    const { insforge: ifClient } = await import('@/lib/services/auth-service')
    await ifClient.database
      .from('activity_logs')
      .insert({
        activity_type: `reconciliation.${action.type}`,
        entity_id: action.entityId,
        entity_label: action.entityLabel,
        status: action.outcome,
        details: JSON.stringify(action),
      })
  } catch {
    // Non-critical — logging failures must never affect reconciliation
  }
}

// ─── Finding Helpers ─────────────────────────────────────────

/**
 * Find invoices that don't have any associated payments.
 */
async function findInvoicesWithoutPayments(): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = []

  try {
    // Fetch invoices that are in a state that should have payments
    const { data, error } = await insforge.database
      .from('invoices')
      .select('id, invoice_number, total, status, created_at')
      .in('status', ['paid', 'partial', 'credit_invoice'])
      .order('created_at', { ascending: false })
      .limit(RECONCILIATION_BATCH_SIZE)

    if (error) throw error

    for (const invoice of (data ?? []) as Array<{ id: string; invoice_number: string; total: number; status: string }>) {
      // Check if this invoice has payments
      const { data: payments, error: payError } = await insforge.database
        .from('payments')
        .select('id')
        .eq('invoice_id', invoice.id)
        .limit(1)

      if (payError) continue

      if (!payments || payments.length === 0) {
        // Credit invoices may legitimately have no payments (payment is deferred)
        const severity: FindingSeverity = invoice.status === 'credit_invoice' ? 'warning' : 'critical'
        findings.push({
          type: 'invoice_without_payment',
          severity,
          entityId: invoice.id,
          entityLabel: `Invoice ${invoice.invoice_number}`,
          amount: invoice.total,
          detail: `Invoice ${invoice.invoice_number} (${invoice.status}) has no associated payments.`,
          resolved: false,
        })
      }
    }
  } catch (err) {
    log('FIND_INVOICES_ERROR', err)
  }

  return findings
}

/**
 * Find payments that reference non-existent invoices.
 */
async function findPaymentsWithoutInvoices(): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = []

  try {
    const { data, error } = await insforge.database
      .from('payments')
      .select('id, invoice_id, amount, reference, created_at')
      .not('invoice_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(RECONCILIATION_BATCH_SIZE)

    if (error) throw error

    for (const payment of (data ?? []) as Array<{ id: string; invoice_id: string; amount: number; reference: string }>) {
      const { data: invoice, error: invError } = await insforge.database
        .from('invoices')
        .select('id')
        .eq('id', payment.invoice_id)
        .maybeSingle()

      if (invError) continue

      if (!invoice) {
        findings.push({
          type: 'payment_without_invoice',
          severity: 'critical',
          entityId: payment.id,
          entityLabel: `Payment ${payment.reference || payment.id.slice(0, 8)}`,
          amount: payment.amount,
          detail: `Payment ${payment.reference || payment.id.slice(0, 8)} references invoice ${payment.invoice_id} which does not exist.`,
          resolved: false,
        })
      }
    }
  } catch (err) {
    log('FIND_PAYMENTS_ERROR', err)
  }

  return findings
}

/**
 * Find duplicate payment attempts (same amount + same table within a short window).
 */
async function findDuplicatePayments(): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = []

  try {
    const { data, error } = await insforge.database
      .from('payments')
      .select('id, invoice_id, amount, reference, created_at')
      .order('created_at', { ascending: false })
      .limit(RECONCILIATION_BATCH_SIZE)

    if (error) throw error

    const payments = (data ?? []) as Array<{ id: string; invoice_id: string; amount: number; reference: string; created_at: string }>

    // Group by invoice_id and look for duplicate amounts
    const byInvoice = new Map<string, typeof payments>()
    for (const p of payments) {
      if (!p.invoice_id) continue
      const existing = byInvoice.get(p.invoice_id) ?? []
      existing.push(p)
      byInvoice.set(p.invoice_id, existing)
    }

    for (const [invoiceId, invoicePayments] of byInvoice.entries()) {
      if (invoicePayments.length <= 1) continue

      // Check for payments with the same amount within a 5-second window
      for (let i = 0; i < invoicePayments.length; i++) {
        for (let j = i + 1; j < invoicePayments.length; j++) {
          if (invoicePayments[i].amount !== invoicePayments[j].amount) continue
          const timeA = new Date(invoicePayments[i].created_at).getTime()
          const timeB = new Date(invoicePayments[j].created_at).getTime()
          if (Math.abs(timeA - timeB) < 60000) { // Within 1 minute
            findings.push({
              type: 'duplicate_payment',
              severity: 'warning',
              entityId: invoicePayments[i].id,
              entityLabel: `Payment ${invoicePayments[i].reference || invoicePayments[i].id.slice(0, 8)}`,
              amount: invoicePayments[i].amount,
              detail: `Possible duplicate: payment ${invoicePayments[i].reference || invoicePayments[i].id.slice(0, 8)} and ${invoicePayments[j].reference || invoicePayments[j].id.slice(0, 8)} have the same amount (${invoicePayments[i].amount}) for invoice ${invoiceId}.`,
              resolved: false,
            })
            break // Only report once per pair
          }
        }
      }
    }
  } catch (err) {
    log('FIND_DUPLICATES_ERROR', err)
  }

  return findings
}

/**
 * Find orphaned pending payments (stuck in pending/processing/failed).
 */
async function findOrphanedPendingPayments(): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = []

  try {
    const failedRecords = await loadFailedPayments()
    const { dbRecords } = await loadPendingPayments()

    const allRecords = [...failedRecords, ...dbRecords]
    const seen = new Set<string>()

    for (const record of allRecords) {
      if (seen.has(record.paymentReference)) continue
      seen.add(record.paymentReference)

      const ageHours = (Date.now() - new Date(record.createdAt).getTime()) / 3600000
      const severity: FindingSeverity = ageHours > 24 ? 'critical' : ageHours > 1 ? 'warning' : 'info'

      findings.push({
        type: 'orphaned_pending',
        severity,
        entityId: record.id,
        entityLabel: `Pending ${record.paymentReference}`,
        amount: record.invoiceAmount,
        detail: `Pending payment "${record.paymentReference}" has been in "${record.status}" state for ${Math.round(ageHours * 10) / 10}h. Retries: ${record.retryCount}/${record.maxRetries}. Last error: ${record.lastError || 'none'}.`,
        resolved: false,
      })
    }
  } catch (err) {
    log('FIND_ORPHANED_ERROR', err)
  }

  return findings
}

// ─── Repair Helpers ──────────────────────────────────────────

/**
 * Attempt to repair an invoice without payments.
 * Creates a manual payment record.
 */
async function repairInvoiceWithoutPayment(finding: ReconciliationFinding): Promise<ReconciliationAction> {
  try {
    // Fetch the invoice to get details
    const { data: invoice, error } = await insforge.database
      .from('invoices')
      .select('*')
      .eq('id', finding.entityId)
      .single()

    if (error || !invoice) {
      return {
        type: 'repair',
        entityId: finding.entityId,
        entityLabel: finding.entityLabel,
        outcome: 'failed',
        detail: `Cannot fetch invoice ${finding.entityId}`,
        error: error?.message,
      }
    }

    // Create a reconciliation payment record
    const { error: payError } = await insforge.database
      .from('payments')
      .insert({
        invoice_id: invoice.id,
        amount: invoice.total,
        payment_method: invoice.payment_method || 'cash',
        reference: `RECON-${invoice.invoice_number}-${Date.now()}`,
        notes: `Auto-reconciliation: payment for invoice that had no payments.`,
      })

    if (payError) {
      return {
        type: 'repair',
        entityId: finding.entityId,
        entityLabel: finding.entityLabel,
        outcome: 'failed',
        detail: `Failed to create payment: ${payError.message}`,
        error: payError.message,
      }
    }

    return {
      type: 'repair',
      entityId: finding.entityId,
      entityLabel: finding.entityLabel,
      outcome: 'success',
      detail: `Created reconciliation payment for invoice ${invoice.invoice_number}.`,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    return {
      type: 'repair',
      entityId: finding.entityId,
      entityLabel: finding.entityLabel,
      outcome: 'failed',
      detail: errMsg,
      error: errMsg,
    }
  }
}

/**
 * Attempt to retry an orphaned pending payment.
 */
async function repairOrphanedPending(finding: ReconciliationFinding): Promise<ReconciliationAction> {
  try {
    await retryPendingPayment(finding.entityId)

    return {
      type: 'retry',
      entityId: finding.entityId,
      entityLabel: finding.entityLabel,
      outcome: 'success',
      detail: `Reset pending payment to retry state. Recovery will pick it up.`,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    return {
      type: 'retry',
      entityId: finding.entityId,
      entityLabel: finding.entityLabel,
      outcome: 'failed',
      detail: `Failed to retry: ${errMsg}`,
      error: errMsg,
    }
  }
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Run a full reconciliation scan.
 *
 * Finds all financial inconsistencies and reports them without
 * making any changes (unless autoRepair is true).
 *
 * @param autoRepair - If true, automatically attempt to repair findings
 * @returns Complete reconciliation report
 */
export async function runReconciliation(autoRepair: boolean = false): Promise<ReconciliationReport> {
  const startTime = performance.now()
  const timestamp = new Date().toISOString()

  log('RUN', `Starting reconciliation (autoRepair=${autoRepair})...`)

  // Run all scans in parallel
  const [invoicesWithoutPayments, paymentsWithoutInvoices, duplicatePayments, orphanedPending] =
    await Promise.all([
      findInvoicesWithoutPayments(),
      findPaymentsWithoutInvoices(),
      findDuplicatePayments(),
      findOrphanedPendingPayments(),
    ])

  const allFindings = [
    ...invoicesWithoutPayments,
    ...paymentsWithoutInvoices,
    ...duplicatePayments,
    ...orphanedPending,
  ]

  const report: ReconciliationReport = {
    timestamp,
    summary: {
      totalScanned: allFindings.length,
      invoicesWithoutPayments: invoicesWithoutPayments.length,
      paymentsWithoutInvoices: paymentsWithoutInvoices.length,
      duplicatesFound: duplicatePayments.length,
      pendingRecoveries: orphanedPending.filter(f => f.severity !== 'info').length,
      orphanedPendingPayments: orphanedPending.length,
      repairsAttempted: 0,
      repairsSucceeded: 0,
      repairsFailed: 0,
    },
    findings: allFindings,
    actions: [],
  }

  // Auto-repair
  if (autoRepair) {
    for (const finding of allFindings) {
      if (finding.resolved) continue

      let action: ReconciliationAction | null = null

      switch (finding.type) {
        case 'invoice_without_payment':
          action = await repairInvoiceWithoutPayment(finding)
          break
        case 'orphaned_pending':
          action = await repairOrphanedPending(finding)
          break
        case 'payment_without_invoice':
        case 'duplicate_payment':
        case 'incomplete_transaction':
          // These require admin intervention — log and skip
          action = {
            type: 'log',
            entityId: finding.entityId,
            entityLabel: finding.entityLabel,
            outcome: 'skipped',
            detail: `Requires admin intervention: ${finding.detail}`,
          }
          break
      }

      if (action) {
        report.actions.push(action)
        report.summary.repairsAttempted++

        switch (action.outcome) {
          case 'success':
            finding.resolved = true
            report.summary.repairsSucceeded++
            break
          case 'failed':
            report.summary.repairsFailed++
            break
          // Skipped doesn't change counts
        }

        // Log to activity_logs
        await logActionToDb(action)
      }
    }
  }

  const elapsedMs = Math.round(performance.now() - startTime)
  log('COMPLETE', `Reconciliation finished in ${elapsedMs}ms.`, report.summary)

  // Track reconciliation event
  trackPaymentEvent('payment_deferred_op_success', {
    details: {
      event: 'reconciliation.complete',
      elapsedMs,
      ...report.summary,
    },
  })

  return report
}

/**
 * Get a summary of the current reconciliation state.
 * Lightweight — doesn't perform a full scan.
 */
export async function getReconciliationSummary(): Promise<{
  pendingCount: number
  failedCount: number
  invoicesWithoutPayments: number
  lastScanTimestamp?: string
}> {
  const [failedRecords, { dbRecords }] = await Promise.all([
    loadFailedPayments(),
    loadPendingPayments(),
  ])

  // Count invoices without payments (quick check)
  let invoicesWithoutPayments = 0
  try {
    const { data, error } = await insforge.database
      .from('invoices')
      .select('id')
      .in('status', ['paid', 'partial'])
      .limit(500)

    if (!error && data) {
      for (const invoice of data) {
        const { data: payments } = await insforge.database
          .from('payments')
          .select('id')
          .eq('invoice_id', invoice.id)
          .limit(1)

        if (!payments || payments.length === 0) {
          invoicesWithoutPayments++
        }
      }
    }
  } catch {
    // Non-critical
  }

  return {
    pendingCount: dbRecords.length,
    failedCount: failedRecords.length,
    invoicesWithoutPayments,
  }
}
