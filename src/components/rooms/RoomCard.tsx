import { LogIn, LogOut, CalendarCheck, Eye, X, CheckCircle2, Wrench, Pencil } from 'lucide-react';
import type { Room, Booking } from '../../types';
import { Badge } from '../../components/ui/badge';
import { PaymentMethodBadge } from '@/components/PaymentMethodBadge';
import { getActiveBooking, formatDate } from './room.utils';

interface RoomCardProps {
  room: Room;
  bookings?: Booking[];
  onView?: (room: Room) => void;
  onCheckIn?: (booking: Booking) => void;
  onCheckOut?: (booking: Booking) => void;
  onCreateBooking?: (room: Room) => void;
  onEditReservation?: (booking: Booking) => void;
  onCancelReservation?: (booking: Booking) => void;
  onMarkClean?: (room: Room) => void;
  onMarkAvailable?: (room: Room) => void;
  onEditRoom?: (room: Room) => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function RoomCard({ room, bookings, onView, onCheckIn, onCheckOut, onCreateBooking, onEditReservation, onCancelReservation, onMarkClean, onMarkAvailable, onEditRoom }: RoomCardProps) {
  const roomStyles: Record<string, { bg: string; border: string; dot: string; badge: string; label: string }> = {
    available: { bg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10', border: 'border-emerald-200 dark:border-emerald-900/30', dot: 'bg-emerald-500', badge: 'outline', label: 'Available' },
    reserved: { bg: 'hover:bg-blue-50/50 dark:hover:bg-blue-950/10', border: 'border-blue-200 dark:border-blue-900/30', dot: 'bg-blue-500', badge: 'secondary', label: 'Reserved' },
    occupied: { bg: 'hover:bg-orange-50/50 dark:hover:bg-orange-950/10', border: 'border-orange-200 dark:border-orange-900/30', dot: 'bg-orange-500', badge: 'default', label: 'Occupied' },
    cleaning: { bg: 'hover:bg-cyan-50/50 dark:hover:bg-cyan-950/10', border: 'border-cyan-200 dark:border-cyan-900/30', dot: 'bg-cyan-500', badge: 'outline', label: 'Cleaning' },
    maintenance: { bg: 'hover:bg-red-50/50 dark:hover:bg-red-950/10', border: 'border-red-200 dark:border-red-900/30', dot: 'bg-red-500', badge: 'destructive', label: 'Maintenance' },
    partial_paid: { bg: 'hover:bg-amber-50/50 dark:hover:bg-amber-950/10', border: 'border-amber-200 dark:border-amber-900/30', dot: 'bg-amber-500', badge: 'secondary', label: 'Partial Paid' },
    fully_paid: { bg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10', border: 'border-emerald-200 dark:border-emerald-900/30', dot: 'bg-emerald-500', badge: 'default', label: 'Fully Paid' },
  }
  const style = roomStyles[room.status] ?? roomStyles.available;
  const activeBooking = getActiveBooking(room.id, bookings);

  const renderGuestInfo = () => {
    if (!activeBooking) return null;
    return (
      <div className="space-y-1.5 px-3 pb-3">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span className="text-muted-foreground">Guest:</span>
          <span>{activeBooking.guest_name}</span>
        </div>
        <DetailRow label={room.status === 'reserved' ? 'Arrival' : 'Check-in'} value={formatDate(activeBooking.check_in)} />
        {room.status === 'occupied' && <DetailRow label="Check-out" value={formatDate(activeBooking.check_out)} />}
        {activeBooking.payment_method && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">Payment:</span>
            <PaymentMethodBadge method={activeBooking.payment_method} size="sm" />
            <Badge variant={'outline'} className="text-[10px] px-1.5 py-0">
              {activeBooking.payment_status ?? 'Pending'}
            </Badge>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border-2 transition-all hover:shadow-sm ${style.bg} ${style.border}`}>
      <div className="flex flex-col items-center p-3 pb-2 text-center">
        <span className="text-lg font-bold">{room.room_number}</span>
        <span className="text-[10px] text-muted-foreground">{room.room_types?.name ?? 'Room'}</span>
        <Badge variant={style.badge as 'outline' | 'secondary' | 'default' | 'destructive'} className="mt-1.5 text-[10px] uppercase tracking-wider px-2">
          {style.label}
        </Badge>
      </div>

      {(room.status === 'occupied' || room.status === 'reserved') && renderGuestInfo()}

      <div className="mt-auto border-t border-border" />

      <div className="flex divide-x divide-inherit">
        {room.status === 'available' && onCreateBooking && (
          <button type="button" onClick={() => onCreateBooking(room)}
            className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <CalendarCheck className="h-3.5 w-3.5" /> Book Room
          </button>
        )}

        {room.status === 'reserved' && activeBooking && (
          <>
            {onCheckIn && (
              <button type="button" onClick={() => onCheckIn(activeBooking)}
                className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <LogIn className="h-3.5 w-3.5" /> Check In
              </button>
            )}
            {onEditReservation && (
              <button type="button" onClick={() => onEditReservation(activeBooking)}
                className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {onCancelReservation && (
              <button type="button" onClick={() => onCancelReservation(activeBooking)}
                className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-destructive hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
          </>
        )}

        {room.status === 'occupied' && activeBooking && (
          <>
            {onView && (
              <button type="button" onClick={() => onView(room)}
                className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <Eye className="h-3.5 w-3.5" /> View
              </button>
            )}
            {onCheckOut && (
              <button type="button" onClick={() => onCheckOut(activeBooking)}
                className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-orange-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <LogOut className="h-3.5 w-3.5" /> Check Out
              </button>
            )}
          </>
        )}

        {room.status === 'cleaning' && onMarkClean && (
          <button type="button" onClick={() => onMarkClean(room)}
            className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-emerald-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Clean
          </button>
        )}

        {room.status === 'maintenance' && onMarkAvailable && (
          <button type="button" onClick={() => onMarkAvailable(room)}
            className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-emerald-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Available
          </button>
        )}

        {(room.status === 'available' || room.status === 'cleaning' || room.status === 'maintenance') && onEditRoom && (
          <button type="button" onClick={() => onEditRoom(room)}
            className="flex-1 flex items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-semibold text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <Wrench className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>
    </div>
  );
}
