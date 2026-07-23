/**
 * Pending Payment Store
 * ─────────────────────
 * Dual-layer persistence for payment context BEFORE invoice creation completes.
 *
 * Architecture:
 *   - DB table (pending_payments): durable source of truth, survives browser
 *     data clearing, cross-device.
 *   - localStorage: fast client-side cache for immediate recovery on page
 *     reload (avoids a network round-trip on startup).
 *
 * The store is the FIRST thing written when a gateway confirms payment, and the
 * LAST thing deleted after process_payment RPC succeeds.
 *
 * ═══ Write order (critical path) ═══
 *   1. Gateway confirms (FonePay WS/polling → success)
 *   2. PendingPaymentStore.save() → INSERT pending_payments + localStorage
 *   3. callProcessPayment() RPC
 *   4a. On success: PendingPaymentStore.remove() → DELETE + localStorage.remove
 *   4b. On failure: row remains in DB + localStorage for recovery
 *
 * ═══ Recovery order ═══
 *   1. On app startup: PendingPaymentStore.loadPending() → query DB + localStorage
 *   2. Verify gateway status (if FonePay)
 *   3. Check if invoice already exists
 *   4. Resume processing if safe
 *   5. PendingPaymentStore.remove() on completion
 */

import { insforge } from '@/lib/services/auth-service'

// ─── Types ───────────────────────────────────────────────────

export type PendingPaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired'
export type PaymentSourcePage = 'pos' | 'billing' | 'room_checkout' | 'dashboard'

/**
 * The complete payment context needed to resume a failed payment.
 * Stored in both DB and localStorage.
 */
export interface PendingPaymentRecord {
  id: string
  /** Unique payment reference (used as idempotency key) */
  paymentReference: string
  /** Gateway transaction reference (FonePay PRN) */
  gatewayReference?: string
  /** Invoice amount */
  invoiceAmount: number
  /** Payment method key */
  paymentMethod: string
  /** Serialized JSON payload for process_payment RPC */
  invoicePayload: Record<string, unknown>
  /** Idempotency key */
  idempotencyKey?: string
  /** Table ID where payment originated */
  tableId?: string
  /** Room ID where payment originated */
  roomId?: string
  /** Customer name */
  customerName?: string
  /** Source page */
  sourcePage: PaymentSourcePage
  /** Processing status */
  status: PendingPaymentStatus
  /** Retry count */
  retryCount: number
  /** Max retries before admin intervention */
  maxRetries: number
  /** Last error message */
  lastError?: string
  /** Timestamps */
  createdAt: string
  updatedAt: string
  completedAt?: string
}

/**
 * The minimal payload we store for recovery.
 * This is the "receipt" that the gateway confirmed.
 */
export interface PendingPaymentPayload {
  /** Invoice number if pre-generated */
  invoiceNumber?: string
  /** Customer name */
  customerName: string
  /** Table ID */
  tableId: string
  /** POS mode: tables or rooms */
  posMode?: 'tables' | 'rooms'
  /** Subtotal */
  subtotal: number
  /** Discount */
  discount: number
  /** Total (grand total) */
  total: number
  /** Invoice status */
  invoiceStatus: string
  /** Payment method key */
  paymentMethod: string
  /** Amount actually paid */
  paidAmount: number
  /** Payment reference (idempotency key) */
  paymentReference: string
  /** User ID who processed */
  userId?: string | null
  /** IDs of paid items */
  paidItemIds: string[]
  /** Item status to set ('paid' or 'credit') */
  itemPaidStatus: string
  /** Batch IDs involved */
  batchIds: string[]
  /** Order batch IDs for invoice linking */
  orderBatchIds: string[]
  /** Gateway reference (FonePay PRN) */
  gatewayReference?: string
  /** Credit amount if applicable */
  creditAmount?: number
  /** Credit customer name if applicable */
  creditCustomerName?: string
  /** Notes */
  notes?: string
}

// ─── DB Row (snake_case) ────────────────────────────────────

