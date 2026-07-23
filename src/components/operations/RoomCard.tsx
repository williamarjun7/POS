import { useState, useRef } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { cn } from "@/lib/utils"
import { SmartDropdown } from "@/components/ui/SmartDropdown"
import { QuickActionButton } from "./shared"
import { SmallButton } from "@/components/ui/ButtonVariants"
import type { Room, RoomStatus, HousekeepingTask, MaintenanceRequest } from "@/types"
import {
  Calendar, Sparkles, Wrench,
  CheckCheck,
  MoreHorizontal, ArrowRightFromLine,
  Eye, Edit, History, PowerOff,
  Hotel, Clock, Sofa, LogOut, XCircle, Printer, Receipt,
  IndianRupee, CalendarDays, Moon, Sun,
} from "lucide-react"

// ── Animation Variants ───────────────────────────────────────

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
}

// ── Helpers ──────────────────────────────────────────────────

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "\u2014"
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ── Status config with gradient colors ───────────────────────

const STATUS_CFG: Record<string, {
  label: string; dot: string; bg: string; text: string; border: string;
  gradient: string; glow: string; icon: React.ElementType
}> = {
  occupied: {
    label: "Occupied", dot: "bg-primary",
    bg: "bg-gradient-to-br from-primary/[0.08] to-primary/[0.02]",
    text: "text-primary", border: "border-primary/25",
    gradient: "from-primary/20 via-primary/10 to-transparent",
    glow: "shadow-primary/5", icon: Moon,
  },
  vacant: {
    label: "Available", dot: "bg-emerald-500",
    bg: "bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02]",
    text: "text-emerald-600", border: "border-emerald-500/25",
    gradient: "from-emerald-500/20 via-emerald-500/10 to-transparent",
    glow: "shadow-emerald-500/5", icon: Sun,
  },
  available: {
    label: "Available", dot: "bg-emerald-500",
    bg: "bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02]",
    text: "text-emerald-600", border: "border-emerald-500/25",
    gradient: "from-emerald-500/20 via-emerald-500/10 to-transparent",
    glow: "shadow-emerald-500/5", icon: Sun,
  },
  reserved: {
    label: "Reserved", dot: "bg-amber-500",
    bg: "bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.02]",
    text: "text-amber-600", border: "border-amber-500/25",
    gradient: "from-amber-500/20 via-amber-500/10 to-transparent",
    glow: "shadow-amber-500/5", icon: Calendar,
  },
  cleaning: {
    label: "Cleaning", dot: "bg-cyan-500",
    bg: "bg-gradient-to-br from-cyan-500/[0.08] to-cyan-500/[0.02]",
    text: "text-cyan-600", border: "border-cyan-500/25",
    gradient: "from-cyan-500/20 via-cyan-500/10 to-transparent",
    glow: "shadow-cyan-500/5", icon: Sparkles,
  },
  dirty: {
    label: "Dirty", dot: "bg-amber-500",
    bg: "bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.02]",
    text: "text-amber-600", border: "border-amber-500/25",
    gradient: "from-amber-500/20 via-amber-500/10 to-transparent",
    glow: "shadow-amber-500/5", icon: Sparkles,
  },
  maintenance: {
    label: "Maintenance", dot: "bg-orange-500",
    bg: "bg-gradient-to-br from-orange-500/[0.08] to-orange-500/[0.02]",
    text: "text-orange-600", border: "border-orange-500/25",
    gradient: "from-orange-500/20 via-orange-500/10 to-transparent",
    glow: "shadow-orange-500/5", icon: Wrench,
  },
  out_of_order: {
    label: "Disabled", dot: "bg-red-500",
    bg: "bg-gradient-to-br from-red-500/[0.08] to-red-500/[0.02]",
    text: "text-red-600", border: "border-red-500/25",
    gradient: "from-red-500/20 via-red-500/10 to-transparent",
    glow: "shadow-red-500/5", icon: PowerOff,
  },
}

