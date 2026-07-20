import { useState, useRef } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { cn } from "@/lib/utils"
import { SmartDropdown } from "@/components/ui/SmartDropdown"
import { QuickActionButton } from "./shared"
import type { Room, RoomStatus, HousekeepingTask, MaintenanceRequest } from "@/types"
import {
  Calendar, Sparkles, Wrench,
  CheckCheck,
  MoreHorizontal, ArrowRightFromLine,
  Eye, Edit, Paintbrush, History, PowerOff,
  Hotel, Clock, Sofa, LogOut, XCircle, Printer,
  IndianRupee, CalendarDays,
} from "lucide-react"

// ── Animation Variants ───────────────────────────────────────

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
}

// ── Helpers ──────────────────────────────────────────────────

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "\u2014"
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

// ── Status config ────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
  occupied:    { label: "Occupied",    dot: "bg-primary",        bg: "bg-primary/10",        text: "text-primary",             border: "border-primary/20" },
  vacant:      { label: "Available",   dot: "bg-emerald-500",    bg: "bg-emerald-500/10",     text: "text-emerald-600",          border: "border-emerald-500/20" },
  available:   { label: "Available",   dot: "bg-emerald-500",    bg: "bg-emerald-500/10",     text: "text-emerald-600",          border: "border-emerald-500/20" },
  reserved:    { label: "Reserved",    dot: "bg-amber-500",      bg: "bg-amber-500/10",       text: "text-amber-600",            border: "border-amber-500/20" },
  cleaning:    { label: "Cleaning",    dot: "bg-cyan-500",       bg: "bg-cyan-500/10",        text: "text-cyan-600",             border: "border-cyan-500/20" },
  dirty:       { label: "Dirty",       dot: "bg-amber-500",      bg: "bg-amber-500/10",       text: "text-amber-600",            border: "border-amber-500/20" },
  maintenance: { label: "Maintenance", dot: "bg-orange-500",     bg: "bg-orange-500/10",      text: "text-orange-600",           border: "border-orange-500/20" },
  out_of_order:{ label: "Disabled",    dot: "bg-red-500",        bg: "bg-red-500/10",         text: "text-red-600",              border: "border-red-500/20" },
}

function getCfg(status: string) {
  return STATUS_CFG[status] ?? {
    label: status.replace(/_/g, " "), dot: "bg-gray-400", bg: "bg-muted",
    text: "text-muted-foreground", border: "border-border",
  }
}

// ── Status Badge (shared, smaller for non-occupied states) ──

function StatusBadge({ status, large }: { status: string; large?: boolean }) {
  const c = getCfg(status)
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-lg border font-semibold uppercase tracking-wider",
      large ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[9px]",
      c.bg, c.text, c.border,
    )}>
      <span className={cn("rounded-full", large ? "h-2 w-2" : "h-1.5 w-1.5", c.dot)} />
      {c.label}
    </span>
  )
}

// ── Guest Avatar ─────────────────────────────────────────────

function GuestAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = name.charAt(0).toUpperCase()
  const dims = size === "md" ? "h-10 w-10 text-sm" : "h-9 w-9 text-xs"
  return (
    <div className={cn(
      "flex items-center justify-center rounded-full bg-primary/10 shrink-0",
      dims,
    )}>
      <span className="font-bold text-primary">{initial}</span>
    </div>
  )
}

// ── HK/MT badge helpers ──────────────────────────────────────

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

