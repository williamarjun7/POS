/**
 * MultiMethodSplitView
 * ────────────────────
 * Replaces the single-method payment selection when in Split Payment mode.
 *
 * The cashier can allocate the split total across multiple methods:
 *   - Cash: Rs. 500
 *   - Reception QR: Rs. 700
 *   - Remaining: Rs. 800 (as credit)
 *
 * On confirm, it returns all allocations + partial flag to the parent
 * which builds the PaymentResult with splitPayments[].
 *
 * No payment logic lives here — this is purely a UI allocation builder.
 */

import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Banknote, Smartphone, Check, Plus, Trash2,
  CreditCard, AlertCircle, Users,
} from 'lucide-react'
import { getPaymentMethodLabel } from '@/lib/payment-methods'

// ─── Types ───────────────────────────────────────────────────

export interface PaymentAllocation {
  id: string
  method: 'cash' | 'reception_qr' | 'fonepay'
  amount: number
}

interface MultiMethodSplitViewProps {
  /** Total amount that needs to be allocated across methods */
  splitTotal: number
  /** Called with all allocations + whether remaining becomes credit */
  onConfirm: (params: {
    allocations: PaymentAllocation[]
    partialRemaining: boolean
  }) => void
  onBack: () => void
}

// ─── Constants ───────────────────────────────────────────────

const ALLOWED_METHODS: Array<{
  key: PaymentAllocation['method']
  icon: React.ElementType
  color: string
}> = [
  { key: 'cash', icon: Banknote, color: 'emerald' },
  { key: 'reception_qr', icon: Smartphone, color: 'sky' },
  // fonepay excluded — requires QR generation + gateway polling which can't
  // happen inside the multi-method builder. Use the dedicated FonePay dialog.
]

const METHOD_COLORS: Record<string, string> = {
  cash: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/10',
  reception_qr: 'border-sky-400 bg-sky-50 dark:bg-sky-950/10',
  fonepay: 'border-blue-400 bg-blue-50 dark:bg-blue-950/10',
}

