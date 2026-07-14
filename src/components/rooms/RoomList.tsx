import { LogIn, LogOut, CalendarCheck, Eye, X, CheckCircle2, Wrench } from 'lucide-react';
import type { Room, Booking } from '../../types';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PaymentMethodBadge } from '@/components/PaymentMethodBadge';
import { getActiveBooking } from './room.utils';

interface RoomListProps {
  rooms: Room[];
  bookings?: Booking[];
  isLoading?: boolean;
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

export function RoomList({ rooms, bookings, isLoading, onView, onCheckIn, onCheckOut, onCreateBooking, onCancelReservation, onMarkClean, onMarkAvailable, onEditRoom }: RoomListProps) {
  if (rooms.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No rooms found</p>
      </div>
    );
  }

  return (
    <Skeleton name="room-list" loading={!!isLoading}>
      <div className="space-y-2">
        {rooms.map((room: Room) => {
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

          return (
            <div key={room.id} className={`flex items-center justify-between rounded-lg border bg-card px-4 py-3 hover:bg-accent/50 transition-colors group ${style.border}`}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{room.room_number}</span>
                    <span className="text-xs text-muted-foreground">{room.room_types?.name}</span>
                  </div>
                  {activeBooking && (
                    <div className="text-xs text-muted-foreground truncate">
                      {activeBooking.guest_name}
                      {activeBooking.payment_method && (
                        <span className="ml-1.5">
                          <PaymentMethodBadge method={activeBooking.payment_method} size="sm" dotOnly />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={style.badge as 'outline' | 'secondary' | 'default' | 'destructive'} className="text-[10px] hidden sm:inline-flex">{style.label}</Badge>

                {room.status === 'available' && onCreateBooking && (
                  <button type="button" onClick={() => onCreateBooking(room)} className="rounded p-1.5 text-primary hover:bg-accent transition-colors" title="Book Room">
                    <CalendarCheck className="h-4 w-4" />
                  </button>
                )}

                {room.status === 'reserved' && activeBooking && (
                  <>
                    {onCheckIn && (
                      <button type="button" onClick={() => onCheckIn(activeBooking)} className="rounded p-1.5 text-primary hover:bg-accent transition-colors" title="Check In">
                        <LogIn className="h-4 w-4" />
                      </button>
                    )}
                    {onCancelReservation && (
                      <button type="button" onClick={() => onCancelReservation(activeBooking)} className="rounded p-1.5 text-destructive hover:bg-accent transition-colors" title="Cancel Reservation">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}

                {room.status === 'occupied' && activeBooking && (
                  <>
                    {onCheckOut && (
                      <button type="button" onClick={() => onCheckOut(activeBooking)} className="rounded p-1.5 text-orange-600 hover:bg-accent transition-colors" title="Check Out">
                        <LogOut className="h-4 w-4" />
                      </button>
                    )}
                    {onView && (
                      <button type="button" onClick={() => onView(room)} className="rounded p-1.5 text-muted-foreground hover:bg-accent transition-colors" title="View Details">
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}

                {room.status === 'cleaning' && onMarkClean && (
                  <button type="button" onClick={() => onMarkClean(room)} className="rounded p-1.5 text-emerald-600 hover:bg-accent transition-colors" title="Mark Clean">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}

                {room.status === 'maintenance' && onMarkAvailable && (
                  <button type="button" onClick={() => onMarkAvailable(room)} className="rounded p-1.5 text-emerald-600 hover:bg-accent transition-colors" title="Mark Available">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}

                {(room.status === 'available' || room.status === 'cleaning' || room.status === 'maintenance') && onEditRoom && (
                  <button type="button" onClick={() => onEditRoom(room)} className="rounded p-1.5 text-muted-foreground hover:bg-accent transition-colors" title="Edit Room">
                    <Wrench className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Skeleton>
  );
}
