/**
 * BillPreview — Receipt-style bill preview modal
 * ──────────────────────────────────────────────
 *
 * Displays a customer's invoice as a printed receipt would look,
 * matching the thermal printer layout as closely as possible.
 *
 * Features:
 *   - Business logo + info header
 *   - Invoice details (number, date, time, table, cashier)
 *   - Items table with qty × price
 *   - Subtotal, discount, grand total
 *   - Payment method breakdown
 *   - QR codes (if enabled)
 *   - Reprint action
 *   - Close action
 */

import { useState } from "react"
import { motion } from "framer-motion"
import {
  X, Printer, RotateCcw,
  Phone, MapPin, FileText,
  Download, Share2,
} from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import type { CustomerVisit } from "./VisitHistory"
import type { PaymentMethod } from "@/types"

/* ─── Props ────────────────────────────────────────────────── */

interface BillPreviewProps {
  visit: CustomerVisit
  onClose: () => void
  onReprint?: (visit: CustomerVisit) => void
}

/* ─── Business info (from settings or hardcoded) ──────────── */

const BUSINESS_NAME = "Highlands Cafe & Motel Inn"
const BUSINESS_ADDRESS = ["Birendranagar-8, Khajura", "Surkhet, Nepal"]
const BUSINESS_PHONE = "9748522157"
const BUSINESS_PAN = "618163534"

/* ─── Receipt Line Component ──────────────────────────────── */

function ReceiptDivider({ label }: { label?: string }) {
  if (label) {
    return (
      <div className="flex items-center gap-2 my-3">
        <div className="flex-1 border-t border-dashed border-border/60" />
        <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">{label}</span>
        <div className="flex-1 border-t border-dashed border-border/60" />
      </div>
    )
  }
  return <div className="border-t border-dashed border-border/40 my-2" />
}

function ReceiptLine({ label, value, bold, large }: { label: string; value: string; bold?: boolean; large?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={cn(
        "text-muted-foreground",
        large ? "text-xs" : "text-[10px]",
        bold && "font-semibold"
      )}>
        {label}
      </span>
      <span className={cn(
        "text-foreground text-right shrink-0 tabular-nums",
        large ? "text-sm font-bold" : "text-xs",
        bold && "font-semibold"
      )}>
        {value}
      </span>
    </div>
  )
}

/* ─── Component ────────────────────────────────────────────── */

export function BillPreview({ visit, onClose, onReprint }: BillPreviewProps) {
  const [printing, setPrinting] = useState(false)
  const now = new Date(visit.date)
  const dateStr = now.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  })
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  })

  const handleReprint = () => {
    setPrinting(true)
    // In production, this calls printService.printInvoice()
    setTimeout(() => setPrinting(false), 1000)
    onReprint?.(visit)
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[min(26rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl"
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Bill Preview</span>
          </div>
          <div className="flex items-center gap-1.5">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleReprint}
              disabled={printing}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {printing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              Reprint
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </motion.button>
          </div>
        </div>

        {/* ── Receipt Body ── */}
        <div className="px-5 py-5 space-y-4 font-mono">
          {/* Business Header */}
          <div className="text-center">
            <h2 className="text-sm font-bold text-foreground tracking-tight">{BUSINESS_NAME}</h2>
            {BUSINESS_ADDRESS.map((line, i) => (
              <p key={i} className="text-[10px] text-muted-foreground">{line}</p>
            ))}
            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {BUSINESS_PHONE}
              </span>
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                PAN: {BUSINESS_PAN}
              </span>
            </div>
          </div>

          <ReceiptDivider />

          {/* Invoice Header */}
          <div className="text-center">
            <p className="text-xs font-bold text-foreground">INVOICE</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{visit.invoiceNumber}</p>
          </div>

          <ReceiptDivider />

          {/* Details */}
          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="text-foreground font-semibold">{dateStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time</span>
              <span className="text-foreground font-semibold">{timeStr}</span>
            </div>
            {visit.tableOrRoom && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Table</span>
                <span className="text-foreground font-semibold">{visit.tableOrRoom}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Type</span>
              <span className="text-foreground font-semibold">
                {visit.orderType === "dine_in" ? "Dine In" :
                 visit.orderType === "takeaway" ? "Takeaway" :
                 visit.orderType === "room_service" ? "Room Service" : "—"}
              </span>
            </div>
            {visit.cashier && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cashier</span>
                <span className="text-foreground font-semibold">{visit.cashier}</span>
              </div>
            )}
          </div>

          <ReceiptDivider label="items" />

          {/* Items */}
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between text-[9px] text-muted-foreground font-semibold uppercase tracking-wider pb-1 border-b border-border/30">
              <div className="flex items-center gap-2 flex-1">
                <span className="w-5 text-right">Qty</span>
                <span>Item</span>
              </div>
              <span className="shrink-0">Amount</span>
            </div>

            {visit.items.map((item, idx) => (
              <div key={idx}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0 tabular-nums">
                      ×{item.quantity}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] text-foreground font-medium truncate">{item.name}</p>
                      {item.notes && (
                        <p className="text-[9px] text-muted-foreground/60 italic truncate">({item.notes})</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-foreground font-semibold shrink-0 tabular-nums">
                    {formatCurrency(item.totalPrice)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <ReceiptDivider />

          {/* Totals */}
          <div className="space-y-1.5">
            <ReceiptLine label="Subtotal" value={formatCurrency(visit.subtotal)} />
            {visit.discount > 0 && (
              <ReceiptLine label="Discount" value={`-${formatCurrency(visit.discount)}`} bold />
            )}
            <div className="border-t border-border/40 pt-1.5 mt-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Grand Total</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(visit.total)}</span>
              </div>
            </div>

            {/* Payment methods */}
            <div className="border-t border-border/40 pt-2 mt-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Payment
              </p>
              {visit.paymentMethods.map((pm, idx) => (
                <div key={idx} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "flex h-1.5 w-1.5 rounded-full",
                      pm.method === 'cash' ? "bg-emerald-500" :
                      pm.method === 'fonepay' ? "bg-blue-500" :
                      pm.method === 'credit' ? "bg-amber-400" :
                      pm.method === 'reception_qr' ? "bg-sky-500" :
                      "bg-muted-foreground"
                    )} />
                    <span className={cn(
                      "text-[10px]",
                      pm.method === 'credit' ? "text-amber-600 font-medium" : "text-muted-foreground"
                    )}>
                      {pm.method === 'credit' ? 'Credit (Outstanding)' : getPaymentMethodLabel(pm.method)}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold tabular-nums",
                    pm.method === 'credit' ? "text-amber-600" : "text-foreground"
                  )}>
                    {formatCurrency(pm.amount)}
                  </span>
                </div>
              ))}
            </div>

            {/* Outstanding warning */}
            {visit.outstandingAmount > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 px-3 py-2 text-center">
                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  Outstanding: {formatCurrency(visit.outstandingAmount)}
                </p>
                <p className="text-[9px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">
                  This amount is due on credit
                </p>
              </div>
            )}
          </div>

          <ReceiptDivider />

          {/* Footer */}
          <div className="text-center space-y-1">
            <p className="text-[10px] font-semibold text-foreground">Thank you for visiting!</p>
            <p className="text-[9px] text-muted-foreground">{BUSINESS_NAME}</p>
            <p className="text-[9px] text-muted-foreground mt-2">
              Invoice generated electronically — no signature required
            </p>
          </div>
        </div>

        {/* ── Footer Actions ── */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-card/80 backdrop-blur-sm px-5 py-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Close
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleReprint}
            disabled={printing}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {printing ? "Printing..." : "Reprint Bill"}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}


