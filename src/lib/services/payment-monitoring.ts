/**
 * Payment Monitoring Service
 * ───────────────────────────
 * Production monitoring for payment lifecycle events.
 *
 * Tracks structured events throughout the payment flow:
 *   - Attempts, successes, failures
 *   - Duplicate detection, concurrency conflicts
 *   - Authorization failures, validation failures
 *   - Retries, timeouts
 *
 * In production, these events can be forwarded to:
 *   - Application logging service (e.g., DataDog, CloudWatch)
 *   - Metrics pipeline (e.g., Prometheus counters)
 *   - Error tracking (e.g., Sentry)
 *
 * Design: Simple disciplined logging with structured JSON — keeps the
 * monitoring layer decoupled from any specific external service.
 */

// ─── Event Types ─────────────────────────────────────────────

export type PaymentMonitorEvent =
  | 'payment_started'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_duplicate'
  | 'payment_timeout'
  | 'payment_retry'
  | 'payment_concurrency_failure'
  | 'payment_authorization_failure'
  | 'payment_validation_failure'
  | 'payment_deferred_op_success'
  | 'payment_deferred_op_failed'
  | 'payment_deferred_op_retry'

// ─── Event Payload ───────────────────────────────────────────

export interface PaymentMonitorPayload {
  /** Payment reference (for correlation) */
  paymentReference?: string
  /** Invoice ID if available */
  invoiceId?: string
  /** Invoice number */
  invoiceNumber?: string
  /** Table ID where payment was processed */
  tableId?: string
  /** User ID who processed the payment */
  userId?: string
  /** Error code from RPC response */
  errorCode?: string
  /** Error message */
  errorMessage?: string
  /** PostgreSQL SQLSTATE if present */
  sqlstate?: string
  /** Execution time in milliseconds */
  elapsedMs?: number
  /** Role of the user who processed payment */
  userRole?: string
  /** Payment method used */
  paymentMethod?: string
  /** Payment amount */
  amount?: number
  /** Deferred operation name (for deferred ops monitoring) */
  deferredOp?: string
  /** Retry attempt number */
  retryAttempt?: number
  /** Maximum retries configured */
  maxRetries?: number
  /** Additional structured context */
  details?: Record<string, unknown>
}

// ─── Configuration ───────────────────────────────────────────

interface PaymentMonitorConfig {
  /** Whether to log to console in production (default: false) */
  consoleLogging?: boolean
  /** Whether to send events to the activity_logs table (default: false) */
  activityLogging?: boolean
}

const DEFAULT_CONFIG: PaymentMonitorConfig = {
  consoleLogging: import.meta.env.DEV,
  activityLogging: true,
}

// ─── Monitor Implementation ─────────────────────────────────

/**
 * Track a payment lifecycle event.
 *
 * In production, this function should be wired to your observability
 * pipeline (DataDog, CloudWatch, Sentry, etc.). Currently logs structured
 * JSON to console in DEV and records to activity_logs in production.
 *
 * @param event - The payment event type
 * @param payload - Structured context for the event
 * @param config - Optional overrides for monitoring configuration
 */
export function trackPaymentEvent(
  event: PaymentMonitorEvent,
  payload: PaymentMonitorPayload,
  config: PaymentMonitorConfig = DEFAULT_CONFIG,
): void {
  // Build structured log entry
  const entry = {
    event: `payment_monitor.${event}`,
    timestamp: new Date().toISOString(),
    ...payload,
  }

  // Console logging (DEV only by default)
  if (config.consoleLogging) {
    const level = event.endsWith('_failed') || event.includes('failure')
      ? 'warn'
      : event === 'payment_success'
        ? 'info'
        : 'debug'
    console[level]('[PAYMENT_MONITOR]', JSON.stringify(entry))
  }

  // Activity logging — only for significant events
  if (config.activityLogging && shouldLogToActivity(event)) {
    logPaymentActivity(event, entry)
  }
}

/**
 * Determine whether an event is significant enough to log to activity_logs.
 */
function shouldLogToActivity(event: PaymentMonitorEvent): boolean {
  return [
    'payment_success',
    'payment_failed',
    'payment_duplicate',
    'payment_concurrency_failure',
    'payment_authorization_failure',
  ].includes(event)
}

/**
 * Asynchronously log to activity_logs table (fire-and-forget).
 */
async function logPaymentActivity(
  event: string,
  entry: Record<string, unknown>,
): Promise<void> {
  try {
    // Dynamic import to avoid circular dependencies
    const { insforge } = await import('@/lib/services/auth-service')
    await insforge.database
      .from('activity_logs')
      .insert({
        activity_type: event,
        entity_label: `Payment: ${entry.paymentReference ?? 'unknown'}`,
        status: event.includes('success') ? 'completed' : 'failed',
        details: JSON.stringify(entry),
      })
  } catch {
    // Non-critical — monitoring failures must never affect the application
  }
}

// ─── Convenience Helpers ─────────────────────────────────────

/**
 * Track a successful payment.
 */
export function trackPaymentSuccess(
  paymentReference: string,
  invoiceId: string,
  invoiceNumber: string,
  tableId: string,
  userId: string,
  amount: number,
  method: string,
  elapsedMs: number,
): void {
  trackPaymentEvent('payment_success', {
    paymentReference,
    invoiceId,
    invoiceNumber,
    tableId,
    userId,
    amount,
    paymentMethod: method,
    elapsedMs,
  })
}

/**
 * Track a failed payment with structured error context.
 */
export function trackPaymentFailure(
  paymentReference: string,
  errorCode: string,
  errorMessage: string,
  tableId: string,
  userId: string,
  elapsedMs: number,
): void {
  const event: PaymentMonitorEvent =
    errorCode === 'CONCURRENCY_CONFLICT'
      ? 'payment_concurrency_failure'
      : errorCode === 'UNAUTHORIZED'
        ? 'payment_authorization_failure'
        : errorCode === 'VALIDATION_ERROR' || errorCode === 'INVALID_PAYMENT_METHOD' || errorCode === 'INVALID_BATCH' || errorCode === 'INVALID_TABLE'
          ? 'payment_validation_failure'
          : 'payment_failed'

  trackPaymentEvent(event, {
    paymentReference,
    errorCode,
    errorMessage,
    tableId,
    userId,
    elapsedMs,
  })
}

/**
 * Track a duplicate payment detection.
 */
export function trackPaymentDuplicate(
  paymentReference: string,
  invoiceId: string,
  invoiceNumber: string,
  tableId: string,
  userId: string,
): void {
  trackPaymentEvent('payment_duplicate', {
    paymentReference,
    invoiceId,
    invoiceNumber,
    tableId,
    userId,
  })
}

/**
 * Track a deferred operation retry.
 */
export function trackDeferredOpRetry(
  opName: string,
  attempt: number,
  maxRetries: number,
  paymentReference: string,
): void {
  trackPaymentEvent('payment_deferred_op_retry', {
    deferredOp: opName,
    retryAttempt: attempt,
    maxRetries,
    paymentReference,
  })
}