function MiniBadge({ label, variant }: { label: string; variant: "hk" | "mt" }) {
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

// ── Primary Action Button ────────────────────────────────────

function PrimaryBtn({ icon: Icon, label, onClick, variant = "primary", disabled }: {
  icon: React.ElementType; label: string; onClick: () => void
  variant?: "primary" | "success" | "danger" | "ghost"
  disabled?: boolean
}) {
  const styles = {
    primary:  "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    success:  "bg-emerald-500 text-white hover:bg-emerald-500/90 shadow-sm",
    danger:   "bg-red-500 text-white hover:bg-red-500/90 shadow-sm",
    ghost:    "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
  }
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
        styles[variant],
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </motion.button>
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
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
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
//   ROOM CARD — State-Aware Mini Control Panel
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

  // Stay computation (occupied)
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

  // Arrival display (reserved)
  const checkInDate = room.checkIn ? new Date(room.checkIn) : null
  const arrivalIsToday = checkInDate ? new Date().toDateString() === checkInDate.toDateString() : false
  const arrivalLabel = arrivalIsToday ? "Today" : checkInDate ? formatShortDate(room.checkIn) : ""

  // Occupied-specific status flags
  const showLastNight = isLastNight && !isOverdue
  const showOverdue = isOverdue
  const estimatedCharges = nightlyRate * nightsElapsed

  // ── Contextual More Menu Items ──────────────────────────
  const menuItems = (() => {
    const common: { action: string; label: string; icon: React.ElementType; variant?: "default" | "danger" | "success" }[] = [
      { action: "details", label: "View Details", icon: Eye },
      { action: "edit", label: "Edit Room", icon: Edit },
    ]
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
        ...common,
        { action: "editbooking", label: "Edit Reservation", icon: Calendar },
        { action: "history", label: "View History", icon: History },
      ]
    }
    if (isOccupied) {
      return [
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
      ...common,
      { action: "history", label: "View History", icon: History },
    ]
  })()

  const handle = (action: string) => onAction(room, action)

  return (
    <motion.div
      variants={shouldReduceMotion ? undefined : staggerItem}
      layout={!shouldReduceMotion}
      className={cn(
        "relative flex flex-col rounded-xl border bg-card shadow-sm transition-all duration-200",
        "min-h-[340px]",
        isOutOfOrder
          ? "border-red-200/40 dark:border-red-900/20 opacity-65"
          : "border-border hover:shadow-md hover:border-foreground/15",
        "border-l-[3px]",
        isOccupied && "border-l-primary",
        isAvailable && "border-l-emerald-500",
        isReserved && "border-l-amber-500",
        isCleaning && "border-l-cyan-500",
        (room.status === "dirty") && "border-l-amber-500",
        (room.status === "maintenance") && "border-l-orange-500",
        isOutOfOrder && "border-l-red-400",
      )}
    >
      {isOutOfOrder && (
        <div className="absolute -top-1.5 -right-1.5 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
          <Clock className="h-3 w-3" />
          Disabled
        </div>
      )}

      {/* ===== AVAILABLE ===== */}
      {isAvailable && (
        <div className="flex flex-col gap-3 p-4 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-2xl font-black text-foreground tracking-tight">{roomNum}</span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">{roomTypeName}</p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>

          {nightlyRate > 0 && (
            <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <IndianRupee className="h-3.5 w-3.5" />
              {nightlyRate.toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground/60">/ night</span>
            </div>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 text-[10px] text-emerald-600/60 dark:text-emerald-400/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Ready for check-in
          </div>

          <div className="flex items-center gap-1.5">
            <PrimaryBtn icon={CalendarDays} label="Reserve" onClick={() => handle("reserve")} variant="ghost" />
            <PrimaryBtn icon={Hotel} label="Check In" onClick={() => handle("checkin")} />
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
        <div className="flex flex-col gap-3 p-4 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-2xl font-black text-foreground tracking-tight">{roomNum}</span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">{roomTypeName}</p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>

          {guestName && (
            <div className="flex items-center gap-2.5 mt-1">
              <GuestAvatar name={guestName} />
              <div>
                <p className="text-sm font-semibold text-foreground">{guestName}</p>
                {arrivalLabel && (
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Arrival: {arrivalLabel}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex-1" />

          {(hkTask || mtReq) && (
            <div className="flex flex-wrap items-center gap-1">
              {hkTask && <MiniBadge label={hkTask.status.replace(/_/g, " ")} variant="hk" />}
              {mtReq && <MiniBadge label={mtReq.status} variant="mt" />}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <PrimaryBtn icon={ArrowRightFromLine} label="Check In" onClick={() => handle("checkin")} />
            <PrimaryBtn icon={XCircle} label="Cancel" onClick={() => handle("cancelreservation")} variant="ghost" />
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
        <div className="flex flex-col p-5 flex-1">
          {/* ── Row 1: Room Number + Status Badge ── */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-[30px] font-black text-foreground tracking-tight leading-none">{roomNum}</span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/60 mt-1">{roomTypeName}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {showOverdue && (
                <span className="rounded-md bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                  Overdue
                </span>
              )}
              {showLastNight && (
                <span className="rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Last Night
                </span>
              )}
              <StatusBadge status={room.status} large />
            </div>
          </div>

          {/* ── Row 2: Guest Info ── */}
          {guestName && (
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <GuestAvatar name={guestName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-foreground leading-snug">{guestName}</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    {dateRange && <span>{dateRange}</span>}
                    {hasOpenEndedStay && <span>Open-ended stay</span>}
                    {(dateRange || hasOpenEndedStay) && (totalNights > 0 || nightsElapsed > 0) && (
                      <span className="text-muted-foreground/30 mx-1.5">\u00b7</span>
                    )}
                    {totalNights > 0 && <span className="font-medium text-foreground/60">{totalNights} {pluralize(totalNights, "Night")}</span>}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Row 3: Payment / Charges Status ── */}
          {nightlyRate > 0 && (
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Outstanding</span>
              </div>
              <span className="ml-2 text-xs text-muted-foreground/60">
                Rs. {estimatedCharges.toLocaleString()}
              </span>
              <p className="text-xs text-muted-foreground/40 mt-1 ml-1">
                Est. room charges only ({nightlyRate.toLocaleString()} \u00d7 {nightsElapsed} {pluralize(nightsElapsed, "night")})
              </p>
            </div>
          )}

          {/* ── HK/MT Badges ── */}
          {(hkTask || mtReq) && (
            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {hkTask && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Sparkles className="h-3 w-3" />
                    {hkTask.status.replace(/_/g, " ")}
                  </span>
                )}
                {mtReq && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400">
                    <Wrench className="h-3 w-3" />
                    {mtReq.status}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Row 4: Action Buttons ── */}
          <div className="flex items-center gap-2 pt-3 border-t border-border/40">
            <PrimaryBtn icon={Sofa} label="Open POS" onClick={() => handle("openpos")} variant="primary" />
            <PrimaryBtn
              icon={LogOut}
              label="Checkout"
              onClick={() => handle("checkout")}
              variant={showOverdue || showLastNight ? "danger" : "ghost"}
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
        <div className="flex flex-col gap-3 p-4 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-2xl font-black text-foreground tracking-tight">{roomNum}</span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">{roomTypeName}</p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
            <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
            Waiting for housekeeping
          </div>

          {(hkTask || mtReq) && (
            <div className="flex flex-wrap items-center gap-1">
              {hkTask && <MiniBadge label={hkTask.status.replace(/_/g, " ")} variant="hk" />}
              {mtReq && <MiniBadge label={mtReq.status} variant="mt" />}
            </div>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <PrimaryBtn icon={CheckCheck} label="Mark Clean" onClick={() => handle("markclean")} variant="success" />
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
        <div className="flex flex-col gap-3 p-4 flex-1 opacity-65">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-2xl font-black text-muted-foreground tracking-tight line-through decoration-muted-foreground/30">
                {roomNum}
              </span>
              {roomTypeName && (
                <p className="text-xs text-muted-foreground/40 mt-0.5 line-through decoration-muted-foreground/20">{roomTypeName}</p>
              )}
            </div>
            <StatusBadge status={room.status} />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <Wrench className="h-3.5 w-3.5" />
            {room.status === "maintenance" ? "Under maintenance" : "Room is disabled"}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <PrimaryBtn
              icon={CheckCheck}
              label="Mark Available"
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
