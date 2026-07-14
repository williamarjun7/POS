import { useState, useRef } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { cn, formatCurrency } from "@/lib/utils"
import { SmartDropdown } from "@/components/ui/SmartDropdown"
import { QuickActionButton } from "./shared"
import { RequirePermission } from "@/lib/core/PermissionGuards"
import {
  Users, CircleDot, MoreHorizontal, ArrowRightFromLine,
  Calendar, ArrowLeftToLine, Edit, Trash2,
  Copy, Scissors, Sofa, Clock,
} from "lucide-react"

// ── Animation Variant ────────────────────────────────────────

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
}

// ── Status config ────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string; border: string; iconBg: string }> = {
  available: {
    label: "Available",
    dot: "bg-emerald-500",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20",
    iconBg: "bg-emerald-500/10 text-emerald-500",
  },
  free: {
    label: "Available",
    dot: "bg-emerald-500",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20",
    iconBg: "bg-emerald-500/10 text-emerald-500",
  },
  occupied: {
    label: "Occupied",
    dot: "bg-primary",
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/20",
    iconBg: "bg-primary/10 text-primary",
  },
  reserved: {
    label: "Reserved",
    dot: "bg-amber-500",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/20",
    iconBg: "bg-amber-500/10 text-amber-500",
  },
  cleaning: {
    label: "Cleaning",
    dot: "bg-cyan-500",
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500/20",
    iconBg: "bg-cyan-500/10 text-cyan-500",
  },
  maintenance: {
    label: "Maintenance",
    dot: "bg-orange-500",
    bg: "bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/20",
    iconBg: "bg-orange-500/10 text-orange-500",
  },
  disabled: {
    label: "Disabled",
    dot: "bg-red-500",
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500/20",
    iconBg: "bg-red-500/10 text-red-500",
  },
}

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? {
    label: status.charAt(0).toUpperCase() + status.slice(1),
    dot: "bg-gray-400",
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    iconBg: "bg-muted text-muted-foreground",
  }
}

// ── Table Action Menu (smart dropdown) ──────────────────────

function TableActionMenu({
  table, open, onClose, onAction, triggerRef,
}: {
  table: any; open: boolean; onClose: () => void
  onAction: (action: string) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <SmartDropdown
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      width="w-52"
      maxHeight="min(60vh, 480px)"
    >
      <div className="border-b border-border px-3.5 py-2.5">
        <p className="text-xs font-semibold text-foreground">
          Table {table.table_number || table.number}
        </p>
        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
          <Users className="h-3 w-3" />
          {table.capacity} seats
          <span className="text-muted-foreground/30">·</span>
          {table.area || table.section || "Main"}
        </p>
      </div>
      <div className="p-1.5 space-y-0.5">
        <QuickActionButton icon={ArrowRightFromLine} label="Open Table" onClick={() => onAction("open")} variant="success" />
        <QuickActionButton icon={Calendar} label="Reserve" onClick={() => onAction("reserve")} />
        <QuickActionButton icon={ArrowLeftToLine} label="Release" onClick={() => onAction("release")} />
        <div className="my-1 border-t border-border" />
        <QuickActionButton icon={Copy} label="Transfer Table" onClick={() => onAction("transfer")} />
        <QuickActionButton icon={Scissors} label="Split Bill" onClick={() => onAction("split")} />
        <div className="my-1 border-t border-border" />
        <QuickActionButton icon={Edit} label="Edit" onClick={() => onAction("edit")} />
        <div className="my-1 border-t border-border" />
        <QuickActionButton
          icon={ArrowLeftToLine}
          label={table.status === 'disabled' ? 'Enable' : 'Disable'}
          onClick={() => onAction(table.status === 'disabled' ? 'enable' : 'disable')}
          variant={table.status === 'disabled' ? 'success' : 'danger'}
        />
        <RequirePermission permission="operations.manage">
          <QuickActionButton icon={Trash2} label="Delete" onClick={() => onAction("delete")} variant="danger" />
        </RequirePermission>
      </div>
    </SmartDropdown>
  )
}

// ── Table Card ───────────────────────────────────────────────

