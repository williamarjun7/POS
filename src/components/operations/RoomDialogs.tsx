import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { insforge } from "@/lib/services/auth-service"
import { formatCurrency } from "@/lib/utils"
import { DialogButton } from "@/components/ui/ButtonVariants"
import type { Room } from "@/types"
import type { Booking } from "@/lib/services/booking-service"
import {
  X, CalendarDays, CalendarRange, Clock, ArrowRightFromLine,
  BedDouble, History, User, IndianRupee, Search,
  Hotel, CheckCircle,
} from "lucide-react"

// ═══════════════════════════════════════════════════════════════
//  EXTEND STAY MODAL
// ═══════════════════════════════════════════════════════════════

export function ExtendStayModal({
  room, booking, onClose, onExtended,
}: {
  room: Room; booking: Booking | null; onClose: () => void; onExtended?: () => void
}) {
  const nightlyRate = room.pricePerNight || room.price || 0
  const originalCheckOut = booking?.checkOut
    ? new Date(booking.checkOut).toISOString().split("T")[0]
    : new Date(Date.now() + 86400000).toISOString().split("T")[0]

  const [newCheckOut, setNewCheckOut] = useState(originalCheckOut)
  const [saving, setSaving] = useState(false)

  const originalEnd = new Date(originalCheckOut)
  const newEnd = new Date(newCheckOut)
  const extraNights = Math.max(0, Math.round((newEnd.getTime() - originalEnd.getTime()) / 86400000))
  const extraCost = extraNights * nightlyRate

  const handleExtend = async () => {
    if (extraNights <= 0 || !booking?.id) return
    setSaving(true)
    try {
      await insforge.database
        .from("bookings")
        .update({
          check_out: newCheckOut,
          total_amount: (booking.totalAmount || 0) + extraCost,
        } as any)
        .eq("id", booking.id)

      showSuccess(`Stay extended by ${extraNights} night${extraNights !== 1 ? "s" : ""} — new checkout: ${new Date(newCheckOut).toLocaleDateString()}`)
      onExtended?.()
      onClose()
    } catch (err) {
      showError((err as Error)?.message || "Failed to extend stay")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-2xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
          <div>
            <h3 className="text-base font-semibold text-foreground">Extend Stay</h3>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Room {room.room_number || room.number} — {booking?.guestName || room.guest}
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

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl bg-muted/40 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Check-out</span>
              <span className="font-semibold">{new Date(originalCheckOut).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>
            <div className="flex items-center gap-2 text-primary/60">
              <ArrowRightFromLine className="h-4 w-4" />
              <div className="flex-1 border-t border-dashed border-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">New Check-out Date</label>
              <input
                type="date"
                value={newCheckOut}
                min={originalCheckOut}
                onChange={(e) => setNewCheckOut(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:shadow-[0_0_0_3px] focus:shadow-primary/5"
              />
            </div>
          </div>

          {extraNights > 0 && (
            <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Extra Nights</span>
                <span className="font-semibold">{extraNights} night{extraNights !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Rate</span>
                <span className="font-semibold">{formatCurrency(nightlyRate)} / night</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-primary/10 pt-2">
                <span className="font-medium">Additional Charge</span>
                <span className="text-lg font-bold text-foreground">{formatCurrency(extraCost)}</span>
              </div>
            </div>
          )}

          {extraNights === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center py-2">
              Select a later check-out date to extend the stay
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/50 bg-muted/20">
          <DialogButton label="Cancel" onClick={onClose} variant="secondary" disabled={saving} />
          <DialogButton
            label="Extend Stay"
            onClick={handleExtend}
            disabled={saving || extraNights <= 0}
            loading={saving}
            loadingText="Extending..."
            icon={Clock}
          />
        </div>
      </motion.div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  ROOM HISTORY DIALOG
// ═══════════════════════════════════════════════════════════════

interface BookingRecord {
  id: string
  guestName: string
  guestPhone?: string
  checkIn: string
  checkOut: string
  totalAmount: number
  status: string
  paymentStatus?: string
  createdAt: string
}

export function RoomHistoryDialog({
  room, onClose,
}: {
  room: Room; onClose: () => void
}) {
  const [bookings, setBookings] = useState<BookingRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const roomNum = room.room_number || room.number || ""

  // Fetch booking history
  useEffect(() => {
    let cancelled = false
    const fetchHistory = async () => {
      try {
        const { data, error } = await insforge.database
          .from("bookings")
          .select("*")
          .eq("room_id", room.id)
          .order("created_at", { ascending: false })
          .limit(20)

        if (error) throw error

        if (!cancelled) {
          setBookings((data ?? []).map((row: any) => ({
            id: row.id,
            guestName: row.guest_name || row.customer_name || "Unknown",
            guestPhone: row.guest_phone || "",
            checkIn: row.check_in,
            checkOut: row.check_out,
            totalAmount: Number(row.total_amount || 0),
            status: row.status || "unknown",
            paymentStatus: row.payment_status,
            createdAt: row.created_at,
          })))
        }
      } catch (err) {
        console.warn("[RoomHistory] Failed to fetch:", err)
        if (!cancelled) setBookings([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchHistory()
    return () => { cancelled = true }
  }, [room.id])

  const statusColors: Record<string, string> = {
    confirmed: "text-blue-600 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-300",
    checked_in: "text-green-600 bg-green-50 dark:bg-green-950/20 dark:text-green-300",
    checked_out: "text-gray-500 bg-gray-50 dark:bg-gray-800/30 dark:text-gray-400",
    cancelled: "text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-300",
    archived: "text-muted-foreground bg-muted",
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-[min(32rem,calc(100vw-2rem))] rounded-2xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <History className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Room History</h3>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Room {roomNum} — {room.room_types?.name || room.type || ""}
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

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <p className="text-xs text-muted-foreground/60">Loading history...</p>
            </div>
          ) : bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">{b.guestName}</span>
                      <span className={cn(
                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0",
                        statusColors[b.status] ?? "text-muted-foreground bg-muted",
                      )}>
                        {b.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground/70">
                      <span>{new Date(b.checkIn).toLocaleDateString()} → {new Date(b.checkOut).toLocaleDateString()}</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="font-medium">{formatCurrency(b.totalAmount)}</span>
                      {b.paymentStatus && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="capitalize">{b.paymentStatus}</span>
                        </>
                      )}
                    </div>
                    {b.guestPhone && (
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{b.guestPhone}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                <History className="h-6 w-6 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-foreground">No booking history</p>
              <p className="text-xs text-muted-foreground/50 mt-1">This room has no past bookings</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-border/50">
          <DialogButton label="Close" onClick={onClose} variant="secondary" />
        </div>
      </motion.div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  TRANSFER ROOM DIALOG
// ═══════════════════════════════════════════════════════════════

export function TransferRoomDialog({
  room, booking, rooms, onClose, onTransferred,
}: {
  room: Room; booking: Booking | null; rooms: Room[]; onClose: () => void; onTransferred?: () => void
}) {
  const [selectedRoomId, setSelectedRoomId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [saving, setSaving] = useState(false)

  const availableRooms = useMemo(() =>
    rooms.filter(r =>
      r.id !== room.id &&
      (r.status === "vacant" || r.status === "available") &&
      (r.room_number || r.number || "").toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [rooms, room.id, searchQuery],
  )

  const selectedRoom = rooms.find(r => r.id === selectedRoomId)

  const handleTransfer = async () => {
    if (!selectedRoomId || !booking?.id) return
    setSaving(true)
    try {
      // Update booking to new room
      await insforge.database
        .from("bookings")
        .update({ room_id: selectedRoomId } as any)
        .eq("id", booking.id)

      // Free old room
      await insforge.database
        .from("rooms")
        .update({ status: "vacant", guest: null } as any)
        .eq("id", room.id)

      // Occupy new room
      await insforge.database
        .from("rooms")
        .update({ status: "occupied", guest: booking.guestName || room.guest } as any)
        .eq("id", selectedRoomId)

      showSuccess(`Guest transferred to Room ${selectedRoom?.room_number || selectedRoom?.number}`)
      onTransferred?.()
      onClose()
    } catch (err) {
      showError((err as Error)?.message || "Failed to transfer room")
    } finally {
      setSaving(false)
    }
  }

  const roomNum = room.room_number || room.number || ""
  const guestName = booking?.guestName || room.guest || "Guest"

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-2xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
          <div>
            <h3 className="text-base font-semibold text-foreground">Transfer Room</h3>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {guestName} from Room {roomNum}
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

        <div className="px-5 py-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="text"
              placeholder="Search available rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:shadow-[0_0_0_3px] focus:shadow-primary/5 placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Room List */}
          <div className="max-h-52 overflow-y-auto space-y-1.5 -mx-1 px-1">
            {availableRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Hotel className="h-6 w-6 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground/60">No available rooms found</p>
              </div>
            ) : (
              availableRooms.map((r) => (
                <motion.button
                  key={r.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedRoomId(r.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                    selectedRoomId === r.id
                      ? "border-primary/50 bg-primary/5 shadow-sm"
                      : "border-border/60 hover:border-foreground/20 hover:bg-muted/30",
                  )}
                >
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    selectedRoomId === r.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}>
                    <BedDouble className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{r.room_number || r.number}</p>
                    <p className="text-xs text-muted-foreground/60">{r.room_types?.name || r.type || ""}</p>
                  </div>
                  {selectedRoomId === r.id && (
                    <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                  )}
                </motion.button>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/50 bg-muted/20">
          <DialogButton label="Cancel" onClick={onClose} variant="secondary" disabled={saving} />
          <DialogButton
            label={`Transfer to ${selectedRoom?.room_number || selectedRoom?.number || "Room"}`}
            onClick={handleTransfer}
            disabled={saving || !selectedRoomId}
            loading={saving}
            loadingText="Transferring..."
            icon={ArrowRightFromLine}
          />
        </div>
      </motion.div>
    </div>
  )
}
