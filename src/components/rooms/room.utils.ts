import type { Booking } from '../../types';


export function getActiveBooking(roomId: string, bookings?: Booking[]): Booking | undefined {
  if (!bookings) return undefined;
  return bookings.find(
    (b) => b.room_id === roomId && (b.status === 'checked_in' || b.status === 'confirmed')
  );
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
