import { useState, useRef } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { cn } from "@/lib/utils"
import { SmartDropdown } from "@/components/ui/SmartDropdown"
import { QuickActionButton } from "./shared"
import type { Room, RoomStatus, HousekeepingTask, MaintenanceRequest } from "@/types"
import {
  User, Calendar, Sparkles, Wrench,
  CheckCheck, MapPin,
  MoreHorizontal, ArrowRightFromLine, ArrowLeftToLine,
  Eye, Edit, Paintbrush, History, PowerOff,
  Hotel,  Clock,
} from "lucide-react"

// ── Shared Constants ─────────────────────────────────────────
// (moved inline to consuming components)

// ── Animation Variants ───────────────────────────────────────

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
}

const badgeVariants: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 400, damping: 15 } },
}

// ── Helpers ──────────────────────────────────────────────────

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ── Status config (inline per status value) ─────────────────

function getRoomStatusConfig(status: string): { label: string; dot: string; bg: string; text: string; border: string; iconBg: string } {
  const configs: Record<string, { label: string; dot: string; bg: string; text: string; border: string; iconBg: string }> = {
    occupied: { label: "Occupied", dot: "bg-primary", bg: "bg-primary/10", text: "text-primary", border: "border-primary/20", iconBg: "bg-primary/10 text-primary" },
    vacant: { label: "Vacant", dot: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20", iconBg: "bg-emerald-500/10 text-emerald-500" },
    available: { label: "Available", dot: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20", iconBg: "bg-emerald-500/10 text-emerald-500" },
    reserved: { label: "Reserved", dot: "bg-amber-500", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20", iconBg: "bg-amber-500/10 text-amber-500" },
    cleaning: { label: "Cleaning", dot: "bg-cyan-500", bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-500/20", iconBg: "bg-cyan-500/10 text-cyan-500" },
    maintenance: { label: "Maintenance", dot: "bg-orange-500", bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/20", iconBg: "bg-orange-500/10 text-orange-500" },
    dirty: { label: "Dirty", dot: "bg-amber-500", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20", iconBg: "bg-amber-500/10 text-amber-500" },
    out_of_order: { label: "Disabled", dot: "bg-red-500", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/20", iconBg: "bg-red-500/10 text-red-500" },
    partial_paid: { label: "Partial", dot: "bg-orange-500", bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/20", iconBg: "bg-orange-500/10 text-orange-500" },
    fully_paid: { label: "Paid", dot: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20", iconBg: "bg-emerald-500/10 text-emerald-500" },
  }
  return configs[status] ?? {
    label: status.replace(/_/g, " "), dot: "bg-gray-400", bg: "bg-muted",
    text: "text-muted-foreground", border: "border-border", iconBg: "bg-muted text-muted-foreground",
  }
}

// ── Mini Badge ───────────────────────────────────────────────

function MiniBadge({ label, className }: { label: string; className?: string }) {
  return (
    <motion.span
      variants={badgeVariants}
      initial="initial"
      animate="animate"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium leading-none",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </motion.span>
  )
}

// ── Room Status Badge ────────────────────────────────────────

function RoomStatusBadge({ status, size = "sm" }: { status: RoomStatus; size?: "sm" | "xs" }) {
  const config = getRoomStatusConfig(status)
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-lg border font-semibold uppercase tracking-wider",
      size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-2 py-0.5 text-[9px]",
      config.bg, config.text, config.border,
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
      {config.label}
    </span>
  )
}

// ── Color helpers (inlined from removed constants) ──────────

const getHKStyle = (status: string) => {
  const colors: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-500 border-amber-500/20",
    in_progress: "bg-blue-500/15 text-blue-500 border-blue-500/20",
    completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  }
  return colors[status] ?? "bg-muted text-muted-foreground border-border"
}

const getMTStyle = (status: string) => {
  const colors: Record<string, string> = {
    open: "bg-red-500/15 text-red-500 border-red-500/20",
    assigned: "bg-orange-500/15 text-orange-500 border-orange-500/20",
    in_progress: "bg-blue-500/15 text-blue-500 border-blue-500/20",
    resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
    closed: "bg-muted text-muted-foreground border-border",
  }
  return colors[status] ?? "bg-muted text-muted-foreground border-border"
}

// ── Room Action Menu (smart dropdown) ───────────────────────

function RoomActionMenu({
  room, open, onClose, onAction, triggerRef,
}: {
  room: Room; open: boolean; onClose: () => void
  onAction: (action: string) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <SmartDropdown
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      width="w-56"
      maxHeight="min(60vh, 480px)"
    >
      <div className="border-b border-border px-3.5 py-2.5">
        <p className="text-xs font-semibold text-foreground">
          Room {room.room_number || room.number}
        </p>
        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
          {room.type} · Floor {room.floor}
          {room.pricePerNight && (
            <>
              <span className="text-muted-foreground/30">·</span>
              Rs.{room.pricePerNight.toLocaleString()}
            </>
          )}
        </p>
      </div>
      <div className="p-1.5 space-y-0.5">
        {room.status === "available" || room.status === "vacant" ? (
          <QuickActionButton icon={ArrowRightFromLine} label="Check In" onClick={() => onAction("checkin")} variant="success" />
        ) : room.status === "occupied" ? (
          <QuickActionButton icon={ArrowLeftToLine} label="Check Out" onClick={() => onAction("checkout")} />
        ) : null}
        <QuickActionButton icon={Eye} label="View Details" onClick={() => onAction("details")} />
        <QuickActionButton icon={Edit} label="Edit Room" onClick={() => onAction("edit")} />
        <QuickActionButton icon={Calendar} label="View Bookings" onClick={() => onAction("bookings")} />
        <div className="my-1 border-t border-border" />
        <QuickActionButton icon={Paintbrush} label="Assign Housekeeping" onClick={() => onAction("hk")} />
        <QuickActionButton icon={Wrench} label="Create Maintenance" onClick={() => onAction("mt")} />
        <div className="my-1 border-t border-border" />
        <QuickActionButton icon={Sparkles} label="Mark Clean" onClick={() => onAction("clean")} variant="success" />
        <QuickActionButton icon={PowerOff} label={room.status === "out_of_order" ? "Enable Room" : "Disable Room"} onClick={() => onAction("toggle")} variant={room.status === "out_of_order" ? "success" : "danger"} />
        <QuickActionButton icon={History} label="View History" onClick={() => onAction("history")} />
      </div>
    </SmartDropdown>
  )
}

// ── Room Card ────────────────────────────────────────────────

export function RoomCard({
  room, hkTask, mtReq, onAction,
}: {
  room: Room; hkTask?: HousekeepingTask; mtReq?: MaintenanceRequest
  onAction: (room: Room, action: string) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null!)

  const isOccupied = room.status === "occupied"
  const isAvailable = room.status === "available" || room.status === "vacant"
  const isReserved = room.status === "reserved"
  const isCleaning = room.status === "cleaning"
  const isOutOfOrder = room.status === "out_of_order" || room.status === "maintenance"

  const borderColor = isOccupied ? "border-l-primary"
    : isAvailable ? "border-l-emerald-500"
    : isReserved ? "border-l-amber-500"
    : isCleaning ? "border-l-cyan-500"
    : "border-l-red-400"

  return (
    <motion.div
      variants={shouldReduceMotion ? undefined : staggerItem}
      layout={!shouldReduceMotion}
      className={cn(
        "relative rounded-xl border bg-card/70 shadow-sm backdrop-blur-sm transition-all duration-200",
        isOutOfOrder
          ? "border-red-200/40 dark:border-red-900/20 opacity-65"
          : "border-border hover:shadow-lg hover:border-foreground/10",
        borderColor,
        "border-l-[3px]",
      )}
    >
      {/* Disabled overlay badge */}
      {isOutOfOrder && (
        <div className="absolute -top-1.5 -right-1.5 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
          <Clock className="h-2.5 w-2.5" />
          Disabled
        </div>
      )}

      <div className="p-3">
        {/* ── Row 1: Number + Type + Status + Menu ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Number badge */}
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-extrabold tracking-tight shadow-sm ring-1",
              isOccupied && "bg-primary/10 text-primary ring-primary/20",
              isAvailable && "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 ring-emerald-500/20",
              isReserved && "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 ring-amber-500/20",
              isCleaning && "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-400 ring-cyan-500/20",
              isOutOfOrder && "bg-red-50 text-red-400 dark:bg-red-950/20 dark:text-red-400 ring-red-500/10",
            )}>
              {room.room_number || room.number}
            </div>

            {/* Type + metadata */}
            <div className="min-w-0">
              <p className={cn(
                "text-xs font-semibold truncate",
                isOutOfOrder ? "text-muted-foreground line-through" : "text-foreground",
              )}>
                {room.type || `Room ${room.room_number || room.number}`}
              </p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground/60 mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                <span>Floor {room.floor}</span>
                {room.pricePerNight && (
                  <>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="tabular-nums">Rs.{room.pricePerNight.toLocaleString()}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Status + Menu trigger */}
          <div className="flex items-center gap-1 shrink-0">
            <RoomStatusBadge status={room.status} size="xs" />
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                ref={menuTriggerRef}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Room actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </motion.button>
              <RoomActionMenu
                room={room}
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                onAction={(a) => { setMenuOpen(false); onAction(room, a) }}
                triggerRef={menuTriggerRef}
              />
            </div>
          </div>
        </div>

        {/* ── Row 2: Guest Info (if occupied) ── */}
        {room.guest && (
          <div className="mt-3 rounded-lg bg-gradient-to-r from-primary/[0.04] to-transparent border border-primary/5 p-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{room.guest}</p>
                {room.checkIn && room.checkOut && (
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground/60 mt-0.5">
                    {formatShortDate(room.checkIn)}
                    <span className="text-muted-foreground/30">→</span>
                    {formatShortDate(room.checkOut)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Row 3: HK/MT Badges inline ── */}
        {(hkTask || mtReq) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1">
            {hkTask && (
              <MiniBadge
                label={`HK: ${hkTask.status.replace(/_/g, " ")}`}
                className={getHKStyle(hkTask.status)}
              />
            )}
            {mtReq && (
              <MiniBadge
                label={`MT: ${mtReq.status}`}
                className={getMTStyle(mtReq.status)}
              />
            )}
          </div>
        )}

        {/* ── Row 4: Quick actions ── */}
        <div className="mt-3 flex items-center gap-1.5">
          {isAvailable && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onAction(room, "checkin")}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
            >
              <Hotel className="h-3.5 w-3.5" />
              Check In
            </motion.button>
          )}
          {isCleaning && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onAction(room, "markclean")}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500/90 transition-all"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark Clean
            </motion.button>
          )}
          {!isAvailable && !isCleaning && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onAction(room, "details")}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </motion.button>
          )}
        </div>

        {/* ── Row 5: Ready indicator (available) ── */}
        {isAvailable && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Ready for check-in
          </div>
        )}
      </div>
    </motion.div>
  )
}


