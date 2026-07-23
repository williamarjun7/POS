/**
 * PartialPaymentDialog — Global Payment Modal Integration
 * ─────────────────────────────────────────────────────────
 *
 * The Partial Payment dialog is an orchestration layer only.
 * It does NOT process payments. It collects:
 *   1. Amount Received
 *   2. Payment Method (Cash | Reception QR | FonePay QR)
 *
 * Then it launches the EXISTING global payment modal for the chosen method.
 * After the modal reports success, the parent auto-creates Customer Credit
 * for the remaining balance.
 *
 * This component MUST NOT duplicate any payment logic.
 */

import { useState, useMemo, useCallback } from 'react'
import { Banknote, Smartphone, QrCode, Check, ArrowLeft, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { getPaymentMethodLabel } from '@/lib/payment-methods'

// ─── Types ───────────────────────────────────────────────────

type PaymentMethod = 'cash' | 'fonepay' | 'reception_qr'

interface PartialPaymentDialogProps {
  invoiceTotal: number
  invoiceNumber?: string
  onConfirm: (params: {
    amount: number
    method: PaymentMethod
    remainingAmount: number
  }) => void
  onCancel: () => void
  submitting?: boolean
}

// ─── Constants ───────────────────────────────────────────────

const PAYMENT_METHODS: Array<{
  value: PaymentMethod
  label: string
  icon: React.ElementType
}> = [
  { value: 'cash', label: getPaymentMethodLabel('cash'), icon: Banknote },
  { value: 'reception_qr', label: getPaymentMethodLabel('reception_qr'), icon: Smartphone },
  { value: 'fonepay', label: getPaymentMethodLabel('fonepay'), icon: QrCode },
]

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000]

// ─── Helpers ─────────────────────────────────────────────────

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`

// ─── Component ───────────────────────────────────────────────

export function PartialPaymentDialog({
  invoiceTotal,
  invoiceNumber,
  onConfirm,
  onCancel,
  submitting = false,
}: PartialPaymentDialogProps) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')

  const amountNum = Number(amount) || 0
  const remaining = Math.max(0, invoiceTotal - amountNum)

  // Validation per spec:
  //   0 < Amount Received < Invoice Total
  const isAmountValid = amountNum > 0 && amountNum < invoiceTotal
  const isFullPayment = amountNum === invoiceTotal && invoiceTotal > 0
  const isOverPayment = amountNum > invoiceTotal

  const canContinue = isAmountValid && method !== null && !submitting

  // ─── Quick amounts ──────────────────────────────────────
  const quickAmounts = useMemo(() => {
    const items: Array<{ label: string; value: number }> = []
    for (const a of QUICK_AMOUNTS) {
      if (a < invoiceTotal) items.push({ label: String(a), value: a })
    }
    if (!items.find(i => i.value === Math.floor(invoiceTotal / 2))) {
      items.push({ label: 'Half', value: Math.floor(invoiceTotal / 2) })
    }
    // Cap at 5 items for brevity
    return items.slice(0, 5)
  }, [invoiceTotal])

  // ─── Confirm ────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!canContinue) return
    onConfirm({ amount: amountNum, method, remainingAmount: remaining })
  }, [canContinue, onConfirm, amountNum, method, remaining])

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="relative w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-2xl border bg-background shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* ─── Header: ← Partial Payment  ✕ ───────────── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-muted transition-colors -ml-1"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <h2 className="text-base font-bold">Partial Payment</h2>
          </div>
          <button
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* ─── Invoice Total ───────────────────────────── */}
        <div className="px-5 pt-1 pb-3 text-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {invoiceNumber ? `Invoice ${invoiceNumber}` : 'Invoice Total'}
          </p>
          <p className="text-4xl font-black tracking-tight text-foreground mt-1">
            {npr(invoiceTotal)}
          </p>
        </div>

        <hr className="border-border mx-5" />

        {/* ─── Amount Received ─────────────────────────── */}
        <div className="px-5 pt-4 pb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
            Amount Received
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground/40 pointer-events-none select-none">
              Rs.
            </span>
            <input
              type="number"
              min="0"
              max={invoiceTotal}
              step="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onWheel={e => (e.target as HTMLInputElement).blur()}
              placeholder="0"
              autoFocus
              className="w-full h-14 text-2xl font-bold rounded-xl border-2 border-border bg-card/30 pl-14 pr-4 outline-none
                         placeholder:text-muted-foreground/30 text-center tracking-wider
                         focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20
                         transition-all duration-200"
            />
          </div>
        </div>

        {/* ─── Quick Amount Buttons ────────────────────── */}
        <div className="px-5 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {quickAmounts.map(qa => (
              <button
                key={qa.value}
                onClick={() => setAmount(String(qa.value))}
                className={`px-4 py-2.5 min-h-[44px] rounded-lg border text-sm font-semibold transition-all duration-150
                  ${amountNum === qa.value
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'border-border hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 text-muted-foreground hover:text-foreground'
                  }`}
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Remaining Balance (live) ────────────────── */}
        {amountNum > 0 && amountNum < invoiceTotal && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-5 pb-2"
          >
            <div className="flex justify-between items-center rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-4 py-2.5">
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Remaining Balance
              </span>
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {npr(remaining)}
              </span>
            </div>
          </motion.div>
        )}

        {/* ─── Validation Messages ─────────────────────── */}
        {isFullPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-5 pb-1"
          >
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 border border-destructive/20">
              This is a full payment. Please use the standard payment methods instead of Partial Payment.
            </p>
          </motion.div>
        )}
        {isOverPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-5 pb-1"
          >
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 border border-destructive/20">
              Amount received cannot exceed the invoice total.
            </p>
          </motion.div>
        )}

        <hr className="border-border mx-5" />

        {/* ─── Select Payment Method ───────────────────── */}
        <div className="px-5 pt-3 pb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
            Select Payment Method
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PAYMENT_METHODS.map(pm => {
              const Icon = pm.icon
              const isActive = method === pm.value
              return (
                <button
                  key={pm.value}
                  onClick={() => setMethod(pm.value)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50
                    ${isActive
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-md shadow-emerald-500/10 -translate-y-0.5'
                      : 'border-border hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 hover:shadow-sm'
                    }`}
                >
                  {isActive && (
                    <span className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white shadow-sm">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 ${
                    isActive
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 scale-110'
                      : 'bg-muted'
                  }`}>
                    <Icon className={`h-5 w-5 ${
                      isActive ? 'text-emerald-600' : 'text-muted-foreground'
                    }`} />
                  </div>
                  <span className={`text-xs font-semibold text-center leading-tight ${
                    isActive
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-muted-foreground'
                  }`}>
                    {pm.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <hr className="border-border mx-5" />

        {/* ─── Bottom Actions ──────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="h-12 px-6 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all active:scale-[0.98] disabled:opacity-50"
          >
            Cancel
          </button>
          <motion.button
            onClick={handleConfirm}
            disabled={!canContinue}
            whileTap={canContinue ? { scale: 0.98 } : {}}
            className="flex-1 h-12 rounded-xl bg-emerald-500 text-white font-bold text-sm
                       flex items-center justify-center gap-2
                       disabled:opacity-40 disabled:cursor-not-allowed
                       hover:bg-emerald-600 active:bg-emerald-700
                       transition-all duration-200 shadow-lg shadow-emerald-500/20"
          >
            <Check className="h-4 w-4" />
            Continue Payment
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
