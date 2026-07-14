/**
 * BookingService
 * ──────────────
 * DB-backed CRUD for room bookings with business rules:
 * - Cancel: only confirmed/pending bookings can be cancelled; frees the room
 * - Archive: marks booking as archived (hidden from active views)
 * - Delete: only cancelled/checked_out bookings can be deleted
 *
 * Table: public.bookings
 * RLS: authenticated users can SELECT, INSERT, UPDATE
 */

import { useState, useEffect, useCallback } from 'react';
import { insforge } from '@/lib/services/auth-service';
import type { BookingRow } from '@/lib/db/types';

/* ─── Frontend types ───────────────────────────────────────── */

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

export interface Booking {
  id: string;
  bookingNumber: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomId: string;
  roomNumber?: string;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
  isArchived: boolean;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  specialRequests: string;
  adults: number;
  children: number;
  createdAt: string;
}

/* ─── Mapper helper ────────────────────────────────────────── */

function rowToBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    bookingNumber: row.booking_number ?? `BK-${row.id.slice(0, 8).toUpperCase()}`,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    roomId: row.room_id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.status as BookingStatus,
    isArchived: false, // not in DB schema — we'll use a filter
    totalAmount: Number(row.total_amount),
    paidAmount: Number(row.paid_amount),
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method ?? '',
    specialRequests: row.special_requests ?? '',
    adults: row.adults ?? 1,
    children: row.children ?? 0,
    createdAt: row.created_at,
  };
}

export interface NewBookingData {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status?: BookingStatus;
  totalAmount: number;
  paidAmount?: number;
  paymentMethod?: string;
  specialRequests?: string;
  adults?: number;
  children?: number;
}

/* ─── Business rules ──────────────────────────────────────── */

const CANCELLABLE_STATUSES: BookingStatus[] = ['pending', 'confirmed'];
const DELETABLE_STATUSES: BookingStatus[] = ['cancelled', 'checked_out'];
const ACTIVE_STATUSES: BookingStatus[] = ['confirmed', 'checked_in'];

/* ─── DB operations ─────────────────────────────────────────── */

async function fetchBookingsFromDb(includeArchived = false): Promise<Booking[]> {
  const query = insforge.database
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (!includeArchived) {
    // Exclude archived bookings (we filter by excluding old checked_out/cancelled beyond a threshold)
    // For now, show all with a filter on the frontend
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToBooking(row as BookingRow));
}

async function fetchBookingFromDb(id: string): Promise<Booking | null> {
  const { data, error } = await insforge.database
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data ? rowToBooking(data as BookingRow) : null;
}

