/**
 * BillPreviewDialog
 * ─────────────────
 * A read-only bill preview modal for the POS. Shows the current cart
 * contents with live-updating totals. Never mutates any data.
 *
 * Features:
 *   - Displays business name, table/room, customer, date/time
 *   - Items table with qty, unit price, line total
 *   - Subtotal & Grand Total
 *   - Empty state when cart has no items
 *   - Print Bill — prints a "BILL PREVIEW" / "PROFORMA BILL" via thermal printer
 *   - Close returns to POS without side effects
 */

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { X, Printer, Receipt, ShoppingCart } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { printService } from "@/lib/services/print-service"
import type { OrderBatch } from "@/types"
import { getBillableBatches, isItemBillable } from "@/lib/services/order-calculation-service"

// ─── Types ───────────────────────────────────────────────────

interface CartLine {
  menu_item_id: string
  name: string
  quantity: number
  unit_price: number
  notes: string
  status: "pending" | "voided"
}

interface BillPreviewDialogProps {
  /** Current cart items (live state from POS) */
  cartItems: CartLine[]
  /** Previous order batches for the selected table/room */
  batches: OrderBatch[]
  /** Customer name */
  customerName: string
  /** Table/room display label (e.g. "Table 5", "Room 301") */
  tableOrRoom: string
  /** Called when dialog closes */
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────

const fmt = (amount: number) => formatCurrency(amount, 2)

// ─── Component ───────────────────────────────────────────────

export function BillPreviewDialog({
  cartItems,
  batches,
  customerName,
  tableOrRoom,
  onClose,
}: BillPreviewDialogProps) {
  const [printing, setPrinting] = useState(false)

  // ── Compute billable items from cart + previous batches ──
  const activeCartItems = useMemo(
    () => cartItems.filter(i => i.status !== "voided"),
    [cartItems],
  )

  // ── Combine all items for display ──
  const displayItems = useMemo(() => {
    const items: Array<{
      id: string
      name: string
      quantity: number
      unitPrice: number
      notes?: string
      source: "cart" | "batch"
    }> = []

    // Cart items (not yet submitted)
    for (const ci of activeCartItems) {
      items.push({
        id: `cart-${ci.menu_item_id}`,
        name: ci.name,
        quantity: ci.quantity,
        unitPrice: ci.unit_price,
        notes: ci.notes || undefined,
        source: "cart",
      })
    }

    // Previous batch items (already submitted, not yet paid)
    const billableBatches = getBillableBatches(batches)
    for (const batch of billableBatches) {
      for (const bi of batch.items) {
        if (isItemBillable(bi)) {
          items.push({
            id: bi.id,
            name: bi.name,
            quantity: bi.quantity,
            unitPrice: bi.unit_price,
            notes: bi.notes || undefined,
            source: "batch",
          })
        }
      }
    }

    return items
  }, [activeCartItems, batches])

  // ── Totals (reuse the same calculation as POS) ──
  const subtotal = useMemo(
    () => displayItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    [displayItems],
  )
  const grandTotal = subtotal // No discount in cart preview — discount happens during payment

  // ── Current date/time ──
  const now = new Date()
  const dateStr = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

  // ── Temporary order number (matches POS.tsx convention: batches.length + 1) ──
  const tempOrderNum = useMemo(() => `#${batches.length + 1}`, [batches])

  // ── Print proforma bill ──
  const handlePrint = async () => {
    setPrinting(true)
    try {
      printService.printBillPreview({
        invoiceNumber: `BILL-${tempOrderNum}`,
        date: dateStr,
        time: timeStr,
        cashierName: undefined,
        tableOrRoom,
        items: displayItems.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          notes: i.notes,
        })),
        subtotal,
        total: grandTotal,
      })
    } finally {
      setPrinting(false)
    }
  }

  // ── Empty state ──
  const isEmpty = displayItems.length === 0

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-[min(36rem,calc(100vw-2rem))] rounded-2xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Bill Preview</h3>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                {tableOrRoom}{customerName ? ` · ${customerName}` : ""}
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
          {isEmpty ? (
            /* ── Empty State ── */
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <ShoppingCart className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">Cart is empty</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add items to the cart to see the bill preview.
              </p>
            </div>
          ) : (
            <>
              {/* ── Business Header ── */}
              <div className="text-center border-b border-dashed border-border pb-3">
                <p className="text-sm font-bold text-foreground tracking-wide">
                  Highlands Cafe &amp; Motel Inn
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Birendranagar-8, Khajura · Surkhet
                </p>
              </div>

              {/* ── Order Info ── */}
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-foreground">Order {tempOrderNum}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{dateStr}</p>
                  <p>{timeStr}</p>
                </div>
              </div>

              {/* ── Items Table ── */}
              <div>
                {/* Column Header */}
                <div className="flex items-center gap-2 border-b border-border pb-1.5 mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex-1">Item</span>
                  <span className="w-10 text-right">Qty</span>
                  <span className="w-14 text-right">Price</span>
                  <span className="w-16 text-right">Total</span>
                </div>

                {/* Item Rows */}
                <div className="space-y-1.5">
                  {displayItems.map((item) => (
                    <div key={item.id}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex-1 font-medium text-foreground truncate">
                          {item.name}
                          {item.source === "cart" && (
                            <span className="ml-1.5 text-[10px] text-emerald-500 font-semibold">
                              NEW
                            </span>
                          )}
                        </span>
                        <span className="w-10 text-right text-muted-foreground tabular-nums">
                          {item.quantity}
                        </span>
                        <span className="w-14 text-right text-muted-foreground tabular-nums">
                          {fmt(item.unitPrice)}
                        </span>
                        <span className="w-16 text-right font-semibold text-foreground tabular-nums">
                          {fmt(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="pl-2 text-[11px] text-muted-foreground italic mt-0.5">
                          Note: {item.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Totals ── */}
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium tabular-nums">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-foreground border-t-2 border-border pt-2">
                  <span>Grand Total</span>
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {fmt(grandTotal)}
                  </span>
                </div>
              </div>

              {/* ── Proforma Notice ── */}
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2 text-center">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  Proforma Bill — Not a Final Invoice
                </p>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                  This is a bill preview for customer review. No payment has been processed.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Footer Actions ── */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-muted/20">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Close
          </motion.button>
          <motion.button
            whileHover={{ scale: isEmpty ? 1 : 1.02 }}
            whileTap={{ scale: isEmpty ? 1 : 0.98 }}
            onClick={handlePrint}
            disabled={isEmpty || printing}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {printing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Printing...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" />
                Print Bill
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