// ─── Helpers ─────────────────────────────────────────────────

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`

let allocationCounter = 0
function nextAllocId(): string {
  return `alloc-${++allocationCounter}`
}

// ─── Component ───────────────────────────────────────────────

export function MultiMethodSplitView({
  splitTotal,
  onConfirm,
  onBack,
}: MultiMethodSplitViewProps) {
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([
    { id: nextAllocId(), method: 'cash', amount: 0 },
  ])
  const [partialRemaining, setPartialRemaining] = useState(false)

  const allocatedTotal = useMemo(
    () => allocations.reduce((sum, a) => sum + Math.max(0, a.amount || 0), 0),
    [allocations],
  )
  const remaining = Math.max(0, splitTotal - allocatedTotal)
  const canFitMore = allocatedTotal < splitTotal

  const isConfirmValid = useMemo(() => {
    // At least one allocation with amount > 0
    const hasRealPayment = allocations.some(a => (a.amount || 0) > 0)
    // Total allocated must be <= split total
    const notOver = allocatedTotal <= splitTotal + 0.01 // small tolerance for rounding
    // If remaining > 0, partial must be checked OR already allocated to some method
    const remainingOk = remaining <= 0 || partialRemaining || allocatedTotal === splitTotal
    return hasRealPayment && notOver && remainingOk
  }, [allocations, allocatedTotal, remaining, partialRemaining, splitTotal])

  // ─── Handlers ─────────────────────────────────────────────

  const addAllocation = useCallback(() => {
    const unusedMethods = ALLOWED_METHODS.filter(
      m => !allocations.some(a => a.method === m.key && (a.amount || 0) > 0),
    )
    const firstUnused = unusedMethods[0] ?? ALLOWED_METHODS[0]
    setAllocations(prev => [
      ...prev,
      { id: nextAllocId(), method: firstUnused.key, amount: 0 },
    ])
  }, [allocations])

  const removeAllocation = useCallback((id: string) => {
    setAllocations(prev => prev.filter(a => a.id !== id))
  }, [])

  const updateAllocation = useCallback((id: string, updates: Partial<PaymentAllocation>) => {
    setAllocations(prev => prev.map(a => (a.id === id ? { ...a, ...updates } : a)))
  }, [])

  const handleConfirm = useCallback(() => {
    if (!isConfirmValid) return

    // Filter out zero-amount allocations
    const valid = allocations.filter(a => (a.amount || 0) > 0)

    // If remaining is handled as credit AND no methods have been allocated,
    // reject because there's nothing to process.
    if (valid.length === 0 && remaining > 0 && !partialRemaining) {
      return
    }

    onConfirm({ allocations: valid, partialRemaining })
  }, [isConfirmValid, allocations, remaining, partialRemaining, onConfirm])

  // If no allocation has a method selected, use the default icon
  const getMethodIcon = (method: string): React.ElementType => {
    const found = ALLOWED_METHODS.find(m => m.key === method)
    return found?.icon ?? Banknote
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold">Split Across Methods</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
        {/* Split Total */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Split Total</span>
            <span className="text-2xl font-bold tabular-nums">{npr(splitTotal)}</span>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-center gap-2 rounded-lg bg-teal-50 dark:bg-teal-950/20 px-3 py-2 text-xs text-teal-700 dark:text-teal-300">
          <Users className="h-4 w-4 shrink-0" />
          <span>Allocate the total across one or more payment methods. Any remaining balance can be left as customer credit.</span>
        </div>

        {/* Payment Allocation Rows */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payment Allocations
          </p>

          {allocations.map((alloc, index) => {
            const Icon = getMethodIcon(alloc.method)
            return (
              <div
                key={alloc.id}
                className={`flex items-center gap-3 p-3 rounded-xl border ${METHOD_COLORS[alloc.method] ?? 'border-border bg-card'}`}
              >
                {/* Method selector */}
                <select
                  value={alloc.method}
                  onChange={e => updateAllocation(alloc.id, { method: e.target.value as PaymentAllocation['method'] })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/30 min-h-[44px]"
                >
                  {ALLOWED_METHODS.map(m => (
                    <option key={m.key} value={m.key}>
                      {getPaymentMethodLabel(m.key)}
                    </option>
                  ))}
                </select>

                {/* Amount input */}
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    Rs.
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={splitTotal}
                    step="1"
                    value={alloc.amount || ''}
                    onChange={e => updateAllocation(alloc.id, {
                      amount: Math.max(0, Math.min(splitTotal, Number(e.target.value) || 0)),
                    })}
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    placeholder="0"
                    className="w-full h-11 text-lg font-bold rounded-lg border border-border bg-transparent pl-10 pr-3 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-center tabular-nums"
                    autoFocus={index === 0}
                  />
                </div>

                {/* Remove button (only show if > 1 allocation) */}
                {allocations.length > 1 && (
                  <button
                    onClick={() => removeAllocation(alloc.id)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Remove allocation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}

          {/* Add Payment Method button */}
          {canFitMore && allocations.length < 3 && (
            <button
              onClick={addAllocation}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-muted-foreground/30 text-sm font-medium text-muted-foreground hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Payment Method
            </button>
          )}
        </div>

        {/* Running Totals */}
        <div className="rounded-xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/20 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Allocated</span>
            <span className="font-semibold tabular-nums">{npr(allocatedTotal)}</span>
          </div>
          <hr className="border-teal-200 dark:border-teal-800/50" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Split Total</span>
            <span className="font-semibold tabular-nums">{npr(splitTotal)}</span>
          </div>
          <hr className="border-teal-200 dark:border-teal-800/50" />
          <div className="flex justify-between items-center">
            <span className={`text-base font-bold ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {remaining > 0 ? 'Remaining' : 'Fully Allocated'}
            </span>
            <span className={`text-lg font-bold tabular-nums ${remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {npr(remaining)}
            </span>
          </div>
        </div>

        {/* Partial Payment toggle — shown when remaining > 0 */}
        {remaining > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 shrink-0">
              <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Complete as Partial Payment
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {npr(remaining)} will be added as customer outstanding credit
              </p>
            </div>
            <button
              onClick={() => setPartialRemaining(prev => !prev)}
              className={`relative flex items-center justify-center w-12 h-7 rounded-full transition-colors shrink-0 ${
                partialRemaining ? 'bg-amber-500' : 'bg-muted-foreground/30'
              }`}
              role="switch"
              aria-checked={partialRemaining}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={`block w-5 h-5 rounded-full bg-white shadow-sm ${
                  partialRemaining ? 'translate-x-[1.35rem]' : 'translate-x-[0.2rem]'
                }`}
              />
            </button>
          </motion.div>
        )}

        {/* Validation messages */}
        {allocatedTotal > splitTotal && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Allocated amount exceeds the split total by {npr(allocatedTotal - splitTotal)}</span>
          </div>
        )}
        {remaining > 0 && !partialRemaining && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>The remaining {npr(remaining)} will not be recorded. Enable "Complete as Partial Payment" to create outstanding credit.</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t shrink-0 space-y-2">
        <button
          onClick={handleConfirm}
          disabled={!isConfirmValid}
          className="w-full h-14 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-teal-400 hover:to-teal-500 transition-all active:scale-[0.99] shadow-sm"
        >
          <Check className="h-5 w-5" />
          {remaining > 0 && partialRemaining
            ? `Receive ${npr(allocatedTotal)} + Credit ${npr(remaining)}`
            : `Confirm — ${npr(allocatedTotal)}`
          }
        </button>
      </div>
    </div>
  )
}
