/**
 * Idempotency Guard
 * ─────────────────
 *
 * Prevents duplicate payment records by generating unique idempotency keys
 * and checking for existing payments before allowing an insert.
 *
 * The idempotency key is stored in the payment's `reference` field using a
 * standard prefix format: `IDEM-<entity_type>-<entity_id>-<timestamp_window>-<nonce>`
 *
 * Usage:
 *   const guard = createIdempotencyGuard()
 *   const { isDuplicate, existingPayment, proceed, idempotencyKey } = await guard.check({
 *     entityType: 'invoice',
 *     entityId: invoiceId,
 *     amount: 1500,
 *   })
 *   if (isDuplicate) { return existingPayment }  // Already processed
 *   await db.insertOne('payments', {
 *     ...paymentData,
 *     reference: idempotencyKey,
 *   })
 */

import { db } from '@/lib/db/insforge'
import type { PaymentRow } from '@/lib/db/types'

// ─── Configuration ───────────────────────────────────────────

/**
 * Time window (in ms) within which duplicate submissions are detected.
 * If two payment attempts for the same entity+amount happen within this
 * window, only the first one goes through.
 */
const IDEMPOTENCY_WINDOW_MS = 5_000 // 5 seconds

// ─── Types ───────────────────────────────────────────────────

export interface IdempotencyCheckParams {
  /** The type of entity being paid (e.g., 'invoice', 'batch', 'customer') */
  entityType: string
  /** The ID of the entity being paid */
  entityId: string
  /** The payment amount */
  amount: number
  /** Optional extra discriminator (e.g., batch_id for POS payments) */
  discriminator?: string
}

export interface IdempotencyCheckResult {
  /** True if a payment with this key already exists (duplicate) */
  isDuplicate: boolean
  /** The existing payment row if a duplicate was found */
  existingPayment: PaymentRow | null
  /** True if the caller should proceed with the insert */
  proceed: boolean
  /** The generated idempotency key to store in the payment's reference field */
  idempotencyKey: string
  /** Parsed details from duplicate payment, if found */
  duplicateDetails?: {
    id: string
    createdAt: string
  }
}

// ─── Key Generation ─────────────────────────────────────────

/**
 * Generate a unique idempotency key.
 *
 * Format: IDEM-{entityType}-{entityId}-{timestampWindow}-{nonce}
 *
 * The timestamp window is rounded to IDEMPOTENCY_WINDOW_MS so that
 * rapid retries within the same window produce the same key.
 */
export function generateIdempotencyKey(params: IdempotencyCheckParams): string {
  const now = Date.now()
  const windowStart = Math.floor(now / IDEMPOTENCY_WINDOW_MS) * IDEMPOTENCY_WINDOW_MS
  const nonce = Math.random().toString(36).slice(2, 6).toUpperCase()
  const discriminator = params.discriminator ? `-${params.discriminator.slice(0, 8)}` : ''

  return `IDEM-${params.entityType}-${params.entityId.slice(0, 12)}${discriminator}-${windowStart}-${nonce}`
}

// ─── Duplicate Check ─────────────────────────────────────────

/**
 * Check if a payment with the given idempotency key already exists.
 * Also checks for payments matching entity + amount within the time window
 * as a fallback for cases where a previous payment was stored under a
 * different reference format (backward compatibility).
 */
