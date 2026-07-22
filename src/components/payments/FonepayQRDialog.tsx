import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QrCode, RefreshCw, CheckCircle, Timer, AlertCircle, Wifi, WifiOff, X, Loader2 } from 'lucide-react'
import QRCode from 'qrcode'
import type { FonepayQRData } from '@/lib/services/fonepay-service'
import {
  generateFonepayQR,
  checkQRStatus,
  connectFonepayWebSocket,
  isFonepayConfigured,
  generatePRN,
  FonepayError,
  FONEPAY_CONFIG,
  type FonepayWSStatus,
} from '@/lib/services/fonepay-service'

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`

/**
 * Generate a QR code data URL using the pure QR matrix API
 * (QRCode.create) and manual SVG rendering.
 *
 * This completely avoids qrcode's browser.js entry point which
 * goes through renderCanvas — a function that checks canvas.getContext
 * on a string argument and crashes on first mount in some environments.
 */
function generateQRDataURL(
  text: string,
  options: { width: number; margin: number; color: { dark: string; light: string } },
): string {
  if (!text || text.trim().length === 0) {
    throw new Error(
      'Cannot generate QR code: Fonepay returned an empty QR message. ' +
        'This may indicate a configuration issue with the payment gateway.',
    )
  }
  const qrData = QRCode.create(text, { margin: options.margin })
  const size = qrData.modules.size
  const data = qrData.modules.data
  const margin = options.margin
  const qrSize = size + margin * 2

  // Build SVG path for dark modules (same algorithm as qrcode/svg-tag.js)
  let path = ''
  let moveBy = 0
  let newRow = false
  let lineLength = 0

  for (let i = 0; i < data.length; i++) {
    const col = i % size
    const row = Math.floor(i / size)

    if (!col && !newRow) newRow = true

    if (data[i]) {
      lineLength++

      if (!(i > 0 && col > 0 && data[i - 1])) {
        path += newRow
          ? `M${col + margin} ${0.5 + row + margin}`
          : `m${moveBy} 0`
        moveBy = 0
        newRow = false
      }

      if (!(col + 1 < size && data[i + 1])) {
        path += `h${lineLength}`
        lineLength = 0
      }
    } else {
      moveBy++
    }
  }

  const bg = `<path fill="${options.color.light}" d="M0 0h${qrSize}v${qrSize}H0z"/>`
  const dots = `<path stroke="${options.color.dark}" d="${path}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.width}" viewBox="0 0 ${qrSize} ${qrSize}" shape-rendering="crispEdges">${bg}${dots}</svg>`

  // Convert SVG to base64 data URL
  const base64 =
    typeof window !== 'undefined'
      ? window.btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg).toString('base64')
  return `data:image/svg+xml;base64,${base64}`
}

// ─── Structured Logging ─────────────────────────────────────

function log(prefix: string, ...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log(`[FonePay:${prefix}]`, ...args)
  }
}

// ─── Types ──────────────────────────────────────────────────

type QRStatus = 'generating' | 'displaying' | 'success' | 'expired' | 'error'

interface StatusText {
  icon: React.ElementType
  text: string
  color: string
  spin?: boolean
}

interface FonepayQRDialogProps {
  amount: number
  orderId?: string
  /**
   * Called ONCE when payment is confirmed (successfully processed).
   * The caller should process payment persistence, printing, and close.
   * The dialog handles its own brief success animation before calling this.
   */
  onSuccess: () => void
  onCancel: () => void
  customerName?: string
  invoiceNumber?: string
}

// ─── Component ──────────────────────────────────────────────

export function FonepayQRDialog({
  amount,
  orderId,
  onSuccess,
  onCancel,
  customerName,
  invoiceNumber,
}: FonepayQRDialogProps) {
  const [status, setStatus] = useState<QRStatus>('generating')
  const [qrData, setQrData] = useState<FonepayQRData | null>(null)
  const [timeLeft, setTimeLeft] = useState(FONEPAY_CONFIG.qrTimeoutSeconds)
  const [errorMessage, setErrorMessage] = useState('')
  const [wsStatus, setWsStatus] = useState<FonepayWSStatus>('disconnected')
  const [qrVerified, setQrVerified] = useState(false)

  // ─── Refs for side-effect management (no re-renders) ────
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const wsCleanupRef = useRef<(() => void) | null>(null)
  const cancelledRef = useRef(false)
  /** Idempotency guard — onSuccess fires exactly once */
  const successHandledRef = useRef(false)
  /** Already expired — don't start new polling if component re-renders */
  const expiredRef = useRef(false)

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  const timerPercent = (timeLeft / FONEPAY_CONFIG.qrTimeoutSeconds) * 100

  // ─── QR Generation (mount only, with retry for gateway warmup) ─
  //
  // Console logs show the FonePay gateway returns empty qrMessage on the
  // FIRST call with a new PRN, and the actual QR on the SECOND call with
  // that SAME PRN.  This retry loop keeps using the same PRN so the
  // gateway session created by the first call is reused on retries.
  //
  // Only retries on empty QR — auth/network errors surface immediately.
  // ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    const initQR = async () => {
      log('INIT', 'Starting QR generation')

      if (!isFonepayConfigured()) {
        setErrorMessage(
          'Fonepay is not configured. Please set VITE_FONEPAY_MERCHANT_CODE and VITE_FONEPAY_API_BASE_URL in your .env file.',
        )
        setStatus('error')
        return
      }

      // Generate PRN ONCE — reuse across retries so the gateway session
      // created by the first call is picked up by subsequent attempts.
      // PRN MUST be a UUID-format string — the Fonepay API rejects non-UUID values.
      const prn = generatePRN()

      const MAX_ATTEMPTS = 5

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (!mounted || cancelledRef.current) return

        try {
          const data = await generateFonepayQR({
            amount,
            prn,
            remarks1: `Highlands Cafe POS\n${invoiceNumber || customerName || 'POS Payment'}`,
          })
          if (!mounted || cancelledRef.current) return

          log('QR_GENERATED', { prn: prn.slice(0, 8), attempt })

          // Empty QR → retry with same PRN (gateway needs warmup call).
          // Retries are back-to-back with no delay — the first call creates
          // the gateway session, subsequent calls reuse it.
          if (!data.qrMessage || data.qrMessage.trim().length === 0) {
            if (attempt < MAX_ATTEMPTS - 1) continue
            throw new FonepayError(
              'Payment gateway is not responding. ' +
                'Please try again or choose another payment method.',
              'EMPTY_QR_MESSAGE',
            )
          }

          // Success — render QR
          const qrImage = generateQRDataURL(data.qrMessage, {
            width: 320,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          })

          setQrData({
            qrImage,
            paymentRefId: prn,
            wsUrl: data.thirdpartyQrWebSocketUrl,
          })
          setStatus('displaying')
          return
        } catch (err) {
          if (!mounted) return
          // Auth/network errors surface immediately — don't retry
          if (err instanceof FonepayError &&
              (err.code === 'FUNCTION_ERROR' || err.code === 'FONEPAY_API_ERROR')) {
            throw err
          }
          // For unknown errors, try the last attempt before surfacing
          if (attempt >= MAX_ATTEMPTS - 1) throw err
          log('QR_RETRY_ERROR', `Attempt ${attempt} failed, retrying...`, err)
        }
      }
    }

    initQR().catch((err) => {
      if (!mounted) return
      log('QR_GENERATION_ERROR', err)
      setErrorMessage(
        err instanceof FonepayError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to generate QR code',
      )
      setStatus('error')
    })

    return () => {
      mounted = false
    }
    // Only regenerate on explicit props that change the QR content.
    // invoiceNumber is excluded because it is baked into the remark at
    // generation time; regenerating would create a duplicate PRN error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, orderId, customerName])

  // ─── Handle payment success (idempotent) ─────────────────
  // ⚠️ MUST be declared BEFORE the polling+WebSocket effect that depends on it.
  //     JavaScript `const` has a temporal dead zone — referencing it in a
  //     useEffect dependency array before its declaration causes a ReferenceError.
  const handlePaymentSuccess = useCallback(() => {
    if (successHandledRef.current) return
    successHandledRef.current = true

    // Clean up all side-effects immediately
    pollAbortRef.current?.abort()
    wsCleanupRef.current?.()
    wsCleanupRef.current = null
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }

    setStatus('success')
  }, []) // stable identity — never re-creates

  // ─── Polling + WebSocket (started when QR displays) ─────
  useEffect(() => {
    if (status !== 'displaying' || !qrData) return

    // Don't start fresh polling if we already succeeded or expired
    if (successHandledRef.current || expiredRef.current) return

    log('POLL_START', 'Background polling + WebSocket starting')

    pollAbortRef.current = new AbortController()

    // ── WebSocket (real-time) ──────────────────────────────
    if (qrData.wsUrl) {
      wsCleanupRef.current = connectFonepayWebSocket(qrData.wsUrl, {
        onQRVerified: () => {
          if (cancelledRef.current || successHandledRef.current) return
          log('QR_VERIFIED', 'Customer scanned')
          setQrVerified(true)
        },
        onPaymentSuccess: () => {
          if (cancelledRef.current || successHandledRef.current) return
          log('WS_PAYMENT_SUCCESS', 'WebSocket confirmed')
          handlePaymentSuccess()
        },
        onPaymentFailed: () => {
          // The initial paymentSuccess:false state is NOT a failure.
          // Only genuine failures after QR verification are caught
          // by the WebSocket handler in fonepay-service.ts.
          // For the initial state, we simply keep waiting.
        },
        onStatusChange: (s) => {
          if (!cancelledRef.current) setWsStatus(s)
        },
      })
    }

    // ── Polling fallback (polling interval, independent) ───
    let activePolling = true
    let pollAttempt = 0

    const poll = async () => {
      // Capture the success callback once at start to avoid stale-closure issues
      // if the effect re-runs before the polling loop completes.
      const onPaymentSuccess = () => handlePaymentSuccess()

      while (activePolling && pollAttempt < FONEPAY_CONFIG.maxPollingAttempts) {
        if (
          cancelledRef.current ||
          successHandledRef.current ||
          !activePolling
        )
          return

        pollAttempt++

        try {
          const result = await checkQRStatus(qrData.paymentRefId)
          if (
            cancelledRef.current ||
            successHandledRef.current ||
            !activePolling
          )
            return

          if (result.paymentStatus === 'success') {
            log('POLL_PAYMENT_SUCCESS', { attempt: pollAttempt })
            onPaymentSuccess()
            return
          }
        } catch {
          // Network error — keep polling
        }

        await new Promise((r) => setTimeout(r, FONEPAY_CONFIG.pollingIntervalMs))
      }

      if (
        !cancelledRef.current &&
        !successHandledRef.current &&
        activePolling &&
        pollAttempt >= FONEPAY_CONFIG.maxPollingAttempts
      ) {
        log('POLL_TIMEOUT', 'Max attempts reached')
        setErrorMessage('Payment polling timed out — the QR may have expired.')
        expiredRef.current = true
        setStatus('expired')
      }
    }

    poll()

    return () => {
      activePolling = false
      pollAbortRef.current?.abort()
      wsCleanupRef.current?.()
      wsCleanupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, qrData, handlePaymentSuccess])

  // ─── Countdown timer for QR expiry ───────────────────────
  useEffect(() => {
    if (status === 'success') return // stop countdown on success

    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          // Only expire if not already succeeded
          if (!successHandledRef.current) {
            pollAbortRef.current?.abort()
            wsCleanupRef.current?.()
            wsCleanupRef.current = null
            expiredRef.current = true
            log('QR_EXPIRED', 'Countdown reached zero')
            setStatus('expired')
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [status === 'success']) // only re-create when exiting success state

  // ─── Fire onSuccess after success animation (separate effect, not clobbered by polling cleanup) ──
  useEffect(() => {
    if (status !== 'success') return

    const timer = setTimeout(() => {
      if (!cancelledRef.current) {
        log('ON_SUCCESS_CALLED', 'Handing off to parent')
        onSuccess()
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [status, onSuccess])

  // ─── Callbacks ───────────────────────────────────────────
  const handleCancel = useCallback(() => {
    log('CANCEL', 'User closed payment dialog')
    cancelledRef.current = true
    if (countdownRef.current) clearInterval(countdownRef.current)
    pollAbortRef.current?.abort()
    wsCleanupRef.current?.()
    wsCleanupRef.current = null
    onCancel()
  }, [onCancel])

  const handleRegenerate = useCallback(async () => {
    log('REGENERATE', 'User requested new QR')

    // Clean up old state
    pollAbortRef.current?.abort()
    wsCleanupRef.current?.()
    wsCleanupRef.current = null
    if (countdownRef.current) clearInterval(countdownRef.current)

    cancelledRef.current = false
    successHandledRef.current = false
    expiredRef.current = false
    setQrVerified(false)
    setErrorMessage('')

    if (!isFonepayConfigured()) {
      setErrorMessage('Fonepay is not configured.')
      setStatus('error')
      return
    }

    const prn = orderId || generatePRN()
    try {
      const data = await generateFonepayQR({
        amount,
        prn,
        remarks1: `Highlands Cafe POS\n${invoiceNumber || customerName || 'POS Payment'}`,
      })
      log('REGENERATE_QR_GENERATED', { prn: prn.slice(0, 8) })

      if (!data.qrMessage || data.qrMessage.trim().length === 0) {
        throw new FonepayError(
          'Payment gateway returned an empty QR code. ' +
            'Please check the gateway configuration and try again.',
          'EMPTY_QR_MESSAGE',
        )
      }

      const qrImage = generateQRDataURL(data.qrMessage, {
        width: 320,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQrData({
        qrImage,
        paymentRefId: prn,
        wsUrl: data.thirdpartyQrWebSocketUrl,
      })
    } catch (err) {
      log('REGENERATE_ERROR', err)
      setErrorMessage(
        err instanceof FonepayError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to generate QR code',
      )
      setStatus('error')
      return
    }

    setTimeLeft(FONEPAY_CONFIG.qrTimeoutSeconds)
    setStatus('displaying')
  }, [amount, orderId, customerName, invoiceNumber])

  // ─── Status indicator text ───────────────────────────────
  const statusText: StatusText = (() => {
    if (status === 'success') return { icon: CheckCircle, text: 'Payment Successful!', color: 'text-emerald-600', spin: false }
    if (status === 'expired') return { icon: Timer, text: 'QR Expired', color: 'text-amber-600', spin: false }
    if (status === 'error') return { icon: AlertCircle, text: errorMessage || 'Error', color: 'text-red-600', spin: false }
    if (qrVerified) return { icon: Loader2, text: 'Processing payment...', color: 'text-blue-600', spin: true }
    if (wsStatus === 'connected') return { icon: Wifi, text: 'Waiting for customer to scan...', color: 'text-blue-600', spin: false }
    if (wsStatus === 'connecting') return { icon: Loader2, text: 'Connecting to payment gateway...', color: 'text-muted-foreground', spin: true }
    // disconnected or error
    return { icon: WifiOff, text: 'Connection lost. Retrying...', color: 'text-amber-600', spin: false }
  })()

  const StatusIcon = statusText.icon
  const shouldSpin = statusText.spin ?? false

  // ─── Render ──────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        key="fonepay-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="relative w-full max-w-sm rounded-xl border bg-background p-6 shadow-lg overflow-hidden"
        >
          {/* ─── Header ─────────────────────────────────── */}
          <div className="mb-4 flex items-center justify-between">
            <motion.h2
              className="text-lg font-semibold flex items-center gap-2"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <QrCode className="h-5 w-5" /> FonePay QR
            </motion.h2>
            {status !== 'success' && (
              <motion.button
                type="button"
                onClick={handleCancel}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="min-h-[44px] min-w-[44px] rounded-sm opacity-70 hover:opacity-100 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </div>

          {/* ─── Order summary ──────────────────────────── */}
          <motion.div
            className="mb-4 rounded-lg border bg-muted p-3 text-sm space-y-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="font-medium font-mono">
                {invoiceNumber || orderId?.slice(0, 8) || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold text-lg">{npr(amount)}</span>
            </div>
          </motion.div>

          {/* ─── QR Display Area (always visible when generated) ── */}
          <div className="flex flex-col items-center gap-3">
            {status === 'generating' ? (
              <motion.div
                key="generating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-10 gap-3"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                >
                  <QrCode className="h-12 w-12 text-primary/40" />
                </motion.div>
                <p className="text-sm text-muted-foreground">
                  Generating payment QR...
                </p>
              </motion.div>
            ) : (
              /* QR stays visible in ALL states: displaying, success, expired, error */
              <motion.div
                key="qr-container"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative"
              >
                {/* QR image */}
                <div className="rounded-xl border-2 border-border bg-white p-2 sm:p-3">
                  {qrData?.qrImage ? (
                    <img
                      src={qrData.qrImage}
                      alt="FonePay QR"
                      className="w-72 h-72 sm:w-80 sm:h-80 object-contain"
                    />
                  ) : (
                    <div className="w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center bg-muted rounded-lg">
                      <div className="text-center">
                        <QrCode className="h-16 w-16 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">QR placeholder</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── Success overlay ──────────────────── */}
                {status === 'success' && (
                  <motion.div
                    key="success-overlay"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-xl backdrop-blur-sm"
                  >
                    <motion.div
                      className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    >
                      <CheckCircle className="h-12 w-12 text-white" />
                    </motion.div>
                    <motion.p
                      className="mt-3 text-lg font-bold text-white drop-shadow-sm"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                    >
                      Payment Successful!
                    </motion.p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>

          {/* ─── Status indicator (below QR) ────────────── */}
          {status !== 'generating' && (
            <motion.div
              className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg ${
                status === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/20'
                  : status === 'expired'
                    ? 'bg-amber-50 dark:bg-amber-950/20'
                    : status === 'error'
                      ? 'bg-red-50 dark:bg-red-950/20'
                      : qrVerified
                        ? 'bg-blue-50 dark:bg-blue-950/20'
                        : wsStatus === 'connected'
                          ? 'bg-blue-50 dark:bg-blue-950/20'
                          : 'bg-amber-50 dark:bg-amber-950/20'
              }`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <StatusIcon
                className={`h-4 w-4 shrink-0 ${statusText.color} ${shouldSpin ? 'animate-spin' : ''}`}
              />
              <span className={`text-xs font-medium ${statusText.color}`}>
                {statusText.text}
              </span>
            </motion.div>
          )}

          {/* ─── Countdown bar (only when displaying) ──── */}
          {status === 'displaying' && (
            <motion.div
              className="mt-3 space-y-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>QR expires in</span>
                <span
                  className={`font-mono font-medium ${
                    timeLeft < 60
                      ? 'text-destructive'
                      : timeLeft < 120
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                  }`}
                >
                  {formatTime(timeLeft)}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    timeLeft < 60
                      ? 'bg-destructive'
                      : timeLeft < 120
                        ? 'bg-amber-500'
                        : 'bg-primary'
                  }`}
                  style={{ width: `${timerPercent}%` }}
                />
              </div>
            </motion.div>
          )}

          {/* ─── Action buttons ─────────────────────────── */}
          <motion.div
            className="flex items-center justify-between gap-2 pt-4 mt-3 border-t border-border"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex gap-2">
              {status === 'expired' && (
                <button
                  onClick={handleRegenerate}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors active:scale-[0.98]"
                >
                  <RefreshCw className="h-4 w-4" /> Generate New QR
                </button>
              )}
              {status === 'error' && (
                <button
                  onClick={handleRegenerate}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors active:scale-[0.98]"
                >
                  <RefreshCw className="h-4 w-4" /> Try Again
                </button>
              )}
              {status === 'displaying' && (
                <button
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </motion.div>

          {/* ─── Help text for customer (always) ────────── */}
          {status === 'displaying' && (
            <motion.p
              className="mt-3 text-[10px] text-muted-foreground/60 text-center leading-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              Open your <strong>mobile banking app</strong> → <strong>Scan QR</strong>{' '}
              → <strong>Confirm payment</strong>
            </motion.p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