function getCfg(status: string) {
  return STATUS_CFG[status] ?? {
    label: status.replace(/_/g, " "), dot: "bg-gray-400",
    bg: "bg-muted/30", text: "text-muted-foreground",
    border: "border-border", gradient: "from-muted/20 via-transparent to-transparent",
    glow: "", icon: Sun,
  }
}

// ── Status Badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const c = getCfg(status)
  const Icon = c.icon
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
        c.bg, c.text, c.border,
      )}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </motion.span>
  )
}

// ── Guest Avatar ─────────────────────────────────────────────

function GuestAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = name.charAt(0).toUpperCase()
  const colors = [
    "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300",
    "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300",
    "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300",
    "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
    "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
    "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300",
  ]
  const colorIndex = name.length % colors.length
  const dims = size === "md" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs"
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
      className={cn(
        "flex items-center justify-center rounded-xl font-bold shrink-0 shadow-sm",
        dims, colors[colorIndex],
      )}
    >
      <span>{initial}</span>
    </motion.div>
  )
}

// ── Mini Stat Chip ───────────────────────────────────────────

function StatChip({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string; color?: string
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
      "bg-background/60 border-border/50",
    )}>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", color ?? "text-muted-foreground/50")} />
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground/60 leading-none">{label}</p>
        <p className="text-xs font-semibold text-foreground leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ── More Menu Button + Dropdown ──────────────────────────────

