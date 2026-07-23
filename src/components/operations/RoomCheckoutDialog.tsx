/**
 * RoomCheckoutDialog
 * ──────────────────
 * Full checkout workflow for occupied rooms. Launched from the RoomCard
 * "Checkout" button in the Operations page.
 *
 * Flow:
 * 1. Calculate room charges (rate × nights stayed)
 * 2. Fetch POS order batches linked to this room
 * 3. Display a clean breakdown with discount & tax
 * 4. Accept payment method selection
 * 5. Process: create invoice → record payment → clear order batches
 * 6. Update booking → checked_out, room → cleaning
 * 7. Show post-checkout dialog for room status (cleaning / available / maintenance)
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { insforge } from "@/lib/services/auth-service"
import { getNextInvoiceNumber } from "@/lib/services/sequence-service"
import { insertInvoiceItems } from "@/lib/services/invoice-items-service"
import { logActivitySafe } from "@/lib/services/activity-log-service"
import { showSuccess, showError } from "@/components/ui/toast"
import { toPaymentMethodKey } from "@/lib/payment-methods"
import { processPaymentWithRecovery } from "@/lib/services/unified-payment-service"
import { PosPaymentDialog, type PaymentResult } from "@/components/payments"
import type { Room } from "@/types"
import type { Booking } from "@/lib/services/booking-service"
import {
  X, IndianRupee, CreditCard,
  CalendarDays, Sofa, Percent, LogOut, CheckCircle,
  Sparkles, BedDouble, Wrench,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────

type PostCheckoutTarget = "cleaning" | "available" | "maintenance"

interface OrderBatchItem {
  id: string
  name: string
  quantity: number
  unit_price: number
  status: string
}

interface OrderBatch {
  id: string
  items: OrderBatchItem[]
  subtotal: number
  status: string
  paid_amount: number
}

interface ChargeLine {
  label: string
  amount: number
  icon: React.ElementType
}

// ─── Helpers ─────────────────────────────────────────────────

function calcNights(checkIn: string, checkOut: string): number {
  const from = new Date(checkIn)
  const to = new Date(checkOut)
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000))
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function RoomCheckoutDialog({
  room, booking, onClose, onComplete,
}: {
  room: Room
  booking: Booking | null
  onClose: () => void
  onComplete: () => void
}) {
  // ── State ─────────────────────────────────────────────
  const [discount, setDiscount] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPostCheckout, setShowPostCheckout] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentCompleted, setPaymentCompleted] = useState(false)
  const [orderBatches, setOrderBatches] = useState<OrderBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)

  const roomNum = room.room_number || room.number || ""
  const guestName = room.guest || booking?.guestName || "Walk-in"
  const nightlyRate = room.pricePerNight || room.price || 0
  const nights = booking?.checkIn && booking?.checkOut ? calcNights(booking.checkIn, booking.checkOut) : 1
  const roomChargeTotal = nightlyRate * nights

  // ── Fetch POS orders for this room ────────────────────
  useEffect(() => {
    let cancelled = false
    const fetchOrders = async () => {
      setBatchesLoading(true)
      try {
        const { data, error } = await insforge.database
          .from("order_batches")
          .select("id, subtotal, status, paid_amount")
          .eq("room_id", room.id)
          .in("status", ["pending", "partial"])
          .order("created_at", { ascending: false })

        if (error) throw error

        const rows = (data ?? []) as Array<{ id: string; subtotal: number; status: string; paid_amount: number }>
        const batchIds = rows.map(r => r.id)

        // Fetch items for these batches
        const itemsMap = new Map<string, OrderBatchItem[]>()
        if (batchIds.length > 0) {
          const { data: items, error: itemsError } = await insforge.database
            .from("order_batch_items")
            .select("id, name, quantity, unit_price, status, batch_id")
            .in("batch_id", batchIds)
            .not("status", "in", "(cancelled,voided)")

          if (itemsError) throw itemsError

          for (const item of (items ?? []) as Array<{ id: string; name: string; quantity: number; unit_price: number; status: string; batch_id: string }>) {
            if (!itemsMap.has(item.batch_id)) itemsMap.set(item.batch_id, [])
            itemsMap.get(item.batch_id)!.push({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              status: item.status,
            })
          }
        }

        const batches: OrderBatch[] = rows.map(r => ({
          id: r.id,
          items: itemsMap.get(r.id) ?? [],
          subtotal: Number(r.subtotal),
          status: r.status,
          paid_amount: Number(r.paid_amount),
        }))

        if (!cancelled) setOrderBatches(batches)
      } catch (err) {
        console.warn("[Checkout] Failed to fetch room orders:", err)
        if (!cancelled) setOrderBatches([])
      } finally {
        if (!cancelled) setBatchesLoading(false)
      }
    }
    fetchOrders()
    return () => { cancelled = true }
  }, [room.id])

  // ── Calculations ─────────────────────────────────────
  const posTotal = orderBatches.reduce((sum, b) => sum + b.subtotal, 0)
  const grandTotal = roomChargeTotal + posTotal
  const discountAmount = Math.min(discount, grandTotal)
  const totalAfterDiscount = grandTotal - discountAmount

  const chargeLines: ChargeLine[] = [
    ...(roomChargeTotal > 0 ? [{ label: `Room Charges (${nights} night${nights !== 1 ? "s" : ""} × ${formatCurrency(nightlyRate)})`, amount: roomChargeTotal, icon: CalendarDays as React.ElementType }] : []),
    ...(posTotal > 0 ? [{ label: `POS Orders (${orderBatches.length} batch${orderBatches.length !== 1 ? "es" : ""})`, amount: posTotal, icon: Sofa as React.ElementType }] : []),
  ]

  // ── Build invoice items for PosPaymentDialog ────────
  const invoiceItemsList = useMemo(() => {
    const items: Array<{ name: string; quantity: number; unitPrice: number }> = []
    if (roomChargeTotal > 0) {
      items.push({
        name: `Room ${roomNum} — ${nights} night${nights !== 1 ? "s" : ""}`,
        quantity: nights,
        unitPrice: nightlyRate,
      })
    }
    for (const batch of orderBatches) {
      for (const item of batch.items) {
        items.push({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
        })
      }
    }
    return items
  }, [roomChargeTotal, roomNum, nights, nightlyRate, orderBatches])

  // ── Handle payment from PosPaymentDialog ────────────
  const handlePaymentComplete = useCallback(async (paymentResult?: PaymentResult) => {
    if (!paymentResult || paymentCompleted) return
    setPaymentCompleted(true)
    setIsProcessing(true)

    const payMethod = paymentResult.paymentMethod || 'cash'
    const actualPaid = paymentResult.paidAmount ?? grandTotal

    try {
      // 1. Generate invoice number
      const invNumber = await getNextInvoiceNumber()

      // 2. Create invoice via unified payment service
      const rpcResult = await processPaymentWithRecovery({
        tableId: '',
        customerName: guestName,
        subtotal: grandTotal,
        discount: discountAmount,
        total: totalAfterDiscount,
        invoiceStatus: 'paid',
        paymentMethod: toPaymentMethodKey(payMethod),
        paidAmount: actualPaid,
        userId: null,
        paidItemIds: [],
        itemPaidStatus: 'paid',
        batchIds: orderBatches.map(b => b.id),
        orderBatchIds: orderBatches.map(b => b.id),
        notes: `Room checkout ${roomNum} via ${payMethod}`,
        sourcePage: 'room_checkout',
        bookingId: booking?.id,
        paymentReference: `CHK-${crypto.randomUUID()}`,
      })

      if (!rpcResult.success) {
        throw new Error(rpcResult.error || 'Payment processing failed')
      }

      // 3. Insert invoice items
      if (invoiceItemsList.length > 0 && rpcResult.invoiceId) {
        await insertInvoiceItems(rpcResult.invoiceId, invoiceItemsList).catch(() => {})
      }

      // 4. Update order batches to paid
      if (orderBatches.length > 0) {
        const batchIds = orderBatches.map(b => b.id)
        await insforge.database
          .from("order_batches")
          .update({ status: "paid" })
          .in("id", batchIds)

        await insforge.database
          .from("order_batch_items")
          .update({ status: "paid" })
          .in("batch_id", batchIds)
          .not("status", "in", "(cancelled,voided)")
      }

      // 5. Update booking to checked_out
      if (booking?.id) {
        await insforge.database.from("bookings").update({ status: "checked_out" }).eq("id", booking.id)
      }

      // 6. Update room to cleaning
      await insforge.database.from("rooms").update({ status: "cleaning" }).eq("id", room.id)

      // 7. Activity log
      logActivitySafe({
        activityType: "room_checked_out",
        entityId: room.id,
        entityLabel: `Room ${roomNum}`,
        status: "completed",
        amount: grandTotal,
        details: `Checkout — ${formatCurrency(grandTotal)} via ${payMethod}`,
      }).catch(() => {})

      showSuccess(`Room ${roomNum} checked out — ${formatCurrency(grandTotal)}`)
      setShowPostCheckout(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Checkout failed"
      showError(msg)
      setPaymentCompleted(false)
    } finally {
      setIsProcessing(false)
      setShowPayment(false)
    }
  }, [room, booking, orderBatches, guestName, roomNum, discountAmount, totalAfterDiscount, grandTotal, invoiceItemsList, paymentCompleted])

  // ── Post-checkout status selection ────────────────────
  const handlePostCheckout = useCallback(async (target: PostCheckoutTarget) => {
    try {
      const statusMap: Record<PostCheckoutTarget, string> = {
        cleaning: "cleaning",
        available: "vacant",
        maintenance: "maintenance",
      }
      await insforge.database
        .from("rooms")
        .update({ status: statusMap[target] })
        .eq("id", room.id)

      logActivitySafe({
        activityType: "room_status_change",
        entityId: room.id,
        entityLabel: `Room ${roomNum}`,
        status: statusMap[target],
      }).catch(() => {})

      showSuccess(`Room ${roomNum} → ${target}`)
      onComplete()
      onClose()
    } catch (err) {
      showError((err as Error)?.message || "Failed to update room status")
    }
  }, [room, roomNum, onComplete, onClose])

  // ── Render ───────────────────────────────────────────

  const postCheckoutCards: { target: PostCheckoutTarget; label: string; desc: string; icon: React.ElementType; color: string; border: string; bg: string }[] = [
    { target: "cleaning", label: "Send to Housekeeping", desc: "Room needs cleaning before next guest", icon: Sparkles, color: "text-cyan-600", border: "border-cyan-200 dark:border-cyan-800/40", bg: "bg-cyan-50/50 dark:bg-cyan-950/10 hover:bg-cyan-100/50 dark:hover:bg-cyan-950/30" },
    { target: "available", label: "Mark Available", desc: "Room ready for next guest immediately", icon: BedDouble, color: "text-emerald-600", border: "border-emerald-200 dark:border-emerald-800/40", bg: "bg-emerald-50/50 dark:bg-emerald-950/10 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/30" },
    { target: "maintenance", label: "Send to Maintenance", desc: "Room needs repairs or inspection", icon: Wrench, color: "text-orange-600", border: "border-orange-200 dark:border-orange-800/40", bg: "bg-orange-50/50 dark:bg-orange-950/10 hover:bg-orange-100/50 dark:hover:bg-orange-950/30" },
  ]

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatePresence mode="wait">
          {showPostCheckout ? (
            /* ── POST-CHECKOUT: Where should this room go? ── */
            <motion.div
              key="postcheckout"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6"
            >
              <div className="text-center mb-6">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Checkout Complete</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Room {roomNum} — {guestName}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {formatCurrency(totalAfterDiscount)} — Payment processed
                </p>
                <p className="text-xs text-muted-foreground/50 mt-0.5">
                  Invoice processed. Where should this room go?
                </p>
              </div>

              <div className="space-y-2.5">
                {postCheckoutCards.map(card => (
                  <motion.button
                    key={card.target}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePostCheckout(card.target)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all active:scale-[0.98]",
                      card.border, card.bg,
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-gray-900 shadow-sm">
                        <card.icon className={cn("h-4 w-4", card.color)} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{card.label}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{card.desc}</p>
                      </div>
                    </div>
                    <div className="h-5 w-5 rounded-full border-2 border-current opacity-30 shrink-0" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            /* ── CHECKOUT FORM ── */
            <motion.div
              key="checkout"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Room Checkout</h3>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {roomNum} — {room.type || room.room_types?.name || ""} · {guestName}
                  </p>
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

              <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Charge Breakdown */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                    Charges
                  </h4>
                  <div className="space-y-1.5">
                    {chargeLines.map((line, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <line.icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                          {line.label}
                        </span>
                        <span className="font-medium tabular-nums">{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                    {chargeLines.length === 0 && !batchesLoading && (
                      <p className="text-xs text-muted-foreground/50 italic">No charges calculated</p>
                    )}
                    {batchesLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/60" />
                        Loading orders...
                      </div>
                    )}
                  </div>
                </div>

                {/* Discount Input */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">
                    Discount
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                    <input
                      type="number"
                      min={0}
                      max={grandTotal}
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, Math.min(grandTotal, parseInt(e.target.value) || 0)))}
                      className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:shadow-[0_0_0_3px] focus:shadow-primary/5"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Totals */}
                <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
                      <span className="flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        Discount
                      </span>
                      <span className="tabular-nums">−{formatCurrency(discountAmount)}</span>
                    </div>
                  )}

                  <div className="border-t border-border pt-1.5 mt-1.5 flex items-center justify-between text-sm font-bold text-foreground">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(totalAfterDiscount)}</span>
                  </div>
                </div>

                {/* Payment — launch the global payment dialog */}
                <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Pay with Global Payment</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        Cash, Reception QR, FonePay, or Credit Account
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/20">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  disabled={isProcessing}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-all disabled:opacity-50"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowPayment(true)}
                  disabled={isProcessing || totalAfterDiscount <= 0}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all active:scale-95",
                    isProcessing
                      ? "bg-muted-foreground/50 cursor-not-allowed"
                      : "bg-primary hover:bg-primary/90",
                  )}
                >
                  {isProcessing ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <LogOut className="h-4 w-4" />
                      Complete Checkout — {formatCurrency(totalAfterDiscount)}
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>

      {/* ═══ POS PAYMENT DIALOG ═══ */}
      {showPayment && (
        <PosPaymentDialog
          orderId={`checkout-${room.id}-${Date.now()}`}
          unpaidItems={(() => {
            const items: Array<{
              id: string; item_name: string; quantity: number; unit_price: number; payment_status: string
            }> = []
            if (roomChargeTotal > 0) {
              items.push({
                id: `room-charge-${room.id}`,
                item_name: `Room ${roomNum} — ${nights} night${nights !== 1 ? "s" : ""}`,
                quantity: nights,
                unit_price: nightlyRate,
                payment_status: 'pending',
              })
            }
            for (const batch of orderBatches) {
              for (const item of batch.items) {
                if (item.status !== 'cancelled' && item.status !== 'voided') {
                  items.push({
                    id: item.id,
                    item_name: item.name,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    payment_status: 'pending',
                  })
                }
              }
            }
            return items
          })()}
          customerName={guestName}
          selectedTableId={room.id}
          isRoomPayment={true}
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
        />
      )}
    </>
  )
}


