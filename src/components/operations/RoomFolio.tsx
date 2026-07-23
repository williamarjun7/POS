/**
 * RoomFolio
 * ─────────
 * Running account for an active booking during a guest's stay.
 *
 * Features:
 * - Guest info & stay summary (check-in/out, nights, rate)
 * - Room charges (rate × nights)
 * - POS order line items (food, drinks, hookah, etc.)
 * - Discounts
 * - Previous payments / deposits
 * - Outstanding balance
 * - "Open POS" button to navigate to POS with this room pre-selected
 * - "Checkout" button to settle the folio
 */

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { insforge } from "@/lib/services/auth-service"
import { useNavigate } from "react-router-dom"
import { showSuccess, showError } from "@/components/ui/toast"
import { DialogButton } from "@/components/ui/ButtonVariants"
import { formatCurrency } from "@/lib/utils"
import type { Room, Booking } from "@/types"
import {
  X, CalendarDays, Sofa, Percent, Wallet, LogOut,
  Coffee, Egg, UtensilsCrossed, Wine, Receipt,
  IndianRupee, ShoppingCart, BedDouble, Clock,
  Banknote, CreditCard,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────

interface FolioOrderItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  status: string
  batchId: string
}

interface FolioOrderBatch {
  id: string
  items: FolioOrderItem[]
  subtotal: number
  status: string
  paidAmount: number
  createdAt: string
}

interface RoomFolioProps {
  room: Room
  booking: Booking | null
  onClose: () => void
  onCheckout: (room: Room, booking: Booking | null) => void
}

// ─── Helpers ─────────────────────────────────────────────────

function calcNights(checkIn: string, checkOut: string): number {
  const from = new Date(checkIn)
  const to = new Date(checkOut)
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000))
}

// ─── Category icon for POS items ────────────────────────────

