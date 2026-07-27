/**
 * Error Classification Utility
 * ────────────────────────────
 *
 * Classifies HTTP/network errors for React Query retry logic.
 * Enables intelligent backoff: quick retries for transient errors,
 * no retries for permanent failures.
 */

export type ErrorClass =
  | 'network'      // DNS, timeout, connection refused
  | 'server'       // 500, 502, 503, 504
  | 'rate-limit'   // 429
  | 'client'       // 400, 403, 404
  | 'auth'         // 401, 403
  | 'unknown'

interface ClassifyResult {
  class: ErrorClass
  retryable: boolean
  /** Base retry delay in ms (multiplied by attempt for exponential backoff) */
  baseDelay: number
}

/**
 * Classify an error for retry decisions.
 *
 * Returns retryable: true for transient errors (network, 502, 503, 504, 429)
 * and retryable: false for permanent failures (400, 401, 403, 404).
 */
export function classifyError(error: unknown): ClassifyResult {
  if (!error || typeof error !== 'object') {
    return { class: 'unknown', retryable: true, baseDelay: 1000 }
  }

  const err = error as Record<string, unknown>

  // Network errors (TypeError from fetch, AbortError, etc.)
  if (err instanceof TypeError || err.name === 'AbortError') {
    return { class: 'network', retryable: true, baseDelay: 1000 }
  }

  // HTTP status code from response-like errors
  const status = err.status ?? err.code ?? err.statusCode
  if (typeof status === 'number') {
    if (status === 429) {
      return { class: 'rate-limit', retryable: true, baseDelay: 5000 }
    }
    if (status === 401 || status === 403) {
      return { class: 'auth', retryable: false, baseDelay: 0 }
    }
    if (status >= 500) {
      // 502, 503, 504 — transient backend failures
      return { class: 'server', retryable: true, baseDelay: 2000 }
    }
    if (status >= 400) {
      return { class: 'client', retryable: false, baseDelay: 0 }
    }
  }

  // InsForge SDK error object (has .message and optionally .status)
  if (typeof err.message === 'string') {
    const msg = err.message.toLowerCase()
    if (msg.includes('502') || msg.includes('bad gateway')) {
      return { class: 'server', retryable: true, baseDelay: 2000 }
    }
    if (msg.includes('503') || msg.includes('service unavailable')) {
      return { class: 'server', retryable: true, baseDelay: 3000 }
    }
    if (msg.includes('504') || msg.includes('gateway timeout')) {
      return { class: 'server', retryable: true, baseDelay: 3000 }
    }
    if (msg.includes('429') || msg.includes('too many requests')) {
      return { class: 'rate-limit', retryable: true, baseDelay: 5000 }
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) {
      return { class: 'network', retryable: true, baseDelay: 1000 }
    }
  }

  return { class: 'unknown', retryable: true, baseDelay: 1000 }
}

/**
 * Create a React Query onError callback that logs classification info.
 * Use with queryClient.setMutationDefaults or individual query configs.
 */
export function logClassifiedError(context: string, error: unknown) {
  const { class: errorClass } = classifyError(error)
  console.warn(`[${context}] Error class: ${errorClass}`, error)
}
