import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Room } from '@/types'
import type { Booking } from '@/lib/services/booking-service'
import {
  CalendarDays,
  LogOut, Eye, Edit, XCircle,
  Wrench, Sparkles, MoreHorizontal,
  Hotel, ArrowRightFromLine, Sofa,
} from 'lucide-react'

// ── Status config ────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  dot: string
  label: string
  border: string
  tileBg: string
  tileGlow: string
  accent: string
  iconStyle: string
}> = {
  available: {
    dot: 'bg-emerald-500', label: 'Available',
    border: 'border-emerald-400/40 dark:border-emerald-600/40',
    tileBg: 'from-emerald-50 via-emerald-50/50 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-card',
    tileGlow: 'before:bg-emerald-400/5',
    accent: 'text-emerald-600 dark:text-emerald-400',
    iconStyle: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60',
  },
  vacant: {
    dot: 'bg-emerald-500', label: 'Available',
    border: 'border-emerald-400/40 dark:border-emerald-600/40',
    tileBg: 'from-emerald-50 via-emerald-50/50 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-card',
    tileGlow: 'before:bg-emerald-400/5',
    accent: 'text-emerald-600 dark:text-emerald-400',
    iconStyle: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60',
  },
  reserved: {
    dot: 'bg-blue-500', label: 'Reserved',
    border: 'border-blue-400/40 dark:border-blue-600/40',
    tileBg: 'from-blue-50 via-blue-50/50 to-white dark:from-blue-950/40 dark:via-blue-950/20 dark:to-card',
    tileGlow: 'before:bg-blue-400/5',
    accent: 'text-blue-600 dark:text-blue-400',
    iconStyle: 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60',
  },
  occupied: {
    dot: 'bg-red-500', label: 'Occupied',
    border: 'border-red-400/40 dark:border-red-600/40',
    tileBg: 'from-red-50 via-red-50/50 to-white dark:from-red-950/40 dark:via-red-950/20 dark:to-card',
    tileGlow: 'before:bg-red-400/5',
    accent: 'text-red-600 dark:text-red-400',
    iconStyle: 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60',
  },
  cleaning: {
    dot: 'bg-orange-500', label: 'Cleaning',
    border: 'border-orange-400/40 dark:border-orange-600/40',
    tileBg: 'from-orange-50 via-orange-50/50 to-white dark:from-orange-950/40 dark:via-orange-950/20 dark:to-card',
    tileGlow: 'before:bg-orange-400/5',
    accent: 'text-orange-600 dark:text-orange-400',
    iconStyle: 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60',
  },
  dirty: {
    dot: 'bg-orange-500', label: 'Dirty',
    border: 'border-orange-400/40 dark:border-orange-600/40',
    tileBg: 'from-orange-50 via-orange-50/50 to-white dark:from-orange-950/40 dark:via-orange-950/20 dark:to-card',
    tileGlow: 'before:bg-orange-400/5',
    accent: 'text-orange-600 dark:text-orange-400',
    iconStyle: 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60',
  },
  maintenance: {
    dot: 'bg-gray-500', label: 'Maintenance',
    border: 'border-gray-300/50 dark:border-gray-600/30',
    tileBg: 'from-gray-50 via-gray-50/50 to-white dark:from-gray-900/40 dark:via-gray-900/20 dark:to-card',
    tileGlow: 'before:bg-gray-400/5',
    accent: 'text-gray-600 dark:text-gray-400',
    iconStyle: 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
  },
  out_of_order: {
    dot: 'bg-gray-500', label: 'Out of Order',
    border: 'border-gray-300/50 dark:border-gray-600/30',
    tileBg: 'from-gray-50 via-gray-50/50 to-white dark:from-gray-900/40 dark:via-gray-900/20 dark:to-card',
    tileGlow: 'before:bg-gray-400/5',
    accent: 'text-gray-600 dark:text-gray-400',
    iconStyle: 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
  },
}

// ── Props ────────────────────────────────────────────────────

export interface DashboardRoomTileProps {
  room: Room
  booking?: Booking | null
  onAction: (room: Room, action: string, booking?: Booking | null) => void
}

// ── Icon button helper ───────────────────────────────────────