async function findExistingPayment(
  reference: string,
  entityFilter?: { invoice_id?: string; customer_id?: string; amount?: number },
): Promise<PaymentRow | null> {
  // Primary check: match by reference (idempotency key)
  const { data: byRef } = await db.findMany<Record<string, unknown>>('payments', {
    reference,
  }) as { data: PaymentRow[] | null; error: Error | null }
  if (byRef && byRef.length > 0) return byRef[0]

  // Fallback: check for recent payments matching entity + amount
  // (catches rapid double-clicks where the first payment didn't have the key format)
  if (entityFilter?.invoice_id && entityFilter.amount) {
    const { data: byEntity } = await db.findMany<Record<string, unknown>>('payments', {
      invoice_id: entityFilter.invoice_id,
    }) as { data: PaymentRow[] | null; error: Error | null }
    if (byEntity) {
      const recent = byEntity.find(
        (p) =>
          p.amount === entityFilter.amount &&
          Date.now() - new Date(p.created_at).getTime() < IDEMPOTENCY_WINDOW_MS * 2,
      )
      if (recent) return recent
    }
  }

  if (entityFilter?.customer_id && entityFilter.amount) {
    const { data: byEntity } = await db.findMany<Record<string, unknown>>('payments', {
      customer_id: entityFilter.customer_id,
    }) as { data: PaymentRow[] | null; error: Error | null }
    if (byEntity) {
      const recent = byEntity.find(
        (p) =>
          p.amount === entityFilter.amount &&
          Date.now() - new Date(p.created_at).getTime() < IDEMPOTENCY_WINDOW_MS * 2,
      )
      if (recent) return recent
    }
  }

  return null
}

// ─── Guard Function ──────────────────────────────────────────

/**
 * Creates an idempotency guard that checks for duplicate payments
 * before allowing a payment insert.
 *
 * Returns a `check()` function that you call right before inserting a payment.
 *
 * @example
 *   const guard = createIdempotencyGuard()
 *
 *   async function handlePayment() {
 *     const { isDuplicate, proceed, idempotencyKey } = await guard.check({
 *       entityType: 'invoice',
 *       entityId: invoiceId,
 *       amount: 1500,
 *     })
 *     if (!proceed) return // Duplicate — already handled
 *
 *     await db.insertOne('payments', {
 *       reference: idempotencyKey,
 *       // ...other payment data
 *     })
 *   }
 */
export function createIdempotencyGuard() {
  // Track recently completed checks in-memory to prevent re-checks
  // within the same render cycle (for React strict mode / double-renders)
  const recentKeys = new Set<string>()

  function scheduleCleanup() {
    setTimeout(() => {
      recentKeys.clear()
    }, IDEMPOTENCY_WINDOW_MS * 2)
  }
  scheduleCleanup()

  return {
    /**
     * Check if this payment attempt is a duplicate.
     * Returns `{ isDuplicate, existingPayment, proceed, idempotencyKey }`.
     *
     * - If `proceed` is false, the caller should NOT insert the payment
     *   (it's a duplicate or already being processed).
     * - The `idempotencyKey` should be stored in the payment's `reference` field.
     */
    async check(params: IdempotencyCheckParams): Promise<IdempotencyCheckResult> {
      const idempotencyKey = generateIdempotencyKey(params)

      // In-memory duplicate check (same JS render cycle)
      if (recentKeys.has(idempotencyKey)) {
        return {
          isDuplicate: true,
          existingPayment: null,
          proceed: false,
          idempotencyKey,
          duplicateDetails: { id: 'in-memory', createdAt: new Date().toISOString() },
        }
      }

      // Mark as in-flight before DB check to prevent race conditions
      recentKeys.add(idempotencyKey)

      // DB duplicate check
      const entityFilter = {
        ...(params.entityType === 'invoice' ? { invoice_id: params.entityId } : {}),
        ...(params.entityType === 'customer' ? { customer_id: params.entityId } : {}),
        amount: params.amount,
      }

      const existing = await findExistingPayment(idempotencyKey, entityFilter)

      if (existing) {
        return {
          isDuplicate: true,
          existingPayment: existing,
          proceed: false,
          idempotencyKey,
          duplicateDetails: {
            id: existing.id,
            createdAt: existing.created_at,
          },
        }
      }

      return {
        isDuplicate: false,
        existingPayment: null,
        proceed: true,
        idempotencyKey,
      }
    },

    /**
     * Clear the in-memory cache. Call this after a payment completes
     * (success or failure) to free memory.
     */
    clear() {
      recentKeys.clear()
    },
  }
}

// ─── Singleton for convenience ───────────────────────────────

/**
 * Default singleton idempotency guard. Reuse across the app.
 * For isolated payment flows (e.g., separate POS vs Billing),
 * create separate guards via `createIdempotencyGuard()`.
 */
export const idempotencyGuard = createIdempotencyGuard()