function MoreMenu({ items, triggerRef, open, onToggle, onAction }: {
  items: { action: string; label: string; icon: React.ElementType; variant?: "default" | "danger" | "success" }[]
  triggerRef: React.RefObject<HTMLButtonElement | null>
  open: boolean; onToggle: () => void; onAction: (action: string) => void
}) {
  return (
    <div className="relative">
      <motion.button
        whileTap={{ scale: 0.9 }}
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150",
          open
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        aria-label="More actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </motion.button>
      <SmartDropdown
        open={open}
        onClose={() => { if (open) onToggle() }}
        triggerRef={triggerRef}
        width="w-52"
        maxHeight="min(60vh, 480px)"
      >
        <div className="p-1.5 space-y-0.5">
          {items.map((item) => (
            <QuickActionButton
              key={item.action}
              icon={item.icon}
              label={item.label}
              onClick={() => { onToggle(); onAction(item.action) }}
              variant={item.variant ?? "default"}
            />
          ))}
        </div>
      </SmartDropdown>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//   ROOM CARD — Premium State-Aware Control Panel
// ═══════════════════════════════════════════════════════════════

export function RoomCard({
  room, hkTask, mtReq, onAction,
}: {
  room: Room; hkTask?: HousekeepingTask; mtReq?: MaintenanceRequest
  onAction: (room: Room, action: string) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null!)

  const isOccupied = room.status === "occupied"
  const isAvailable = room.status === "available" || room.status === "vacant"
  const isReserved = room.status === "reserved"
  const isCleaning = room.status === "cleaning" || room.status === "dirty"
  const isOutOfOrder = room.status === "out_of_order" || room.status === "maintenance"

  const cfg = getCfg(room.status)
  const roomNum = room.room_number || room.number || ""
  const roomTypeName = room.room_types?.name || room.type || ""
  const nightlyRate = room.pricePerNight || room.price || 0
  const guestName = room.guest || ""

  // Stay computation
  const checkIn = room.checkIn ? new Date(room.checkIn) : null
  const checkOut = room.checkOut ? new Date(room.checkOut) : null
  const today = new Date()
  const totalNights = checkIn && checkOut ? Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000)) : 0
  const nightsElapsed = checkIn ? Math.max(1, Math.round((today.getTime() - checkIn.getTime()) / 86400000) + 1) : 0
  const nightsLeft = Math.max(0, totalNights - nightsElapsed)
  const isLastNight = nightsLeft <= 1 && totalNights > 0
  const isOverdue = !!checkOut && today > checkOut
  const hasOpenEndedStay = !checkOut && checkIn !== null

  const dateRange = checkIn && checkOut
    ? `${formatShortDate(room.checkIn)} \u2192 ${formatShortDate(room.checkOut)}`
    : checkIn
    ? `From ${formatShortDate(room.checkIn)}`
    : ""

  const arrivalIsToday = checkIn ? new Date().toDateString() === checkIn.toDateString() : false
  const arrivalLabel = arrivalIsToday ? "Today" : checkIn ? formatShortDate(room.checkIn) : ""
  const estimatedCharges = nightlyRate * nightsElapsed

  // ── Contextual More Menu Items ──────────────────────────
  const menuItems = (() => {
    if (isAvailable) {
      return [
        { action: "details", label: "View Details", icon: Eye },
        { action: "edit", label: "Edit Room", icon: Edit },
        { action: "history", label: "View History", icon: History },
        { action: "toggle", label: "Disable Room", icon: PowerOff, variant: "danger" as const },
      ]
    }
    if (isReserved) {
      return [
        { action: "editbooking", label: "Edit Reservation", icon: Calendar },
        { action: "details", label: "View Details", icon: Eye },
        { action: "history", label: "View History", icon: History },
        { action: "edit", label: "Edit Room", icon: Edit },
      ]
    }
    if (isOccupied) {
      return [
        { action: "folio", label: "View Folio", icon: Receipt },
        { action: "details", label: "View Booking", icon: Calendar },
        { action: "editbooking", label: "Edit Guest", icon: Edit },
        { action: "extend", label: "Extend Stay", icon: Clock },
        { action: "transfer", label: "Transfer Room", icon: ArrowRightFromLine },
        { action: "print", label: "Print Invoice", icon: Printer },
        { action: "markcleaning", label: "Mark Cleaning", icon: Sparkles },
        { action: "maintenance", label: "Mark Maintenance", icon: Wrench },
        { action: "release", label: "Release Room", icon: PowerOff, variant: "danger" as const },
      ]
    }
    if (isCleaning) {
      return [
        { action: "details", label: "View Details", icon: Eye },
        { action: "edit", label: "Edit Room", icon: Edit },
        { action: "mt", label: "Report Maintenance", icon: Wrench },
        { action: "history", label: "View History", icon: History },
        { action: "toggle", label: "Disable Room", icon: PowerOff, variant: "danger" as const },
      ]
    }
    if (isOutOfOrder) {
      return [
        { action: "details", label: "View Details", icon: Eye },
        { action: "edit", label: "Edit Room", icon: Edit },
        { action: "history", label: "View History", icon: History },
        { action: "toggle", label: "Enable Room", icon: PowerOff, variant: "success" as const },
      ]
    }
    return [
      { action: "details", label: "View Details", icon: Eye },
      { action: "edit", label: "Edit Room", icon: Edit },
      { action: "history", label: "View History", icon: History },
    ]
  })()

  const handle = (action: string) => onAction(room, action)

  return (
    <motion.div
      variants={shouldReduceMotion ? undefined : staggerItem}
      layout={!shouldReduceMotion}
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-card transition-all duration-200",
        "min-h-[320px]",
        isOutOfOrder
          ? "border-red-200/30 dark:border-red-900/20 opacity-60"
          : "border-border/60 hover:shadow-lg hover:border-foreground/20",
        cfg.glow,
      )}
    >
      {/* Hover Shimmer Effect */}
      {!isOutOfOrder && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className={cn(
            "absolute inset-0 rounded-2xl bg-gradient-to-br",
            cfg.gradient,
          )} />
        </div>
      )}

      {/* Disabled Badge */}
      {isOutOfOrder && (
        <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 rounded-full bg-red-500 px-3 py-1 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
          <Clock className="h-3 w-3" />
          Disabled
        </div>
      )}

      {/* ===== AVAILABLE ===== */}
      {isAvailable && (
        <div className="relative z-[1] flex flex-col gap-2.5 p-5 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-3xl font-black text-foreground tracking-tight"
              >
                {roomNum}
              </motion.span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/60 mt-0.5 font-medium">{roomTypeName}</p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>

          {nightlyRate > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-1.5 mt-1"
            >
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatCurrency(nightlyRate)}
              </span>
              <span className="text-xs text-muted-foreground/50 font-medium">/ night</span>
            </motion.div>
          )}

          <div className="flex-1" />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-2 text-[11px] text-emerald-600/70 dark:text-emerald-400/70 font-medium"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Ready for check-in
          </motion.div>

          {/* Action Buttons Container */}
          <div className="flex items-center gap-1.5 pt-2">
            <SmallButton icon={CalendarDays} label="Reserve" onClick={() => handle("reserve")} variant="ghost" />
            <SmallButton icon={Hotel} label="Check In" onClick={() => handle("checkin")} />
            <div className="ml-auto">
              <MoreMenu
                items={menuItems}
                triggerRef={menuRef}
                open={menuOpen}
                onToggle={() => setMenuOpen(v => !v)}
                onAction={handle}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== RESERVED ===== */}
      {isReserved && (
        <div className="relative z-[1] flex flex-col gap-2.5 p-5 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-3xl font-black text-foreground tracking-tight"
              >
                {roomNum}
              </motion.span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/60 mt-0.5 font-medium">{roomTypeName}</p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>

          {guestName && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="flex items-center gap-3 mt-1"
            >
              <GuestAvatar name={guestName} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{guestName}</p>
                {arrivalLabel && (
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    Arrival: <span className="font-semibold">{arrivalLabel}</span>
                  </p>
                )}
              </div>
            </motion.div>
          )}

          <div className="flex-1" />

          {(hkTask || mtReq) && (
            <div className="flex flex-wrap items-center gap-1">
              {hkTask && <BadgeSmall label={hkTask.status.replace(/_/g, " ")} variant="hk" />}
              {mtReq && <BadgeSmall label={mtReq.status} variant="mt" />}
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-1">
            <SmallButton icon={ArrowRightFromLine} label="Check In" onClick={() => handle("checkin")} />
            <SmallButton icon={XCircle} label="Cancel" onClick={() => handle("cancelreservation")} variant="ghost" />
            <div className="ml-auto">
              <MoreMenu
                items={menuItems}
                triggerRef={menuRef}
                open={menuOpen}
                onToggle={() => setMenuOpen(v => !v)}
                onAction={handle}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== OCCUPIED ===== */}
      {isOccupied && (
        <div className="relative z-[1] flex flex-col p-5 flex-1">
          {/* Top Section */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[32px] font-black text-foreground tracking-tight leading-none"
              >
                {roomNum}
              </motion.span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/60 mt-0.5 font-medium">{roomTypeName}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isOverdue && (
                <span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider animate-pulse">
                  Overdue
                </span>
              )}
              {isLastNight && !isOverdue && (
                <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  Last Night
                </span>
              )}
              <StatusBadge status={room.status} />
            </div>
          </div>

          {/* Guest + Stay Info */}
          {guestName && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex items-start gap-3 mb-3"
            >
              <GuestAvatar name={guestName} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-foreground leading-snug truncate">{guestName}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground/70">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {dateRange || (hasOpenEndedStay ? "Open-ended stay" : "")}
                  </span>
                  {totalNights > 0 && (
                    <>
                      <span className="text-muted-foreground/30">\u00b7</span>
                      <span className="font-semibold text-foreground/70">{totalNights} {pluralize(totalNights, "Night")}</span>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <StatChip
              icon={IndianRupee}
              label="Est. Charges"
              value={formatCurrency(estimatedCharges)}
              color="text-amber-500"
            />
            <StatChip
              icon={Clock}
              label={totalNights > 0 ? "Nights Remaining" : "Nights Stayed"}
              value={totalNights > 0 ? `${nightsLeft} of ${totalNights}` : `${nightsElapsed} night${nightsElapsed !== 1 ? 's' : ''}`}
              color="text-primary"
            />
          </div>

          {/* HK/MT Badges */}
          {(hkTask || mtReq) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {hkTask && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-3 w-3" />
                  {hkTask.status.replace(/_/g, " ")}
                </span>
              )}
              {mtReq && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-[10px] font-medium text-red-600 dark:text-red-400">
                  <Wrench className="h-3 w-3" />
                  {mtReq.status}
                </span>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 pt-3 border-t border-border/30">
            <SmallButton icon={Sofa} label="Open POS" onClick={() => handle("openpos")} variant="primary" />
            <SmallButton icon={Receipt} label="Folio" onClick={() => handle("folio")} variant="ghost" />
            <SmallButton
              icon={LogOut}
              label="Checkout"
              onClick={() => handle("checkout")}
              variant={isOverdue ? "danger" : "ghost"}
            />
            <div className="ml-auto">
              <MoreMenu
                items={menuItems}
                triggerRef={menuRef}
                open={menuOpen}
                onToggle={() => setMenuOpen(v => !v)}
                onAction={handle}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== CLEANING ===== */}
      {isCleaning && (
        <div className="relative z-[1] flex flex-col gap-3 p-5 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-3xl font-black text-foreground tracking-tight"
              >
                {roomNum}
              </motion.span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/60 mt-0.5 font-medium">{roomTypeName}</p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground/60 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
            Waiting for housekeeping
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <SmallButton icon={CheckCheck} label="Mark Clean" onClick={() => handle("markclean")} variant="success" />
            <MoreMenu
              items={menuItems}
              triggerRef={menuRef}
              open={menuOpen}
              onToggle={() => setMenuOpen(v => !v)}
              onAction={handle}
            />
          </div>
        </div>
      )}

      {/* ===== MAINTENANCE / OUT OF ORDER ===== */}
      {isOutOfOrder && (
        <div className="relative z-[1] flex flex-col gap-3 p-5 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-3xl font-black text-muted-foreground/50 tracking-tight line-through decoration-muted-foreground/20">
                {roomNum}
              </span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/30 mt-0.5 line-through decoration-muted-foreground/10 font-medium">
                  {roomTypeName}
                </p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground/50 font-medium">
            <Wrench className="h-3.5 w-3.5" />
            {room.status === "maintenance" ? "Under maintenance" : "Room is disabled"}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <SmallButton
              icon={CheckCheck}
              label={room.status === "maintenance" ? "Mark Available" : "Enable Room"}
              onClick={() => handle("markclean")}
              variant="primary"
            />
            <MoreMenu
              items={menuItems}
              triggerRef={menuRef}
              open={menuOpen}
              onToggle={() => setMenuOpen(v => !v)}
              onAction={handle}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ── HK/MT Badge Helper ───────────────────────────────────────

function BadgeSmall({ label, variant }: { label: string; variant: "hk" | "mt" }) {
  const HK_STYLES: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-500 border-amber-500/20",
    in_progress: "bg-blue-500/15 text-blue-500 border-blue-500/20",
    completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  }
  const MT_STYLES: Record<string, string> = {
    open: "bg-red-500/15 text-red-500 border-red-500/20",
    assigned: "bg-orange-500/15 text-orange-500 border-orange-500/20",
    in_progress: "bg-blue-500/15 text-blue-500 border-blue-500/20",
    resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
    closed: "bg-muted text-muted-foreground border-border",
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium leading-none",
      variant === "hk" ? HK_STYLES[label.toLowerCase()] ?? "bg-muted text-muted-foreground border-border"
        : MT_STYLES[label.toLowerCase()] ?? "bg-muted text-muted-foreground border-border",
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