export function TableCard({ table, onAction }: { table: any; onAction: (table: any, action: string) => void }) {
  const shouldReduceMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null!)

  const config = getStatusConfig(table.status)
  const isDisabled = table.status === "disabled"
  const isAvailable = table.status === "available" || table.status === "free"
  const isOccupied = table.status === "occupied"

  return (
    <motion.div
      variants={shouldReduceMotion ? undefined : staggerItem}
      layout={!shouldReduceMotion}
      className={cn(
        "relative rounded-xl border bg-card/70 shadow-sm backdrop-blur-sm transition-all duration-200",
        isDisabled
          ? "border-red-200/40 dark:border-red-900/20 opacity-65"
          : "border-border hover:shadow-lg hover:border-foreground/10",
        "border-l-[3px]",
        isOccupied && "border-l-primary",
        isAvailable && "border-l-emerald-500",
        table.status === "reserved" && "border-l-amber-500",
        table.status === "cleaning" && "border-l-cyan-500",
        table.status === "maintenance" && "border-l-orange-500",
        isDisabled && "border-l-red-400",
      )}
    >
      {/* Disabled overlay badge */}
      {isDisabled && (
        <div className="absolute -top-1.5 -right-1.5 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
          <Clock className="h-2.5 w-2.5" />
          Disabled
        </div>
      )}

      <div className="p-4">
        {/* ── Row 1: Table number + Status + Menu ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Number badge */}
            <div className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold tracking-tight shadow-sm",
              isAvailable && "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 ring-1 ring-emerald-500/20",
              isOccupied && "bg-primary/10 text-primary ring-1 ring-primary/20",
              table.status === "reserved" && "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 ring-1 ring-amber-500/20",
              table.status === "cleaning" && "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-400 ring-1 ring-cyan-500/20",
              table.status === "maintenance" && "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400 ring-1 ring-orange-500/20",
              isDisabled && "bg-red-50 text-red-400 dark:bg-red-950/20 dark:text-red-400 ring-1 ring-red-500/10",
            )}>
              {table.table_number || table.number}
            </div>

            {/* Name + metadata */}
            <div className="min-w-0">
              <p className={cn(
                "text-sm font-semibold truncate",
                isDisabled ? "text-muted-foreground line-through" : "text-foreground",
              )}>
                {table.name || `Table ${table.table_number || table.number}`}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground/60 mt-0.5">
                <Users className="h-3 w-3 shrink-0" />
                <span>{table.capacity} seats</span>
                <span className="text-muted-foreground/30">·</span>
                <span className="truncate">{table.area || table.section || "Main"}</span>
              </p>
            </div>
          </div>

          {/* Status badge + Menu trigger */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
              config.border,
              config.bg,
              config.text,
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
              {config.label}
            </span>

            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                ref={menuTriggerRef}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Table actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </motion.button>
              <TableActionMenu
                table={table}
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                onAction={(a) => { setMenuOpen(false); onAction(table, a) }}
                triggerRef={menuTriggerRef}
              />
            </div>
          </div>
        </div>

        {/* ── Row 2: Running bill (if occupied) ── */}
        {isOccupied && table.running_total != null && (
          <div className="mt-3.5 rounded-xl bg-gradient-to-r from-primary/[0.04] to-transparent border border-primary/5 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                  <Sofa className="h-3 w-3 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground/70">Running Bill</span>
              </div>
              <span className="text-base font-bold tabular-nums text-foreground">
                {formatCurrency(table.running_total)}
              </span>
            </div>
            {table.orders && table.orders.length > 0 && (
              <p className="mt-1.5 text-[10px] text-muted-foreground/50 flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                {table.orders.length} order{table.orders.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}

        {/* ── Row 3: Quick Actions ── */}
        <div className="mt-3.5 flex items-center gap-1.5">
          {isAvailable && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onAction(table, "open")}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
            >
              <ArrowRightFromLine className="h-3.5 w-3.5" />
              Open Table
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onAction(table, "reserve")}
            className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Calendar className="h-3.5 w-3.5" />
            Reserve
          </motion.button>

          {isOccupied && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onAction(table, "release")}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeftToLine className="h-3.5 w-3.5" />
              Release
            </motion.button>
          )}
        </div>

        {/* ── Row 4: Ready indicator (available) ── */}
        {isAvailable && (
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
            <CircleDot className="h-2.5 w-2.5" />
            Ready for seating
          </div>
        )}
      </div>
    </motion.div>
  )
}