function IconBtn({ icon: Icon, onClick, className, tooltip }: {
  icon: React.ElementType; onClick: () => void; className?: string; tooltip?: string
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={cn(
        'flex items-center justify-center rounded-xl p-2 transition-all duration-150 active:scale-90 hover:scale-110 hover:shadow-lg',
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

// ── Status badge corner ──────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status]
  if (!cfg) return null
  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-full px-2.5 py-1 shadow-sm',
      status === 'available' || status === 'vacant' ? 'bg-emerald-100/80 dark:bg-emerald-900/40' :
      status === 'reserved' ? 'bg-blue-100/80 dark:bg-blue-900/40' :
      status === 'occupied' ? 'bg-red-100/80 dark:bg-red-900/40' :
      status === 'cleaning' || status === 'dirty' ? 'bg-orange-100/80 dark:bg-orange-900/40' :
      'bg-gray-100/80 dark:bg-gray-800/40'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      <span className={cn('text-[10px] font-semibold', cfg.accent)}>{cfg.label}</span>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────

export function DashboardRoomTile({ room, booking, onAction }: DashboardRoomTileProps) {
  const cfg = STATUS_CFG[room.status]
  const isAvailable = room.status === 'available' || room.status === 'vacant'
  const isReserved = room.status === 'reserved'
  const isOccupied = room.status === 'occupied'
  const isCleaning = room.status === 'cleaning' || room.status === 'dirty'
  const isMaintenance = room.status === 'maintenance' || room.status === 'out_of_order'

  const roomNumber = room.room_number || room.number || ''
  const roomType = (room as any).room_types?.name || ''
  const roomRate = (room as any).rate || (room as any).room_types?.rate || 0
  const guestName = room.guest || booking?.guestName || ''

  const handleAction = (action: string) => {
    onAction(room, action, booking)
  }

  const tileBase = cn(
    'relative w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5',
    'bg-gradient-to-br',
    'transition-all duration-200',
    'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97]',
    cfg?.border || 'border-border',
    cfg?.tileBg || 'bg-card',
    'overflow-hidden',
    // Subtle glass overlay
    'before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none',
    cfg?.tileGlow || '',
    // Shine effect on hover
    'after:absolute after:inset-0 after:rounded-2xl after:pointer-events-none after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-300',
    'after:bg-gradient-to-tr after:from-white/0 after:via-white/10 after:to-white/0',
  )

  // ── Available ─────────────────────────────────────────────
  if (isAvailable) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="flex flex-col items-center gap-2 group"
      >
        <div className={cn(tileBase, 'relative')}>
          {/* Decorative top-right accent */}
          <div className="absolute -top-3 -right-3 h-16 w-16 rounded-full bg-emerald-500/5 dark:bg-emerald-400/5 blur-xl" />

          {/* Room number */}
          <span className="text-2xl font-black text-foreground tracking-tight drop-shadow-sm z-10">
            {roomNumber}
          </span>

          {/* Room type + rate */}
          {roomType && (
            <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider z-10 mt-0.5">
              {roomType}
            </span>
          )}
          {roomRate > 0 && (
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 z-10">
              Rs. {roomRate.toLocaleString()}/night
            </span>
          )}

          {/* Reserve / Book icons at bottom */}
          <div className="flex items-center gap-1.5 mt-auto pt-1 pb-1 z-10">
            <IconBtn icon={CalendarDays} onClick={() => handleAction('reserve')}
              tooltip="Reserve"
              className={cn(cfg?.iconStyle, 'bg-white/80 dark:bg-gray-900/80 ring-1 ring-inset ring-emerald-200/50 dark:ring-emerald-700/30')} />
            <IconBtn icon={Hotel} onClick={() => handleAction('book')}
              tooltip="Book Now"
              className="bg-emerald-600 text-white hover:bg-emerald-500 shadow-md hover:shadow-emerald-500/25" />
          </div>
        </div>
        <StatusBadge status={room.status} />
      </motion.div>
    )
  }

  // ── Reserved ─────────────────────────────────────────────
  if (isReserved) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="flex flex-col items-center gap-2"
      >
        <div className={cn(tileBase, 'relative')}>
          {/* Decorative accent */}
          <div className="absolute -top-3 -right-3 h-16 w-16 rounded-full bg-blue-500/5 dark:bg-blue-400/5 blur-xl" />
          <div className="absolute -bottom-3 -left-3 h-12 w-12 rounded-full bg-blue-500/5 dark:bg-blue-400/5 blur-lg" />

          {/* Room number - smaller to make room for guest info */}
          <span className="text-xl font-black text-foreground tracking-tight z-10">{roomNumber}</span>

          {/* Guest name */}
          {guestName && (
            <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 text-center px-2 leading-tight truncate max-w-full z-10">
              {guestName}
            </span>
          )}

          {/* Check In + More icons */}
          <div className="flex items-center gap-1.5 mt-auto pt-1 pb-1 z-10">
            <IconBtn icon={ArrowRightFromLine} onClick={() => handleAction('checkin')}
              tooltip="Check In"
              className="bg-blue-600 text-white hover:bg-blue-500 shadow-md hover:shadow-blue-500/25" />
            <div className="relative group/actions">
              <IconBtn icon={MoreHorizontal} onClick={() => {}}
                tooltip="More actions"
                className={cn(cfg?.iconStyle, 'bg-white/80 dark:bg-gray-900/80 ring-1 ring-inset ring-blue-200/50 dark:ring-blue-700/30')} />
              <div className="absolute right-0 top-full mt-1 z-30 hidden group-hover/actions:block hover:block">
                <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm shadow-xl p-1.5 min-w-[130px] space-y-0.5">
                  <button onClick={() => handleAction('view')}
                    className="flex items-center gap-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                  <button onClick={() => handleAction('edit')}
                    className="flex items-center gap-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                    <Edit className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => handleAction('cancel')}
                    className="flex items-center gap-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Status indicator dot - top right */}
          <span className="absolute top-2 right-2 flex h-2.5 w-2.5 z-10">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 ring-2 ring-white dark:ring-gray-900" />
          </span>
        </div>
        <StatusBadge status={room.status} />
      </motion.div>
    )
  }

  // ── Occupied ──────────────────────────────────────────────
  if (isOccupied) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="flex flex-col items-center gap-2"
      >
        <div className={cn(tileBase, 'relative')}>
          {/* Decorative accent */}
          <div className="absolute -top-3 -right-3 h-16 w-16 rounded-full bg-red-500/5 dark:bg-red-400/5 blur-xl" />
          <div className="absolute -bottom-3 -left-3 h-12 w-12 rounded-full bg-red-500/5 dark:bg-red-400/5 blur-lg" />

          <span className="text-xl font-black text-red-700 dark:text-red-300 tracking-tight z-10">{roomNumber}</span>

          {guestName && (
            <span className="text-[9px] font-semibold text-red-600/80 dark:text-red-400/80 text-center px-2 leading-tight truncate max-w-full z-10">
              {guestName}
            </span>
          )}

          {/* POS + Checkout + More */}
          <div className="flex items-center gap-1.5 mt-auto pt-1 pb-1 z-10">
            <IconBtn icon={Sofa} onClick={() => handleAction('pos')}
              tooltip="POS / Order"
              className="bg-amber-600 text-white hover:bg-amber-500 shadow-md hover:shadow-amber-500/25" />
            <IconBtn icon={LogOut} onClick={() => handleAction('checkout')}
              tooltip="Check Out"
              className={cn(cfg?.iconStyle, 'bg-white/80 dark:bg-gray-900/80 ring-1 ring-inset ring-red-200/50 dark:ring-red-700/30')} />
            <div className="relative group/actions">
              <IconBtn icon={MoreHorizontal} onClick={() => {}}
                tooltip="More actions"
                className="bg-white/80 dark:bg-gray-900/80 text-muted-foreground hover:bg-muted ring-1 ring-inset ring-border" />
              <div className="absolute right-0 top-full mt-1 z-30 hidden group-hover/actions:block hover:block">
                <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm shadow-xl p-1.5 min-w-[130px] space-y-0.5">
                  <button onClick={() => handleAction('view')}
                    className="flex items-center gap-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                  <button onClick={() => handleAction('extend')}
                    className="flex items-center gap-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                    <CalendarDays className="h-3.5 w-3.5" /> Extend
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Active ping indicator */}
          <span className="absolute top-2 right-2 flex h-3 w-3 z-10">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500/50 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 ring-2 ring-white dark:ring-gray-900" />
          </span>
        </div>
        <StatusBadge status={room.status} />
      </motion.div>
    )
  }

  // ── Cleaning ──────────────────────────────────────────────
  if (isCleaning) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="flex flex-col items-center gap-2"
      >
        <div className={cn(tileBase, 'relative')}>
          <div className="absolute -top-3 -right-3 h-16 w-16 rounded-full bg-orange-500/5 dark:bg-orange-400/5 blur-xl" />

          <span className="text-2xl font-black text-foreground tracking-tight z-10">{roomNumber}</span>
          <span className="text-[9px] font-medium text-orange-600/80 dark:text-orange-400/80 uppercase tracking-wider z-10">Cleaning</span>

          <div className="mt-auto pt-1 pb-1 z-10">
            <IconBtn icon={Sparkles} onClick={() => handleAction('markavailable')}
              tooltip="Mark Available"
              className="bg-orange-500 text-white hover:bg-orange-400 shadow-md hover:shadow-orange-500/25" />
          </div>
        </div>
        <StatusBadge status={room.status} />
      </motion.div>
    )
  }

  // ── Maintenance ───────────────────────────────────────────
  if (isMaintenance) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="flex flex-col items-center gap-2 opacity-70 hover:opacity-100 transition-opacity"
      >
        <div className={cn(tileBase, 'relative')}>
          <span className="text-2xl font-black text-muted-foreground tracking-tight line-through decoration-muted-foreground/30 z-10">
            {roomNumber}
          </span>
          <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider z-10">Out of Service</span>

          <div className="mt-auto pt-1 pb-1 z-10">
            <IconBtn icon={Wrench} onClick={() => handleAction('completemaintenance')}
              tooltip="Complete Maintenance"
              className="bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 ring-1 ring-inset ring-gray-300/50 dark:ring-gray-700/50" />
          </div>
        </div>
        <StatusBadge status={room.status} />
      </motion.div>
    )
  }

  // ── Fallback ──────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex flex-col items-center gap-2"
    >
      <div className="w-full aspect-square rounded-2xl border-2 border-border bg-gradient-to-br from-muted/50 to-card flex items-center justify-center">
        <span className="text-2xl font-black text-foreground tracking-tight">{roomNumber}</span>
      </div>
      <StatusBadge status={room.status} />
    </motion.div>
  )
}
