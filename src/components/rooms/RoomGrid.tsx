import type { Room, Booking } from '../../types';
import { RoomCard } from './RoomCard';
import { Skeleton } from '@/components/ui/skeleton';

interface RoomGridProps {
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

export function RoomGrid({ rooms, bookings, isLoading, onView, onCheckIn, onCheckOut, onCreateBooking, onEditReservation, onCancelReservation, onMarkClean, onMarkAvailable, onEditRoom }: RoomGridProps) {
  if (rooms.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No rooms found</p>
      </div>
    );
  }

  return (
    <Skeleton name="room-grid" loading={!!isLoading}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            bookings={bookings}
            onView={onView}
            onCheckIn={onCheckIn}
            onCheckOut={onCheckOut}
            onCreateBooking={onCreateBooking}
            onEditReservation={onEditReservation}
            onCancelReservation={onCancelReservation}
            onMarkClean={onMarkClean}
            onMarkAvailable={onMarkAvailable}
            onEditRoom={onEditRoom}
          />
        ))}
      </div>
    </Skeleton>
  );
}
