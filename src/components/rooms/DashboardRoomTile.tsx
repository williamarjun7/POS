import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Room } from '@/types'
import type { Booking } from '@/lib/services/booking-service'
import {
  CalendarDays, CheckCircle,
  LogOut, Eye, Edit, XCircle,
  Wrench, Sparkles, MoreHorizontal,
  Hotel, ArrowRightFromLine, Sofa,
} from 'lucide-react'

// ── Status config ────────────────────────────────────────────

const STATUS: Record<string, {
  dot: string; label: string; pill: string; accent: string; border: string
}> = {
  available:    { dot: 'bg-emerald-500', label: 'Available',   pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', accent: 'border-l-emerald-500', border: 'border-emerald-200/50 dark:border-emerald-800/30' },
  vacant:       { dot: 'bg-emerald-500', label: 'Available',   pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', accent: 'border-l-emerald-500', border: 'border-emerald-200/50 dark:border-emerald-800/30' },
  occupied:     { dot: 'bg-violet-500',  label: 'Occupied',    pill: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300', accent: 'border-l-violet-500',  border: 'border-violet-200/50 dark:border-violet-800/30' },
  reserved:     { dot: 'bg-amber-500',   label: 'Reserved',    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',     accent: 'border-l-amber-500',   border: 'border-amber-200/50 dark:border-amber-800/30' },
  cleaning:     { dot: 'bg-sky-500',     label: 'Cleaning',    pill: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',             accent: 'border-l-sky-500',     border: 'border-sky-200/50 dark:border-sky-800/30' },
  dirty:        { dot: 'bg-amber-500',   label: 'Dirty',       pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',     accent: 'border-l-amber-500',   border: 'border-amber-200/50 dark:border-amber-800/30' },
  maintenance:  { dot: 'bg-orange-500',  label: 'Maintenance', pill: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300', accent: 'border-l-orange-500',  border: 'border-orange-200/50 dark:border-orange-800/30' },
  out_of_order: { dot: 'bg-red-500',     label: 'Disabled',    pill: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',             accent: 'border-l-red-500',     border: 'border-red-200/50 dark:border-red-800/30' },
}

function getStatus(status: string) {
  return STATUS[status] ?? {
    dot: 'bg-gray-400', label: status.replace(/_/g, ' '),
    pill: 'bg-muted text-muted-foreground', accent: 'border-l-muted', border: 'border-border/40',
  }
}

// ── Props ────────────────────────────────────────────────────

export interface DashboardRoomTileProps {
  room: Room
  booking?: Booking | null
  onAction: (room: Room, action: string, booking?: Booking | null) => void
}

// ── Small helpers ────────────────────────────────────────────

const anim = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 400, damping: 30 },
}

function Btn({ icon: Icon, label, onClick, variant = 'default', className }: {
  icon: React.ElementType; label: string; onClick: () => void
  variant?: 'primary' | 'default' | 'danger'
  className?: string
}) {
  const base = 'inline-flex items-center justify-center rounded-lg p-1.5 transition-all duration-150 active:scale-[0.96] select-none'
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
    default: 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
    danger:  'bg-red-500 text-white hover:bg-red-600 shadow-sm',
  }
  return (
    <button onClick={onClick} title={label} className={cn(base, styles[variant], className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
    </button>
  )
}

function MoreMenu({ items, onAction }: {
  items: { action: string; label: string; icon: React.ElementType }[]
  onAction: (action: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className={cn(
          'flex items-center justify-center rounded-lg px-1.5 py-1.5 transition-colors',
          open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        aria-label="More actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50" onClick={e => e.stopPropagation()}>
          <div className="rounded-xl border border-border/60 bg-popover shadow-xl p-1 min-w-[130px] space-y-0.5 origin-top-right">
            {items.map(item => (
              <button
                key={item.action}
                type="button"
                onClick={() => { onAction(item.action); setOpen(false) }}
                className="flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent transition-colors whitespace-nowrap"
              >
                <item.icon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Avatar({ initial, color }: { initial: string; color: string }) {
  return (
    <div className={cn('flex items-center justify-center h-6 w-6 shrink-0 rounded-full text-[10px] font-bold', color)}>
      {initial}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function DashboardRoomTile({ room, booking, onAction }: DashboardRoomTileProps) {
  const s = getStatus(room.status)
  const isAvailable = room.status === 'available' || room.status === 'vacant'
  const isReserved = room.status === 'reserved'
  const isOccupied = room.status === 'occupied'
  const isCleaning = room.status === 'cleaning' || room.status === 'dirty'
  const isMaintenance = room.status === 'maintenance' || room.status === 'out_of_order'

  const roomNumber = room.room_number || room.number || ''
  const roomType = (room as any).room_types?.name || ''
  const nightlyRate = (room as any).rate || (room as any).room_types?.rate || 0
  const guestName = room.guest || booking?.guestName || ''

  const act = (action: string) => onAction(room, action, booking)

  return (
    <motion.div {...anim} className="h-full">
      <div className={cn(
        'flex h-full flex-col rounded-xl bg-card',
        'border border-l-[3px] shadow-sm',
        'transition-all duration-200',
        'hover:shadow-md hover:-translate-y-px',
        s.accent, s.border,
      )}>

        {/* ── Header: room number + type + badge ── */}
        <div className="px-3.5 pt-3 pb-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-xl font-black text-foreground tracking-tight leading-none">{roomNumber}</span>
              {roomType && (
                <span className="text-[11px] text-muted-foreground font-medium ml-1.5 leading-none">{roomType}</span>
              )}
            </div>
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none shrink-0',
              s.pill,
            )}>
              <span className={cn('h-[5px] w-[5px] rounded-full shrink-0', s.dot)} />
              {s.label}
            </span>
          </div>
        </div>

        {/* ── Body (flex-1 pushes actions to bottom) ── */}
        <div className="px-3.5 pb-3 flex flex-col flex-1 justify-end gap-2">

          {/* AVAILABLE */}
          {isAvailable && (
            <>
              {nightlyRate > 0 && (
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    Rs. {nightlyRate.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-emerald-600/50 dark:text-emerald-400/50 font-medium">/night</span>
                </div>
              )}
              <span className="text-[11px] text-muted-foreground/50 font-medium">Ready for guest</span>
            </>
          )}

          {/* RESERVED */}
          {isReserved && (
            <>
              {(() => {
                const checkInDate = booking?.checkIn ? new Date(booking.checkIn) : null
                const today = new Date()
                const tomorrow = new Date(today.getTime() + 86400000)
                const isToday = checkInDate ? today.toDateString() === checkInDate.toDateString() : false
                const isTomorrow = checkInDate ? tomorrow.toDateString() === checkInDate.toDateString() : false
                const arrival = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : checkInDate ? checkInDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
                const initial = guestName ? guestName.charAt(0).toUpperCase() : ''
                return (
                  <>
                    {guestName && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar initial={initial} color="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground truncate">{guestName}</p>
                        </div>
                      </div>
                    )}
                    {arrival && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <CalendarDays className="h-3 w-3 text-amber-500 shrink-0" />
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">{arrival}</span>
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}

          {/* OCCUPIED */}
          {isOccupied && (
            <>
              {(() => {
                const checkIn = booking?.checkIn ? new Date(booking.checkIn) : null
                const checkOut = booking?.checkOut ? new Date(booking.checkOut) : null
                const today = new Date()
                const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
                const checkInStart = checkIn ? new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate()) : null
                const checkOutStart = checkOut ? new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate()) : null
                const totalNights = checkInStart && checkOutStart
                  ? Math.max(1, Math.round((checkOutStart.getTime() - checkInStart.getTime()) / 86400000))
                  : 0
                const nightsElapsed = checkInStart
                  ? Math.max(0, Math.floor((todayStart.getTime() - checkInStart.getTime()) / 86400000))
                  : 0
                const nightsLeft = Math.max(0, totalNights - nightsElapsed)
                const isLastNight = nightsLeft <= 1 && totalNights > 0 && nightsElapsed < totalNights
                const isOverdue = checkOutStart && todayStart > checkOutStart
                const initial = guestName ? guestName.charAt(0).toUpperCase() : ''
                const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const dateLabel = checkIn && checkOut ? `${fmt(checkIn)} – ${fmt(checkOut)}` : ''
                const charge = booking?.totalAmount

                const nightText = totalNights === 1
                  ? '1 Night'
                  : nightsLeft > 0
                    ? `${nightsLeft} Night${nightsLeft === 1 ? '' : 's'} left`
                    : `${totalNights} Night${totalNights === 1 ? '' : 's'}`

                const avatarColor = isOverdue
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                  : isLastNight
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                  : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'

                return (
                  <>
                    {/* Guest */}
                    {guestName && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar initial={initial} color={avatarColor} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground truncate">{guestName}</p>
                        </div>
                      </div>
                    )}

                    {/* Dates */}
                    {dateLabel && (
                      <span className="text-[11px] text-muted-foreground truncate">{dateLabel}</span>
                    )}

                    {/* Nights + charge */}
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                        isOverdue ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                          : isLastNight ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                          : 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400',
                      )}>
                        {isOverdue ? 'Overdue' : nightText}
                      </span>
                      {charge != null && (
                        <span className="text-[13px] font-black text-foreground tabular-nums">Rs. {charge.toLocaleString()}</span>
                      )}
                    </div>

                    {/* Progress (multi-night only) */}
                    {totalNights > 1 && (
                      <div className="h-[3px] rounded-full bg-muted/30 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, Math.max((nightsElapsed / totalNights) * 100, 5))}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className={cn(
                            'h-full rounded-full',
                            isOverdue ? 'bg-red-500' : isLastNight ? 'bg-amber-500' : 'bg-violet-500',
                          )}
                        />
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}

          {/* CLEANING */}
          {isCleaning && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">Housekeeping in progress</span>
            </div>
          )}

          {/* MAINTENANCE */}
          {isMaintenance && (
            <div className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400">
                {room.status === 'maintenance' ? 'Under maintenance' : 'Room disabled'}
              </span>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="px-3 py-2 border-t border-border/30 bg-muted/20 rounded-b-xl">
          {isAvailable && (
            <div className="flex items-center justify-center gap-1.5">
              <Btn icon={CalendarDays} label="Reserve" onClick={() => act('reserve')} />
              <Btn icon={Hotel} label="Book Now" onClick={() => act('book')} variant="primary" />
            </div>
          )}
          {isReserved && (
            <div className="flex items-center justify-center gap-1.5">
              <Btn icon={ArrowRightFromLine} label="Check In" onClick={() => act('checkin')} variant="primary" />
              <Btn icon={XCircle} label="Cancel" onClick={() => act('cancel')} />
              <MoreMenu items={[
                { action: 'view', label: 'View Details', icon: Eye },
                { action: 'edit', label: 'Edit Booking', icon: Edit },
              ]} onAction={act} />
            </div>
          )}
          {isOccupied && (
            <div className="flex items-center justify-center gap-1.5">
              <Btn icon={Sofa} label="POS" onClick={() => act('pos')} variant="primary" />
              <Btn icon={LogOut} label="Checkout" onClick={() => act('checkout')} />
              <MoreMenu items={[
                { action: 'view', label: 'View', icon: Eye },
                { action: 'extend', label: 'Extend', icon: CalendarDays },
                { action: 'edit', label: 'Edit', icon: Edit },
                { action: 'sendtocleaning', label: 'Send to Cleaning', icon: Sparkles },
                { action: 'sendtomaintenance', label: 'Send to Maintenance', icon: Wrench },
                { action: 'release', label: 'Release', icon: LogOut },
              ]} onAction={act} />
            </div>
          )}
          {isCleaning && (
            <div className="flex items-center justify-center">
              <Btn icon={Sparkles} label="Mark Clean" onClick={() => act('markavailable')} variant="primary" />
            </div>
          )}
          {isMaintenance && (
            <div className="flex items-center justify-center">
              <Btn icon={CheckCircle} label="Mark Available" onClick={() => act('completemaintenance')} />
            </div>
          )}
        </div>

      </div>
    </motion.div>
  )
}