interface PendingPaymentDbRow {
  id: string
  payment_reference: string
  gateway_reference: string | null
  invoice_amount: number
  payment_method: string
  invoice_payload: Record<string, unknown>
  idempotency_key: string | null
  table_id: string | null
  room_id: string | null
  customer_name: string | null
  source_page: string
  status: string
  retry_count: number
  max_retries: number
  last_error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

// ─── Constants ──────────────────────────────────────────────

const STORAGE_KEY = 'pending_payments_cache'
const MAX_RETRIES_DEFAULT = 3
const DB_BATCH_SIZE = 50

// ─── Mapper ─────────────────────────────────────────────────

function rowToRecord(row: PendingPaymentDbRow): PendingPaymentRecord {
  return {
    id: row.id,
    paymentReference: row.payment_reference,
    gatewayReference: row.gateway_reference ?? undefined,
    invoiceAmount: Number(row.invoice_amount),
    paymentMethod: row.payment_method,
    invoicePayload: row.invoice_payload,
    idempotencyKey: row.idempotency_key ?? undefined,
    tableId: row.table_id ?? undefined,
    roomId: row.room_id ?? undefined,
    customerName: row.customer_name ?? undefined,
    sourcePage: row.source_page as PaymentSourcePage,
    status: row.status as PendingPaymentStatus,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  }
}

function recordToRow(record: Partial<PendingPaymentRecord> & { paymentReference: string }): Record<string, unknown> {
  return {
    payment_reference: record.paymentReference,
    gateway_reference: record.gatewayReference ?? null,
    invoice_amount: record.invoiceAmount ?? 0,
    payment_method: record.paymentMethod ?? 'cash',
    invoice_payload: record.invoicePayload ?? {},
    idempotency_key: record.idempotencyKey ?? null,
    table_id: record.tableId ?? null,
    room_id: record.roomId ?? null,
    customer_name: record.customerName ?? null,
    source_page: record.sourcePage ?? 'pos',
    status: record.status ?? 'pending',
    retry_count: record.retryCount ?? 0,
    max_retries: record.maxRetries ?? MAX_RETRIES_DEFAULT,
    last_error: record.lastError ?? null,
  }
}

// ─── localStorage Cache ─────────────────────────────────────

function loadLocalCache(): PendingPaymentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as PendingPaymentRecord[]
  } catch {
    return []
  }
}

