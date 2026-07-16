import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, QrCode, RefreshCw, CheckCircle, Timer, Search, AlertCircle } from 'lucide-react'
import QRCode from 'qrcode'
import type { FonepayQRData } from '@/lib/services/fonepay-service'
import {
  generateFonepayQR,
  pollFonepayPayment,
  isFonepayConfigured,
  generatePRN,
  FonepayError,
  FONEPAY_CONFIG,
} from '@/lib/services/fonepay-service'

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`

interface FonepayQRDialogProps {
  amount: number
  orderId?: string
  onSuccess: () => void
  onCancel: () => void
  customerName?: string
}

type QRStatus = 'generating' | 'displaying' | 'verifying' | 'success' | 'expired' | 'error'

export function FonepayQRDialog({ amount, orderId, onSuccess, onCancel, customerName }: FonepayQRDialogProps) {
  const [status, setStatus] = useState<QRStatus>('generating')
  const [qrData, setQrData] = useState<FonepayQRData | null>(null)
  const [timeLeft, setTimeLeft] = useState(FONEPAY_CONFIG.qrTimeoutSeconds)
  const [errorMessage, setErrorMessage] = useState('')
  const [pollStatus, setPollStatus] = useState('')
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const timerPercent = (timeLeft / FONEPAY_CONFIG.qrTimeoutSeconds) * 100

  // ─── Generate QR on mount ──────────────────────────────────
  useEffect(() => {
    const initQR = async () => {
      if (!isFonepayConfigured()) {
        setErrorMessage('Fonepay is not configured. Please set VITE_FONEPAY_MERCHANT_CODE and VITE_FONEPAY_API_BASE_URL in your .env file.')
        setStatus('error')
        return
      }

      try {
        const data = await generateFonepayQR({
          amount,
          prn: orderId || generatePRN(),
          remarks1: customerName || 'POS Payment',
        })
        if (!cancelledRef.current) {
          // Convert Fonepay QR payload string into a rendered QR code image
          const qrImage = await QRCode.toDataURL(data.qrMessage, {
            width: 320,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          })
          setQrData({
            qrImage,
            paymentRefId: orderId || generatePRN(),
          })
          setStatus('displaying')
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setErrorMessage(err instanceof FonepayError ? err.message : 'Failed to generate QR code')
          setStatus('error')
        }
      }
    }
    initQR()
  }, [amount, orderId, customerName])

  // ─── Start polling when QR is displayed ────────────────────
  useEffect(() => {
    if (status !== 'displaying' || !qrData) return

    pollAbortRef.current = new AbortController()

    const startPolling = async () => {
      try {
        const result = await pollFonepayPayment(
          qrData.paymentRefId,
          amount,
          (s) => { if (!cancelledRef.current) setPollStatus(s) },
          pollAbortRef.current?.signal,
        )

        if (!cancelledRef.current) {
          if (result.success) {
            setStatus('success')
            setTimeout(() => {
              if (!cancelledRef.current) onSuccess()
            }, 1200)
          } else {
            setErrorMessage(result.message || 'Payment verification failed')
            setStatus('error')
          }
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setErrorMessage(err instanceof Error ? err.message : 'Payment polling failed')
          setStatus('error')
        }
      }
    }

    startPolling()

    return () => {
      pollAbortRef.current?.abort()
    }
  }, [status, qrData, amount, onSuccess])

  // ─── Countdown timer for QR expiry ─────────────────────────
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          pollAbortRef.current?.abort()
          setStatus('expired')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  const handleCancel = useCallback(() => {
    cancelledRef.current = true
    if (countdownRef.current) clearInterval(countdownRef.current)
    pollAbortRef.current?.abort()
    onCancel()
  }, [onCancel])

  const handleRegenerate = async () => {
    cancelledRef.current = false
    setErrorMessage('')
    setPollStatus('')

    if (!isFonepayConfigured()) {
      setErrorMessage('Fonepay is not configured.')
      setStatus('error')
      return
    }

    try {
      const data = await generateFonepayQR({
        amount,
        prn: orderId || generatePRN(),
        remarks1: customerName || 'POS Payment',
      })
      // Convert Fonepay QR payload string into a rendered QR code image
      const qrImage = await QRCode.toDataURL(data.qrMessage, {
        width: 320,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQrData({
        qrImage,
        paymentRefId: orderId || generatePRN(),
      })
    } catch (err) {
      setErrorMessage(err instanceof FonepayError ? err.message : 'Failed to generate QR code')
      setStatus('error')
      return
    }

    setTimeLeft(FONEPAY_CONFIG.qrTimeoutSeconds)
    setStatus('displaying')
  }

  return (
    <AnimatePresence>
      <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <motion.h2 className="text-lg font-semibold flex items-center gap-2" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <QrCode className="h-5 w-5" /> FonePay QR
            </motion.h2>
            {status !== 'success' && (
              <motion.button type="button" onClick={handleCancel} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="min-h-[44px] min-w-[44px] rounded-sm opacity-70 hover:opacity-100">
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </div>

          <motion.div className="mb-4 rounded-lg border bg-muted p-3 text-sm space-y-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span className="font-medium font-mono">{orderId?.slice(0, 8) || 'N/A'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold text-lg">{npr(amount)}</span></div>
          </motion.div>

          <AnimatePresence mode="wait">
            {status === 'generating' && (
              <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center py-10 gap-3">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
                  <QrCode className="h-12 w-12 text-primary/40" />
                </motion.div>
                <p className="text-sm text-muted-foreground">Generating payment QR...</p>
              </motion.div>
            )}

            {status === 'displaying' && (
              <motion.div key="displaying" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="flex flex-col items-center gap-3">
                <div className="rounded-xl border-2 border-border bg-white p-2 sm:p-3">
                  {qrData?.qrImage ? (
                    <img src={qrData.qrImage} alt="FonePay QR" className="w-72 h-72 sm:w-80 sm:h-80 object-contain" />
                  ) : (
                    <div className="w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center bg-muted rounded-lg">
                      <div className="text-center">
                        <QrCode className="h-16 w-16 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">QR placeholder</p>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground text-center">Open your <strong>mobile banking app</strong> &rarr; <strong>Scan QR</strong> &rarr; <strong>Confirm</strong></p>
                <div className="flex items-center gap-1 text-sm font-medium">
                  <Timer className={`h-4 w-4 ${timeLeft < 60 ? 'text-destructive' : 'text-amber-600'}`} />
                  <span className={timeLeft < 60 ? 'text-destructive' : 'text-amber-600'}>Expires in {formatTime(timeLeft)}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all duration-1000 ${timeLeft < 60 ? 'bg-destructive' : timeLeft < 120 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${timerPercent}%` }} />
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-300">
                  <Search className="h-3.5 w-3.5" /><span>Waiting for payment confirmation{pollStatus ? ` (${pollStatus})` : '...'}</span>
                </div>
              </motion.div>
            )}

            {status === 'verifying' && (
              <motion.div key="verifying" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col items-center py-6 gap-2">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <RefreshCw className="h-8 w-8 text-primary" />
                </motion.div>
                <p className="text-sm font-medium">Verifying payment...</p>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="flex flex-col items-center py-6 gap-2">
                <motion.div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}>
                  <CheckCircle className="h-10 w-10 text-green-500" />
                </motion.div>
                <motion.p className="text-base font-semibold text-green-600" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>Payment Successful!</motion.p>
                <motion.p className="text-xs text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>Redirecting to invoice...</motion.p>
              </motion.div>
            )}

            {status === 'expired' && (
              <motion.div key="expired" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col items-center py-6 gap-2">
                <motion.div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/20 flex items-center justify-center" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                  <Timer className="h-10 w-10 text-amber-500" />
                </motion.div>
                <p className="text-sm font-medium text-amber-600">QR code expired</p>
                <p className="text-xs text-muted-foreground text-center">Generate a new QR code to try again.</p>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col items-center py-6 gap-2">
                <motion.div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                  <AlertCircle className="h-10 w-10 text-red-500" />
                </motion.div>
                <p className="text-sm font-medium text-red-600">Payment Error</p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">{errorMessage}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div className="flex items-center justify-between gap-2 pt-4 border-t border-border" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <div className="flex gap-2">
              {(status === 'expired' || status === 'error') && (
                <button onClick={handleRegenerate} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  <RefreshCw className="h-4 w-4" /> Try Again
                </button>
              )}
              {status === 'displaying' && (
                <button onClick={handleCancel} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
                  Cancel
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
