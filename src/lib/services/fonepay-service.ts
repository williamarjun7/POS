/**
 * Fonepay Merchant Integration — Dynamic QR via Device
 * ────────────────────────────────────────────────────
 *
 * Frontend client that calls InsForge edge functions for all
 * Fonepay API interactions. The secret key never leaves the server.
 *
 * Edge functions (deployed):
 *   fonepay-qr-generate  — HMAC + Fonepay QR API
 *   fonepay-qr-status    — HMAC + Fonepay status check
 *   fonepay-tax-refund   — HMAC + Fonepay tax refund
 *
 * WebSocket connection is direct to Fonepay (no secret needed).
 */

import { insforge } from '@/lib/services/auth-service'

// ─── Configuration ────────────────────────────────────────────

export const FONEPAY_CONFIG = {
  qrTimeoutSeconds: 300,
  pollingIntervalMs: 2000,
  maxPollingAttempts: 150,
  merchantCode: import.meta.env.VITE_FONEPAY_MERCHANT_CODE || '',
  apiBaseUrl: import.meta.env.VITE_FONEPAY_API_BASE_URL || '',
}

export interface FonepayQRData {
  qrImage: string
  paymentRefId: string
  qrMessage?: string
  wsUrl?: string
  expiresAt?: string
}

export function isFonepayConfigured(): boolean {
  return !!(FONEPAY_CONFIG.merchantCode && FONEPAY_CONFIG.apiBaseUrl)
}

// ─── Types ───────────────────────────────────────────────────

export interface QRGenerateResponse {
  message: string
  qrMessage: string
  status: string
  statusCode: number
  success: boolean
  thirdpartyQrWebSocketUrl: string
}

export interface QRStatusResponse {
  fonepayTraceId: number
  merchantCode: string
  paymentStatus: 'success' | 'failed' | 'pending'
  prn: string
}

export interface TaxRefundResponse {
  fonepayTraceId: number
  message: string
  success: boolean
}

export interface ParsedTransactionStatus {
  remarks1?: string
  remarks2?: string
  transactionDate?: string
  productNumber?: string
  amount?: string
  message?: string
  success?: boolean
  commissionType?: string
  commissionAmount?: number
  totalCalculatedAmount?: number
  paymentSuccess?: boolean
  traceId?: number
  qrVerified?: boolean
}

export class FonepayError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'FonepayError'
    this.code = code
  }
}

// ─── Edge Function Calls ────────────────────────────────────

async function invokeFonepay<T>(slug: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await insforge.functions.invoke(slug, { body })
  if (error) throw new FonepayError(error.message, 'FUNCTION_ERROR')
  if (!data) throw new FonepayError('Empty response from server', 'EMPTY_RESPONSE')
  // Edge functions return the Fonepay response wrapped in our JSON helper
  if (data.error) throw new FonepayError(data.error, 'FONEPAY_API_ERROR')
  return data as T
}

/**
 * Generate a dynamic QR code via Fonepay.
 * Server handles HMAC-SHA512 signing and API call.
 */
export async function generateFonepayQR(params: {
  amount: number
  prn: string
  remarks1?: string
  remarks2?: string
  taxAmount?: number
  taxRefund?: number
}): Promise<QRGenerateResponse> {
  return invokeFonepay<QRGenerateResponse>('fonepay-qr-generate', {
    amount: params.amount,
    prn: params.prn,
    remarks1: params.remarks1 ?? 'POS Payment',
    remarks2: params.remarks2 ?? '',
    taxAmount: params.taxAmount,
    taxRefund: params.taxRefund,
  })
}

/**
 * Check QR/payment status via Fonepay.
 * Server handles HMAC-SHA512 signing and API call.
 */
export async function checkQRStatus(prn: string): Promise<QRStatusResponse> {
  return invokeFonepay<QRStatusResponse>('fonepay-qr-status', { prn })
}

/**
 * Submit tax refund / IRD data after successful payment.
 * Server handles HMAC-SHA512 signing and API call.
 */
export async function submitTaxRefund(params: {
  fonepayTraceId: number
  merchantPRN: string
  invoiceNumber: string
  invoiceDate: string
  transactionAmount: number
}): Promise<TaxRefundResponse> {
  return invokeFonepay<TaxRefundResponse>('fonepay-tax-refund', params)
}

// ─── WebSocket (direct to Fonepay — no secret needed) ───────

export type FonepayWSStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface FonepayWSListener {
  onPaymentSuccess: (event: ParsedTransactionStatus) => void
  onPaymentFailed: (event: ParsedTransactionStatus) => void
  onQRVerified: (event: ParsedTransactionStatus) => void
  onStatusChange: (status: FonepayWSStatus) => void
}

interface WebSocketPaymentEvent {
  merchantId: number
  deviceId: string
  transactionStatus: string
}

/**
 * Connect to Fonepay WebSocket for real-time payment events.
 * The WS URL is returned by the QR generation response — no secret needed.
 */
export function connectFonepayWebSocket(
  wsUrl: string,
  listener: FonepayWSListener,
): () => void {
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function connect() {
    if (disposed) return
    listener.onStatusChange('connecting')

    try {
      ws = new WebSocket(wsUrl)
    } catch {
      listener.onStatusChange('error')
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      if (!disposed) listener.onStatusChange('connected')
    }

    ws.onmessage = (event) => {
      if (disposed) return
      try {
        const data: WebSocketPaymentEvent = JSON.parse(event.data)
        const status: ParsedTransactionStatus = JSON.parse(data.transactionStatus)

        if (status.qrVerified) {
          listener.onQRVerified(status)
        } else if (status.paymentSuccess === true) {
          listener.onPaymentSuccess(status)
        } else if (status.paymentSuccess === false) {
          listener.onPaymentFailed(status)
        }
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      if (!disposed) {
        listener.onStatusChange('disconnected')
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      if (!disposed) listener.onStatusChange('error')
    }
  }

  function scheduleReconnect() {
    if (disposed) return
    reconnectTimer = setTimeout(connect, 3000)
  }

  connect()

  return () => {
    disposed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.close()
    }
  }
}

// ─── Utility ─────────────────────────────────────────────────

/**
 * Poll Fonepay payment status until success or timeout.
 */
export async function pollFonepayPayment(
  paymentRefId: string,
  _expectedAmount: number,
  onStatusChange?: (status: string) => void,
  signal?: AbortSignal,
): Promise<{ success: boolean; message?: string }> {
  for (let attempt = 0; attempt < FONEPAY_CONFIG.maxPollingAttempts; attempt++) {
    if (signal?.aborted) {
      return { success: false, message: 'Polling cancelled' }
    }

    onStatusChange?.(`Attempt ${attempt + 1}...`)

    try {
      const result = await checkQRStatus(paymentRefId)

      if (result.paymentStatus === 'success') {
        return { success: true, message: 'Payment successful' }
      } else if (result.paymentStatus === 'failed') {
        return { success: false, message: 'Payment failed' }
      }
      // 'pending' — keep polling
    } catch {
      // Network error, keep trying
    }

    await new Promise(resolve => setTimeout(resolve, FONEPAY_CONFIG.pollingIntervalMs))
  }

  return { success: false, message: 'Payment polling timed out' }
}

/** Generate a unique PRN (Product Reference Number) */
export function generatePRN(): string {
  return crypto.randomUUID()
}