function saveLocalCache(records: PendingPaymentRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

function addToLocalCache(record: PendingPaymentRecord): void {
  const cache = loadLocalCache()
  cache.push(record)
  saveLocalCache(cache)
}

function removeFromLocalCache(paymentReference: string): void {
  const cache = loadLocalCache().filter(r => r.paymentReference !== paymentReference)
  saveLocalCache(cache)
}

function updateLocalCache(paymentReference: string, updates: Partial<PendingPaymentRecord>): void {
  const cache = loadLocalCache().map(r =>
    r.paymentReference === paymentReference ? { ...r, ...updates } as PendingPaymentRecord : r
  )
  saveLocalCache(cache)
}

// ─── DB Operations ──────────────────────────────────────────

/**
 * Insert a pending payment record into the DB.
 */
async function insertDbRecord(record: ReturnType<typeof recordToRow>): Promise<PendingPaymentRecord> {
  const { data, error } = await insforge.database
    .from('pending_payments')
    .insert([record])
    .select()
    .single()

  if (error) throw new Error(`Failed to insert pending payment: ${error.message}`)
  return rowToRecord(data as unknown as PendingPaymentDbRow)
}

/**
 * Find pending payments by status.
 */
async function findDbByStatus(status: PendingPaymentStatus | PendingPaymentStatus[]): Promise<PendingPaymentRecord[]> {
  const statuses = Array.isArray(status) ? status : [status]

  const { data, error } = await insforge.database
    .from('pending_payments')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(DB_BATCH_SIZE)

  if (error) throw new Error(`Failed to query pending payments: ${error.message}`)
  return (data ?? []).map((row: unknown) => rowToRecord(row as PendingPaymentDbRow))
}

/**
 * Update a pending payment record in the DB.
 */
async function updateDbRecord(id: string, updates: Record<string, unknown>): Promise<void> {
  const { error } = await insforge.database
    .from('pending_payments')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(`Failed to update pending payment: ${error.message}`)
}

/**
 * Delete a pending payment record from the DB.
 */
async function deleteDbRecord(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('pending_payments')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Failed to delete pending payment: ${error.message}`)
}

/**
 * Find a pending payment by payment reference (for idempotent recovery).
 */
async function findDbByReference(paymentReference: string): Promise<PendingPaymentRecord | null> {
  const { data, error } = await insforge.database
    .from('pending_payments')
    .select('*')
    .eq('payment_reference', paymentReference)
    .maybeSingle()

  if (error) throw new Error(`Failed to find pending payment: ${error.message}`)
  return data ? rowToRecord(data as unknown as PendingPaymentDbRow) : null
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Save a pending payment context BEFORE calling process_payment RPC.
 *
 * This is the CRITICAL operation that ensures a confirmed payment can never
 * be lost. Must be called BEFORE the RPC, not after.
 *
 * @param payload - The complete payment context needed for recovery
 * @param sourcePage - The page/flow that created this payment (default: 'pos')
 * @returns The saved PendingPaymentRecord
 */
export async function savePendingPayment(
  payload: PendingPaymentPayload,
  sourcePage: PaymentSourcePage = 'pos',
): Promise<PendingPaymentRecord> {
  const now = new Date().toISOString()
  const record: PendingPaymentRecord = {
    id: crypto.randomUUID(),
    paymentReference: payload.paymentReference,
    gatewayReference: payload.gatewayReference,
    invoiceAmount: payload.total,
    paymentMethod: payload.paymentMethod,
    invoicePayload: payload as unknown as Record<string, unknown>,
    idempotencyKey: payload.paymentReference,
    tableId: payload.tableId,
    customerName: payload.customerName,
    sourcePage,
    status: 'pending',
    retryCount: 0,
    maxRetries: MAX_RETRIES_DEFAULT,
    createdAt: now,
    updatedAt: now,
  }

  // Write to DB first (source of truth), then to localStorage (fast cache)
  const saved = await insertDbRecord(recordToRow({
    paymentReference: record.paymentReference,
    gatewayReference: record.gatewayReference,
    invoiceAmount: record.invoiceAmount,
    paymentMethod: record.paymentMethod,
    invoicePayload: record.invoicePayload,
    idempotencyKey: record.idempotencyKey,
    tableId: record.tableId,
    customerName: record.customerName,
    sourcePage: record.sourcePage,
    status: record.status,
    retryCount: record.retryCount,
    maxRetries: record.maxRetries,
  }))

  addToLocalCache(saved)
  return saved
}

/**
 * Mark a pending payment as successfully completed.
 * Removes from both DB and localStorage.
 */
export async function completePendingPayment(paymentReference: string): Promise<void> {
  const record = await findDbByReference(paymentReference)
  if (!record) {
    // Already cleaned up — idempotent
    removeFromLocalCache(paymentReference)
    return
  }

  await updateDbRecord(record.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  })

  removeFromLocalCache(paymentReference)
}

/**
 * Mark a pending payment as failed with an error message.
 * Keeps the record in DB for admin review/recovery.
 */
export async function failPendingPayment(
  paymentReference: string,
  errorMessage: string,
): Promise<void> {
  const record = await findDbByReference(paymentReference)
  if (!record) return // Already completed or never existed

  const newRetryCount = record.retryCount + 1
  const status = newRetryCount >= record.maxRetries ? 'failed' : 'pending'

  await updateDbRecord(record.id, {
    status,
    retry_count: newRetryCount,
    last_error: errorMessage,
  })

  updateLocalCache(paymentReference, {
    status: status as PendingPaymentStatus,
    retryCount: newRetryCount,
    lastError: errorMessage,
  })
}

/**
 * Load all pending (uncompleted) payments.
 * Returns both from DB and localStorage.
 */
export async function loadPendingPayments(): Promise<{
  dbRecords: PendingPaymentRecord[]
  localRecords: PendingPaymentRecord[]
}> {
  const [dbRecords, localRecords] = await Promise.all([
    findDbByStatus(['pending', 'processing']).catch(() => [] as PendingPaymentRecord[]),
    Promise.resolve(loadLocalCache()),
  ])

  return { dbRecords, localRecords }
}

/**
 * Get a pending payment by payment reference.
 */
export async function getPendingPayment(
  paymentReference: string,
): Promise<PendingPaymentRecord | null> {
  return findDbByReference(paymentReference)
}

/**
 * Find all failed pending payments (for admin reconciliation).
 */
export async function loadFailedPayments(): Promise<PendingPaymentRecord[]> {
  return findDbByStatus('failed')
}

/**
 * Find all pending payments for a specific table.
 */
export async function loadPendingPaymentsForTable(tableId: string): Promise<PendingPaymentRecord[]> {
  const { data, error } = await insforge.database
    .from('pending_payments')
    .select('*')
    .eq('table_id', tableId)
    .in('status', ['pending', 'processing', 'failed'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load pending payments for table: ${error.message}`)
  return (data ?? []).map((row: unknown) => rowToRecord(row as PendingPaymentDbRow))
}

