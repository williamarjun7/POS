import { useState } from "react"
import { motion } from "framer-motion"
import { cn, formatCurrency } from "@/lib/utils"
import {
  CreditCard, Wallet, X, ArrowLeft,
  Loader2, CheckCircle,
} from "lucide-react"

interface BookingPaymentModalProps {
  open: boolean
  guestName: string
  roomLabel: string
  nights: number
  total: number
  onPayNow: () => void
  onPayLater: () => void
  onCancel: () => void
  processing?: boolean
}

export function BookingPaymentModal({
  open,
  guestName,
  roomLabel,
  nights,
  total,
  onPayNow,
  onPayLater,
  onCancel,
  processing,
}: BookingPaymentModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-3 text-center border-b border-border">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <CreditCard className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Complete Booking</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Room {roomLabel} — {guestName}
          </p>
        </div>

        {/* Summary */}
        <div className="px-5 py-4 space-y-2 bg-muted/20">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stay</span>
            <span className="font-medium">{nights} night{nights !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-foreground">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Options */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground text-center mb-1">
            How would you like to handle payment?
          </p>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={onPayNow}
            disabled={processing}
            className={cn(
              "w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all",
              "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
              "hover:border-emerald-600 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/30",
              "disabled:opacity-50",
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm shrink-0">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Pay Now</p>
              <p className="text-[11px] text-emerald-600/60 dark:text-emerald-400/60">
                Pay {formatCurrency(total)} now to confirm
              </p>
            </div>
            <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={onPayLater}
            disabled={processing}
            className={cn(
              "w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all",
              "border-border bg-card",
              "hover:border-foreground/20 hover:bg-muted/50",
              "disabled:opacity-50",
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-sm shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Pay at Checkout</p>
              <p className="text-[11px] text-muted-foreground/60">
                No payment needed now. Settle at checkout.
              </p>
            </div>
          </motion.button>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={onCancel}
            disabled={processing}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-all disabled:opacity-50"
          >
            Cancel Booking
          </button>
          {processing && (
            <div className="flex items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing payment...
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