function getItemIcon(name: string): React.ElementType {
  const lower = name.toLowerCase()
  if (lower.includes("coffee") || lower.includes("tea") || lower.includes("juice") || lower.includes("shake") || lower.includes("smoothie")) return Coffee
  if (lower.includes("egg") || lower.includes("breakfast")) return Egg
  if (lower.includes("wine") || lower.includes("beer") || lower.includes("alcohol") || lower.includes("whiskey") || lower.includes("vodka")) return Wine
  return UtensilsCrossed
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function RoomFolio({ room, booking, onClose, onCheckout }: RoomFolioProps) {
  const navigate = useNavigate()

  // ── State ─────────────────────────────────────────────
  const [folioBatches, setFolioBatches] = useState<FolioOrderBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [folioDiscount, setFolioDiscount] = useState(0)

  const roomNum = room.room_number || room.number || ""
  const roomTypeName = room.room_types?.name || room.type || ""
  const guestName = room.guest || booking?.guestName || "Walk-in"
  const nightlyRate = room.pricePerNight || room.price || 0

  const bookingCheckIn = booking?.checkIn || room.checkIn || ""
  const bookingCheckOut = booking?.checkOut || room.checkOut || ""
  const nights = bookingCheckIn && bookingCheckOut
    ? calcNights(bookingCheckIn, bookingCheckOut)
    : 1

  const roomChargeTotal = nightlyRate * nights

  // ── Fetch POS orders for this room ────────────────────
  useEffect(() => {
    let cancelled = false
    const fetchOrders = async () => {
      setBatchesLoading(true)
      try {
        const { data, error } = await insforge.database
          .from("order_batches")
          .select("id, subtotal, status, paid_amount, created_at")
          .eq("room_id", room.id)
          .in("status", ["pending", "partial"])
          .order("created_at", { ascending: true })

        if (error) throw error

        const rows = (data ?? []) as Array<{
          id: string; subtotal: number; status: string; paid_amount: number; created_at: string
        }>
        const batchIds = rows.map(r => r.id)

        // Fetch items for these batches
        const itemsMap = new Map<string, FolioOrderItem[]>()
        if (batchIds.length > 0) {
          const { data: items, error: itemsError } = await insforge.database
            .from("order_batch_items")
            .select("id, name, quantity, unit_price, status, batch_id")
            .in("batch_id", batchIds)
            .not("status", "in", "(cancelled,voided)")

          if (itemsError) throw itemsError

          for (const item of (items ?? []) as Array<{
            id: string; name: string; quantity: number; unit_price: number; status: string; batch_id: string
          }>) {
            if (!itemsMap.has(item.batch_id)) itemsMap.set(item.batch_id, [])
            itemsMap.get(item.batch_id)!.push({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              unitPrice: Number(item.unit_price),
              status: item.status,
              batchId: item.batch_id,
            })
          }
        }

        const batches: FolioOrderBatch[] = rows.map(r => ({
          id: r.id,
          items: itemsMap.get(r.id) ?? [],
          subtotal: Number(r.subtotal),
          status: r.status,
          paidAmount: Number(r.paid_amount),
          createdAt: r.created_at,
        }))

        if (!cancelled) setFolioBatches(batches)
      } catch (err) {
        console.warn("[Folio] Failed to fetch room orders:", err)
        if (!cancelled) setFolioBatches([])
      } finally {
        if (!cancelled) setBatchesLoading(false)
      }
    }
    fetchOrders()
    return () => { cancelled = true }
  }, [room.id])

  // ── Calculations ─────────────────────────────────────
  const posTotal = folioBatches.reduce((sum, b) => sum + b.subtotal, 0)
  const totalItemCount = folioBatches.reduce((count, b) =>
    count + b.items.reduce((s, i) => s + i.quantity, 0), 0
  )

  const grandTotal = roomChargeTotal + posTotal
  const discountAmount = Math.min(folioDiscount, grandTotal)
  const totalAfterDiscount = grandTotal - discountAmount

  const previousPayments = booking?.paidAmount || 0
  const outstandingBalance = Math.max(0, totalAfterDiscount - previousPayments)

  // ── Handlers ─────────────────────────────────────────
  const handleOpenPos = useCallback(() => {
    navigate(`/pos?room=${room.id}`)
    onClose()
  }, [navigate, room.id, onClose])

  const handleCheckout = useCallback(() => {
    onCheckout(room, booking)
  }, [room, booking, onCheckout])

  // ── Render ───────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Room Folio</h3>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Room {roomNum} — {roomTypeName} · {guestName}
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
          {/* ── Stay Summary ── */}
          <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {nights} Night{nights !== 1 ? "s" : ""} Stay
              </p>
              {bookingCheckIn && bookingCheckOut && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {new Date(bookingCheckIn).toLocaleDateString("en-US", {
                    month: "short", day: "numeric",
                  })} → {new Date(bookingCheckOut).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold tabular-nums">{formatCurrency(nightlyRate)}</p>
              <p className="text-[10px] text-muted-foreground/60">/ night</p>
            </div>
          </div>

          {/* ── Room Charges ── */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 flex items-center gap-1.5">
              <BedDouble className="h-3 w-3" />
              Room Charges
            </h4>
            <div className="flex items-center justify-between text-sm py-1.5">
              <span className="text-muted-foreground">
                Room {roomNum} — {nights} night{nights !== 1 ? "s" : ""} × {formatCurrency(nightlyRate)}
              </span>
              <span className="font-medium tabular-nums">{formatCurrency(roomChargeTotal)}</span>
            </div>
          </div>

          {/* ── POS Orders ── */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 flex items-center gap-1.5">
              <ShoppingCart className="h-3 w-3" />
              POS Orders {folioBatches.length > 0 && (
                <span className="text-[10px] font-normal text-muted-foreground/40">
                  ({folioBatches.length} batch{folioBatches.length !== 1 ? "es" : ""} · {totalItemCount} item{totalItemCount !== 1 ? "s" : ""})
                </span>
              )}
            </h4>
            <div className="space-y-1">
              {batchesLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground/60 py-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/60" />
                  Loading orders...
                </div>
              )}
              {!batchesLoading && folioBatches.length === 0 && (
                <p className="text-xs text-muted-foreground/40 italic py-1">
                  No POS orders yet. Use the "Open POS" button to charge items to this room.
                </p>
              )}
              {!batchesLoading && folioBatches.map((batch, bIdx) => (
                <div key={batch.id} className="rounded-lg border border-border/60 p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground/50">
                    <span>Order #{bIdx + 1}</span>
                    <span>{new Date(batch.createdAt).toLocaleTimeString("en-US", {
                      hour: "2-digit", minute: "2-digit",
                    })}</span>
                  </div>
                  {batch.items.map(item => {
                    const ItemIcon = getItemIcon(item.name)
                    return (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                          <ItemIcon className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                          <span className="truncate">{item.name}</span>
                          <span className="text-xs text-muted-foreground/40 shrink-0">×{item.quantity}</span>
                        </span>
                        <span className="tabular-nums shrink-0 ml-2">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ── Discount Input ── */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">
              Discount (for checkout)
            </label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                type="number"
                min={0}
                max={grandTotal}
                value={folioDiscount}
                onChange={(e) => setFolioDiscount(Math.max(0, Math.min(grandTotal, parseInt(e.target.value) || 0)))}
                className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:shadow-[0_0_0_3px] focus:shadow-primary/5"
                placeholder="0"
              />
            </div>
          </div>

          {/* ── Totals ── */}
          <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground/70">
              <span>Subtotal (room + POS)</span>
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

            {previousPayments > 0 && (
              <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 pt-1 border-t border-border/50">
                <span className="flex items-center gap-1">
                  <Banknote className="h-3 w-3" />
                  Previous Payments
                </span>
                <span className="tabular-nums">−{formatCurrency(previousPayments)}</span>
              </div>
            )}

            <div className="border-t border-border pt-1.5 mt-1.5 space-y-1">
              <div className="flex items-center justify-between text-sm font-bold text-foreground">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
              </div>
              {previousPayments > 0 && (
                <div className="flex items-center justify-between text-sm font-bold text-amber-600 dark:text-amber-400">
                  <span className="flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" />
                    Outstanding
                  </span>
                  <span className="tabular-nums">{formatCurrency(outstandingBalance)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer Actions ── */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border bg-muted/20">
          <DialogButton
            label="Open POS"
            onClick={handleOpenPos}
            variant="secondary"
            icon={Sofa}
            className="flex-1 text-foreground"
          />
          <DialogButton
            label={`Checkout — ${formatCurrency(outstandingBalance || totalAfterDiscount)}`}
            onClick={handleCheckout}
            disabled={totalAfterDiscount <= 0}
            icon={LogOut}
            className="flex-1"
          />
        </div>
      </motion.div>
    </div>
  )
}