/**
 * Count pending payments by status.
 */
export async function countPendingPayments(): Promise<{
  pending: number
  processing: number
  failed: number
  completed: number
}> {
  try {
    const { data, error } = await insforge.database
      .rpc('count_pending_payments_by_status')

    if (!error && data) {
      const rows = data as Array<{ status: string; count: number }>
      return {
        pending: rows.find(r => r.status === 'pending')?.count ?? 0,
        processing: rows.find(r => r.status === 'processing')?.count ?? 0,
        failed: rows.find(r => r.status === 'failed')?.count ?? 0,
        completed: rows.find(r => r.status === 'completed')?.count ?? 0,
      }
    }
  } catch {
    // RPC may not exist yet — fall back to select query
  }

  // Fallback: select just status (uses index, not full row fetch)
  try {
    const { data, error } = await insforge.database
      .from('pending_payments')
      .select('status')

    if (error) {
      return { pending: 0, processing: 0, failed: 0, completed: 0 }
    }

    const rows = (data ?? []) as Array<{ status: string }>
    return {
      pending: rows.filter(r => r.status === 'pending').length,
      processing: rows.filter(r => r.status === 'processing').length,
      failed: rows.filter(r => r.status === 'failed').length,
      completed: rows.filter(r => r.status === 'completed').length,
    }
  } catch {
    return { pending: 0, processing: 0, failed: 0, completed: 0 }
  }
}

/**
 * Retry a failed payment — reset its status so recovery can pick it up.
 */
export async function retryPendingPayment(id: string): Promise<void> {
  await updateDbRecord(id, {
    status: 'pending',
    retry_count: 0,
    last_error: null,
  })
}

/**
 * Purge old completed records (older than N days).
 */
export async function purgeOldRecords(daysOld: number = 30): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysOld)

  const { data, error } = await insforge.database
    .from('pending_payments')
    .delete()
    .eq('status', 'completed')
    .lt('created_at', cutoff.toISOString())
    .select('id')

  if (error) throw new Error(`Failed to purge old records: ${error.message}`)
  return (data ?? []).length
}

/**
 * Update a pending payment's processing status (mark as 'processing').
 * Called when a payment recovery attempt begins.
 */
export async function markPaymentProcessing(paymentReference: string): Promise<void> {
  const record = await findDbByReference(paymentReference)
  if (!record) return

  await updateDbRecord(record.id, {
    status: 'processing',
  })

  updateLocalCache(paymentReference, {
    status: 'processing',
  })
}

// ─── Dev-only logging ───────────────────────────────────────

function log(...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log('[PENDING_PAYMENT]', ...args)
  }
}