async function createBookingInDb(data: NewBookingData): Promise<Booking> {
  const { data: inserted, error } = await insforge.database
    .from('bookings')
    .insert([
      {
        guest_name: data.guestName,
        guest_email: data.guestEmail,
        guest_phone: data.guestPhone,
        room_id: data.roomId,
        check_in: data.checkIn,
        check_out: data.checkOut,
        status: data.status ?? 'confirmed',
        total_amount: data.totalAmount,
        paid_amount: data.paidAmount ?? 0,
        payment_method: data.paymentMethod ?? null,
        special_requests: data.specialRequests ?? null,
        adults: data.adults ?? 1,
        children: data.children ?? 0,
        payment_status: data.paidAmount && data.paidAmount > 0 ? 'partial' : 'pending',
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return rowToBooking(inserted as BookingRow);
}

/**
 * Cancel a booking.
 * Business rule: Only pending or confirmed bookings can be cancelled.
 * Side effect: Room status is reset to 'vacant'.
 */
async function cancelBookingInDb(id: string): Promise<Booking> {
  // Fetch booking first to validate it's cancellable
  const booking = await fetchBookingFromDb(id);
  if (!booking) throw new Error('Booking not found');
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    throw new Error(
      `Cannot cancel a ${booking.status} booking. Only pending or confirmed bookings can be cancelled.`,
    );
  }

  // Update booking status
  const { data: updated, error } = await insforge.database
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;    // Free the room (fire-and-forget — non-critical for booking cancellation)
  try {
    await insforge.database
      .from('rooms')
      .update({ status: 'vacant' })
      .eq('id', booking.roomId);
  } catch (err) {
    console.warn('[Booking] Failed to free room after cancellation:', err instanceof Error ? err.message : err)
  }

  return rowToBooking(updated as BookingRow);
}

/**
 * Archive a booking (soft-hide from active views).
 * Archived bookings are checked_out/cancelled and no longer relevant.
 *
 * Note: This marks the booking as archived in local state only. To persist
 * across refreshes, add an `is_archived` column to the bookings table.
 */
async function archiveBookingInDb(id: string): Promise<Booking> {
  const booking = await fetchBookingFromDb(id);
  if (!booking) throw new Error('Booking not found');

  if (ACTIVE_STATUSES.includes(booking.status)) {
    throw new Error('Cannot archive an active booking. Cancel or check out the guest first.');
  }

  return booking;
}

/**
 * Delete a booking permanently from the database.
 * Business rule: Only cancelled or checked_out bookings can be deleted.
 */
async function deleteBookingFromDb(id: string): Promise<void> {
  const booking = await fetchBookingFromDb(id);
  if (!booking) throw new Error('Booking not found');

  if (!DELETABLE_STATUSES.includes(booking.status)) {
    throw new Error(
      `Cannot delete a ${booking.status} booking. Only cancelled or checked-out bookings can be deleted. ` +
      `Please cancel the booking first.`,
    );
  }

  const { error } = await insforge.database
    .from('bookings')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Update booking details (check-in/out, guest info, etc.)
 */
async function updateBookingInDb(id: string, data: Partial<NewBookingData>): Promise<Booking> {
  const payload: Record<string, unknown> = {};
  if (data.guestName !== undefined) payload.guest_name = data.guestName;
  if (data.guestEmail !== undefined) payload.guest_email = data.guestEmail;
  if (data.guestPhone !== undefined) payload.guest_phone = data.guestPhone;
  if (data.checkIn !== undefined) payload.check_in = data.checkIn;
  if (data.checkOut !== undefined) payload.check_out = data.checkOut;
  if (data.totalAmount !== undefined) payload.total_amount = data.totalAmount;
  if (data.paidAmount !== undefined) payload.paid_amount = data.paidAmount;
  if (data.paymentMethod !== undefined) payload.payment_method = data.paymentMethod;
  if (data.specialRequests !== undefined) payload.special_requests = data.specialRequests;
  if (data.adults !== undefined) payload.adults = data.adults;
  if (data.children !== undefined) payload.children = data.children;

  const { data: updated, error } = await insforge.database
    .from('bookings')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToBooking(updated as BookingRow);
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UseBookingsReturn {
  /** All bookings (from DB), most recent first */
  bookings: Booking[];
  /** Only active bookings (confirmed or checked_in) */
  activeBookings: Booking[];
  /** True while loading from DB */
  isLoading: boolean;
  /** Error message if load failed */
  loadError: string | null;
  /** Create a new booking */
  createBooking: (data: NewBookingData) => Promise<Booking>;
  /** Cancel a booking (validates business rules) */
  cancelBooking: (id: string) => Promise<Booking>;
  /** Archive a booking (soft-hide from active views) */
  archiveBooking: (id: string) => Promise<Booking>;
  /** Delete a booking permanently (validates business rules) */
  deleteBooking: (id: string) => Promise<void>;
  /** Update booking details */
  updateBooking: (id: string, data: Partial<NewBookingData>) => Promise<Booking>;
  /** Refetch from DB */
  refresh: () => Promise<void>;
}

export function useBookings(): UseBookingsReturn {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeBookings = bookings.filter(b => ACTIVE_STATUSES.includes(b.status));

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchBookingsFromDb();
      setBookings(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load bookings';
      setLoadError(msg);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchBookingsFromDb();
        if (!cancelled) setBookings(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load bookings');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const createBooking = useCallback(async (data: NewBookingData): Promise<Booking> => {
    const created = await createBookingInDb(data);
    setBookings(prev => [created, ...prev]);
    return created;
  }, []);

  const cancelBooking = useCallback(async (id: string): Promise<Booking> => {
    const updated = await cancelBookingInDb(id);
    setBookings(prev => prev.map(b => b.id === id ? updated : b));
    return updated;
  }, []);

  const archiveBooking = useCallback(async (id: string): Promise<Booking> => {
    const updated = await archiveBookingInDb(id);
    setBookings(prev => prev.map(b => b.id === id ? { ...b, isArchived: true } : b));
    return updated;
  }, []);

  const deleteBooking = useCallback(async (id: string) => {
    await deleteBookingFromDb(id);
    setBookings(prev => prev.filter(b => b.id !== id));
  }, []);

  const updateBooking = useCallback(async (id: string, data: Partial<NewBookingData>): Promise<Booking> => {
    const updated = await updateBookingInDb(id, data);
    setBookings(prev => prev.map(b => b.id === id ? updated : b));
    return updated;
  }, []);

  return {
    bookings,
    activeBookings,
    isLoading,
    loadError,
    createBooking,
    cancelBooking,
    archiveBooking,
    deleteBooking,
    updateBooking,
    refresh,
  };
}

/* ─── Standalone helpers ────────────────────────────────────── */

export { CANCELLABLE_STATUSES, DELETABLE_STATUSES, ACTIVE_STATUSES };

export function canCancelBooking(status: BookingStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

export function canDeleteBooking(status: BookingStatus): boolean {
  return DELETABLE_STATUSES.includes(status);
}

export function isActiveBooking(status: BookingStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}
