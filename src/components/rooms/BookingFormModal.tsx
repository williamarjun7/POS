import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  X, User, Mail, Phone, CalendarDays, CalendarRange,
  CreditCard, FileText, Ban, Archive, Trash2,
  Loader2,
} from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast';
import { formatCurrency, cn } from '@/lib/utils';
import { FormInput, FormSelect, FormTextarea } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  useBookings,
  canCancelBooking,
  canDeleteBooking,
  type Booking,
  type BookingStatus,
  type NewBookingData,
} from '@/lib/services/booking-service';
import { BookingPaymentModal } from './BookingPaymentModal';
import { PosPaymentDialog, type PaymentResult } from '@/components/payments';
import { processPaymentWithRecovery } from '@/lib/services/unified-payment-service';
import { getNextInvoiceNumber } from '@/lib/services/sequence-service';
import { logActivitySafe } from '@/lib/services/activity-log-service';
import { insforge } from '@/lib/services/auth-service';
import { db } from '@/lib/db/insforge';
import type { Room } from '@/types';


type BookingMode = 'reserve' | 'book' | 'manage';

interface BookingFormModalProps {
  room: Room;
  /** Optional existing booking to edit/manage */
  booking?: Booking | null;
  /** Whether this is a future reservation or immediate check-in */
  mode?: BookingMode;
  onClose: () => void;
}

export function BookingFormModal({ room, booking, mode = 'reserve', onClose }: BookingFormModalProps) {
  const { createBooking, cancelBooking, archiveBooking, deleteBooking, updateBooking } = useBookings();

  const isExisting = !!booking;
  const isBookMode = mode === 'book';
  const defaultCheckIn = booking?.checkIn ?? isBookMode
    ? new Date().toISOString().split('T')[0]
    : new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const defaultCheckOut = booking?.checkOut ?? new Date(Date.now() + (isBookMode ? 1 : 2) * 86400000).toISOString().split('T')[0];
  const nightlyRate = room.price || room.pricePerNight || 0;

  // ── Form state ─────────────────────────────────────────────
  const [guestName, setGuestName] = useState(booking?.guestName ?? '');
  const [email, setEmail] = useState(booking?.guestEmail ?? '');
  const [phone, setPhone] = useState(booking?.guestPhone ?? '');
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [idType, setIdType] = useState(booking?.idType ?? 'citizenship');
  const [idNumber, setIdNumber] = useState(booking?.idNumber ?? '');
  const [paymentMethod, setPaymentMethod] = useState(booking?.paymentMethod ?? 'cash');
  const [notes, setNotes] = useState(booking?.specialRequests ?? '');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Payment decision state ─────────────────────────────────
  const [showPaymentDecision, setShowPaymentDecision] = useState(false);
  const [pendingBookingData, setPendingBookingData] = useState<NewBookingData | null>(null);
  const [showPosPayment, setShowPosPayment] = useState(false);
  // Separate flag to launch PosPaymentDialog after BookingPaymentModal closes
  const [launchPayment, setLaunchPayment] = useState(false);

  // ── Confirm dialog state ───────────────────────────────────
  const [confirmAction, setConfirmAction] = useState<{
    type: 'cancel' | 'archive' | 'delete';
    title: string;
    message: string;
  } | null>(null);

  // ── Computed ───────────────────────────────────────────────
  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [checkIn, checkOut]);

  const subtotal = nightlyRate * nights;
  const total = Math.max(0, subtotal - discount);

  const roomLabel = room.room_number || room.number;
  const roomTypeLabel = room.room_types?.name || room.type || 'Room';

  const bookingStatus = booking?.status as BookingStatus | undefined;
  const canCancel = booking ? canCancelBooking(bookingStatus ?? 'confirmed') : false;
  const canDelete = booking ? canDeleteBooking(bookingStatus ?? 'cancelled') : false;
  const isActive = bookingStatus === 'confirmed' || bookingStatus === 'checked_in';

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20' },
    confirmed: { label: 'Confirmed', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' },
    checked_in: { label: 'Checked In', color: 'text-green-600 bg-green-50 dark:bg-green-950/20' },
    checked_out: { label: 'Checked Out', color: 'text-gray-600 bg-gray-50 dark:bg-gray-950/20' },
    cancelled: { label: 'Cancelled', color: 'text-red-600 bg-red-50 dark:bg-red-950/20' },
  };

  const idOptions = [
    { value: 'citizenship', label: 'Citizenship' },
    { value: 'passport', label: 'Passport' },
    { value: 'driving_license', label: "Driver's License" },
    { value: 'voter_id', label: 'Voter ID' },
    { value: 'other', label: 'Other' },
  ];

  // ── Handlers ───────────────────────────────────────────────

  /** Build booking data from current form state */
  const buildBookingData = useCallback((): NewBookingData => ({
    guestName: guestName.trim(),
    guestEmail: email.trim(),
    guestPhone: phone.trim(),
    roomId: room.id,
    checkIn,
    checkOut,
    totalAmount: total,
    paidAmount: 0,
    discount,
    paymentMethod: 'cash',
    specialRequests: notes.trim() || undefined,
    adults,
    children,
    idType: idType || undefined,
    idNumber: idNumber || undefined,
  }), [guestName, email, phone, room.id, checkIn, checkOut, total, discount, notes, adults, children, idType, idNumber]);

  /** Create the booking record and update room status */
  const persistBooking = useCallback(async (data: NewBookingData, paidAmount: number) => {
    const bookingData = {
      ...data,
      paidAmount,
      paymentStatus: paidAmount > 0 ? 'partial' as const : 'pending' as const,
    }
    const created = await createBooking(bookingData)

    const roomStatus = isBookMode ? 'occupied' : 'reserved'
    await db.update('rooms', { status: roomStatus }, { id: room.id })

    return created
  }, [createBooking, isBookMode, room.id])

  /** Handle form submission — show payment decision instead of creating booking */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) { setNameError('Guest name is required'); return; }
    if (!phone.trim()) { setPhoneError('Phone number is required'); return; }
    if (nights <= 0) { showError('Check-out must be after check-in'); return; }

    // Save form data and show payment decision modal
    const data = buildBookingData()
    setPendingBookingData(data)
    setShowPaymentDecision(true)
  };

  // Effect: launch PosPaymentDialog after BookingPaymentModal unmounts (avoids z-index conflict)
  useEffect(() => {
    if (launchPayment) {
      setShowPosPayment(true)
      setLaunchPayment(false)
    }
  }, [launchPayment])

  /** Handle "Pay Now" — close decision modal, launch global payment dialog */
  const handlePayNow = useCallback(() => {
    if (!pendingBookingData) return
    // Close the payment decision modal FIRST so it doesn't block PosPaymentDialog (z-index issue)
    setShowPaymentDecision(false)
    // Effect will react to this flag and open PosPaymentDialog after unmount
    setLaunchPayment(true)
  }, [pendingBookingData])

  /**
   * Handle payment result from PosPaymentDialog.
   * Strategy to avoid orphan records:
   *   1. Process payment via unified RPC FIRST (atomic, idempotent — creates invoice + payment)
   *   2. If RPC succeeds → create booking → link booking to invoice
   *   3. If RPC fails → nothing created → NO orphan records
   */
  const handlePaymentComplete = useCallback(async (paymentResult?: PaymentResult) => {
    if (!pendingBookingData || !paymentResult) {
      setShowPosPayment(false)
      return
    }

    let paymentSucceeded = false

    try {
      // ═══ STEP 1: Process payment FIRST ═══
      // This creates the invoice + payment record atomically.
      // If this fails, NOTHING is created — no cleanup needed.
      const rpcResult = await processPaymentWithRecovery({
        tableId: '',
        customerName: pendingBookingData.guestName,
        subtotal: pendingBookingData.totalAmount,
        discount: pendingBookingData.discount ?? 0,
        total: paymentResult.grandTotal ?? pendingBookingData.totalAmount,
        invoiceStatus: 'paid',
        paymentMethod: paymentResult.paymentMethod ?? 'cash',
        paidAmount: paymentResult.paidAmount ?? pendingBookingData.totalAmount,
        userId: null,
        paidItemIds: paymentResult.paidItemIds ?? [],
        itemPaidStatus: 'paid',
        batchIds: [],
        orderBatchIds: [],
        notes: `Booking payment — Room ${roomLabel} (${pendingBookingData.guestName})`,
        sourcePage: 'booking',
        paymentReference: `BK-${crypto.randomUUID()}`,
      })

      if (!rpcResult.success) {
        throw new Error(rpcResult.error || 'Payment processing failed')
      }

      // ═══ Payment succeeded flag (used in catch for correct error message) ═══
      paymentSucceeded = true
      const rpcInvoiceId = rpcResult.invoiceId
      const rpcPaymentRef = rpcResult.paymentReference

      // ═══ STEP 2: Payment succeeded — now create booking ═══
      const createdBooking = await persistBooking(pendingBookingData, paymentResult.paidAmount ?? pendingBookingData.totalAmount)

      // ═══ STEP 3: Link booking to invoice (non-critical, fire-and-forget) ═══
      if (rpcInvoiceId) {
        // Link invoice to booking
        await insforge.database
          .from('invoices')
          .update({ booking_id: createdBooking.id } as any)
          .eq('id', rpcInvoiceId)
          .catch(() => {})

        // Insert invoice items for the room charge
        const nightsCalc = nights
        const nightlyRateCalc = room.price || room.pricePerNight || 0
        db.insertMany('invoice_items', [{
          invoice_id: rpcInvoiceId,
          name: `Room ${roomLabel} — ${nightsCalc} night${nightsCalc !== 1 ? 's' : ''}`,
          quantity: nightsCalc,
          unit_price: nightlyRateCalc,
          total_price: pendingBookingData.totalAmount,
        }]).catch(() => {})

        // Link payment to booking
        await insforge.database
          .from('payments')
          .update({ booking_id: createdBooking.id } as any)
          .eq('payment_reference', rpcPaymentRef)
          .catch(() => {})
      }

      showSuccess(`${pendingBookingData.guestName} booked in — Room ${roomLabel} (${formatCurrency(pendingBookingData.totalAmount)} via ${paymentResult.paymentMethod ?? 'payment'})`)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed'

      if (paymentSucceeded) {
        // Payment went through but booking creation failed → orphan invoice exists
        // Log it and show clear error message so cashier can recover manually
        console.error('[Booking] Payment succeeded but booking creation failed:', {
          error: message,
          guestName: pendingBookingData.guestName,
          roomLabel,
          total: pendingBookingData.totalAmount,
        })
        showError(`Payment was processed but booking creation failed: ${message}. Please check invoices and contact support.`)
      } else {
        // Booking was NOT created (payment failed or exception before persistBooking)
        showError(`Payment failed: ${message}. No records were created. You may retry.`)
      }
    } finally {
      setShowPosPayment(false)
      setShowPaymentDecision(false)
      setPendingBookingData(null)
    }
  }, [pendingBookingData, room, roomLabel, nights, persistBooking, onClose])

  /** Handle "Pay at Checkout" — create booking with unpaid invoice */
  const handlePayLater = useCallback(async () => {
    if (!pendingBookingData) return
    setSaving(true)

    try {
      // 1. Create booking with pending payment status
      const createdBooking = await persistBooking(pendingBookingData, 0)

      // 2. Create an unpaid accommodation invoice for room charges
      const invNumber = await getNextInvoiceNumber()
      const { data: invoiceData, error: invoiceError } = await insforge.database
        .from('invoices')
        .insert([{
          invoice_number: invNumber,
          customer_name: pendingBookingData.guestName,
          subtotal: pendingBookingData.totalAmount,
          discount: pendingBookingData.discount ?? 0,
          total: pendingBookingData.totalAmount - (pendingBookingData.discount ?? 0),
          status: 'pending',
          booking_id: createdBooking.id,
          table_id: room.id,
          due_date: pendingBookingData.checkOut,
        }] as any)
        .select()
        .single()

      if (invoiceError) throw new Error('Failed to create accommodation invoice')

      // 3. Insert invoice items for room charges
      if (invoiceData) {
        const invoiceId = (invoiceData as any).id
        const nightsCalc = nights
        const nightlyRateCalc = room.price || room.pricePerNight || 0
        await db.insertMany('invoice_items', [{
          invoice_id: invoiceId,
          name: `Room ${roomLabel} — ${nightsCalc} night${nightsCalc !== 1 ? 's' : ''}`,
          quantity: nightsCalc,
          unit_price: nightlyRateCalc,
          total_price: pendingBookingData.totalAmount,
        }]).catch(() => {})
      }

      // 4. Log activity
      logActivitySafe({
        activityType: 'booking_created',
        entityId: createdBooking.id,
        entityLabel: `Room ${roomLabel} — ${pendingBookingData.guestName}`,
        status: isBookMode ? 'occupied' : 'reserved',
        amount: pendingBookingData.totalAmount,
        details: `Pay at checkout — ${formatCurrency(pendingBookingData.totalAmount)}`,
      }).catch(() => {})

      showSuccess(`${pendingBookingData.guestName} booked in — Room ${roomLabel} (${formatCurrency(pendingBookingData.totalAmount)}). Payment at checkout.`)
      onClose()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create booking.')
    } finally {
      setSaving(false)
      setShowPaymentDecision(false)
      setPendingBookingData(null)
    }
  }, [pendingBookingData, roomLabel, isBookMode, nights, room, persistBooking, onClose])

  /** Handle cancel from payment decision */
  const handleCancelPaymentDecision = useCallback(() => {
    setShowPaymentDecision(false)
    setShowPosPayment(false)
    setPendingBookingData(null)
  }, [])

  const handleCancel = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      const updated = await cancelBooking(booking.id);
      showSuccess(`Booking for ${updated.guestName} cancelled. Room ${roomLabel} is now available.`);
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to cancel booking.');
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  };

  const handleArchive = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      await archiveBooking(booking.id);
      showSuccess('Booking archived.');
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to archive booking.');
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  };

  const handleDelete = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      await deleteBooking(booking.id);
      showSuccess('Booking deleted permanently.');
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete booking.');
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  };

  // ── Confirm dialogs ─────────────────────────────────────────

  const confirmConfigs = {
    cancel: {
      title: 'Cancel Booking',
      message: `Are you sure you want to cancel ${booking?.guestName || 'this guest'}'s booking for Room ${roomLabel}? The room will be made available again.`,
      confirmLabel: 'Cancel Booking',
      variant: 'warning' as const,
      onConfirm: handleCancel,
    },
    archive: {
      title: 'Archive Booking',
      message: `Archive this booking for Room ${roomLabel}? It will be hidden from the active bookings view.`,
      confirmLabel: 'Archive',
      variant: 'info' as const,
      onConfirm: handleArchive,
    },
    delete: {
      title: 'Delete Booking',
      message: `Permanently delete this booking for Room ${roomLabel}? This cannot be undone. Only cancelled or checked-out bookings can be deleted.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger' as const,
      onConfirm: handleDelete,
    },
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 py-8">
        <div className="w-full max-w-[min(32rem,calc(100vw-2rem))] rounded-2xl border bg-background shadow-2xl p-6 mx-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">
                  {isExisting ? 'Manage Booking' : isBookMode ? 'Book Now' : 'Reserve Room'}
                </h3>
                {isExisting && bookingStatus && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    statusLabels[bookingStatus]?.color ?? 'text-muted-foreground bg-muted',
                  )}>
                    {statusLabels[bookingStatus]?.label ?? bookingStatus}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Room {roomLabel} — {roomTypeLabel}
                <span className="text-xs"> ({formatCurrency(nightlyRate)}/night)</span>
              </p>
            </div>
            <button type="button" onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {isExisting && (
            <div className="mb-5 rounded-xl border border-blue-200 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/10 p-3">
              <div className="flex items-center gap-2 text-xs text-blue-600 mb-2">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="font-medium">Stay: {new Date(booking!.checkIn).toLocaleDateString()} → {new Date(booking!.checkOut).toLocaleDateString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Guests: {booking!.guestName}</span>
                <span>Phone: {booking!.guestPhone}</span>
                <span>Total: {formatCurrency(booking!.totalAmount)}</span>
                <span>Paid: {formatCurrency(booking!.paidAmount)}</span>
              </div>
            </div>
          )}

          <form onSubmit={isExisting ? (e) => { e.preventDefault(); } : handleCreate} className="space-y-5">
            {/* Guest Information */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <User className="h-3 w-3" /> Guest Information
              </h4>
              <div className="space-y-3">
                <FormInput
                  label="Full Name"
                  required
                  autoFocus={!isExisting}
                  value={guestName}
                  onChange={(e) => { setGuestName(e.target.value); setNameError('') }}
                  placeholder="e.g. Ram Sharma"
                  error={nameError}
                  leadingIcon={<User className="h-4 w-4" />}
                  readOnly={isExisting}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="guest@email.com"
                    leadingIcon={<Mail className="h-4 w-4" />}
                    readOnly={isExisting}
                  />
                  <FormInput
                    label="Phone"
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setPhoneError('') }}
                    placeholder="98XXXXXXXX"
                    error={phoneError}
                    leadingIcon={<Phone className="h-4 w-4" />}
                    readOnly={isExisting}
                  />
                </div>
              </div>
            </div>

            {/* Stay Details (editable only for new bookings) */}
            {!isExisting && (
              <>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" /> Stay Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="Check In" required type="date" value={checkIn}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setCheckIn(e.target.value)}
                      leadingIcon={<CalendarDays className="h-4 w-4" />} />
                    <FormInput label="Check Out" required type="date" value={checkOut}
                      min={checkIn || new Date().toISOString().split('T')[0]}
                      onChange={(e) => setCheckOut(e.target.value)}
                      leadingIcon={<CalendarRange className="h-4 w-4" />} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">Adults</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={adults}
                        onChange={(e) => setAdults(Math.max(1, parseInt(e.target.value) || 1))}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">Children</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={children}
                        onChange={(e) => setChildren(Math.max(0, parseInt(e.target.value) || 0))}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Discount */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <CreditCard className="h-3 w-3" /> Discount
                  </h4>
                  <FormInput
                    label="Discount Amount (Rs.)"
                    type="number"
                    min={0}
                    max={subtotal}
                    value={discount || ''}
                    onChange={(e) => setDiscount(Math.min(subtotal, Math.max(0, parseFloat(e.target.value) || 0)))}
                    placeholder="0"
                  />
                  <div className="mt-3">
                    <FormTextarea label="Special Requests / Notes" value={notes}
                      onChange={(e) => setNotes(e.target.value)} rows={2}
                      placeholder="Any special requests..." />
                  </div>
                </div>

                {/* Booking Summary */}
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Booking Summary</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Room</span>
                    <span className="font-medium">{roomLabel} — {roomTypeLabel}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nights</span>
                    <span className="font-medium">{nights} night{nights !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="font-medium">{formatCurrency(nightlyRate)} / night</span>
                  </div>
                  {discount > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">{formatCurrency(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount</span>
                        <span className="font-medium text-destructive">-{formatCurrency(discount)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm border-t border-border pt-2">
                    <span className="text-muted-foreground font-medium">Total</span>
                    <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
                  </div>
                </div>
              </>
            )}

            {/* ID Proof (shown for both new AND existing bookings) */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> ID Proof
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <FormSelect label="ID Type" value={idType} onChange={(e) => setIdType(e.target.value)}
                  options={idOptions} />
                <FormInput label="ID Number" value={idNumber} onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="ID number" leadingIcon={<FileText className="h-4 w-4" />} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              {isExisting ? (
                <>
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({
                        type: 'cancel',
                        title: confirmConfigs.cancel.title,
                        message: confirmConfigs.cancel.message,
                      })}
                      disabled={saving}
                      className="flex items-center justify-center gap-2 flex-1 rounded-xl border border-amber-200 dark:border-amber-900/30 px-4 py-2.5 text-sm font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                      Cancel Booking
                    </button>
                  )}

                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({
                        type: 'archive',
                        title: confirmConfigs.archive.title,
                        message: confirmConfigs.archive.message,
                      })}
                      disabled={saving}
                      className="flex items-center justify-center gap-2 flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                      Archive
                    </button>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({
                        type: 'delete',
                        title: confirmConfigs.delete.title,
                        message: confirmConfigs.delete.message,
                      })}
                      disabled={saving}
                      className="flex items-center justify-center gap-2 flex-1 rounded-xl border border-red-200 dark:border-red-900/30 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Delete
                    </button>
                  )}

                  {/* Save Changes — always visible for existing bookings */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!booking) return
                      setSaving(true)
                      try {
                        await updateBooking(booking.id, { idType, idNumber })
                        showSuccess('Document details updated')
                        onClose()
                      } catch (err) {
                        showError(err instanceof Error ? err.message : 'Failed to update booking')
                      } finally {
                        setSaving(false)
                      }
                    }}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Save Changes
                  </button>

                  {!canCancel && !canDelete && !isActive && (
                    <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                      Close
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={nights <= 0 || saving} className="flex-1">
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {isBookMode ? 'Checking In...' : 'Creating...'}</>
                    ) : isBookMode ? 'Book Now' : 'Create Reservation'}
                  </Button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Confirm Dialog */}
      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmDialog
          open={!!confirmAction}
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.type === 'cancel' ? 'Yes, Cancel Booking' : confirmAction.type === 'delete' ? 'Yes, Delete Permanently' : 'Archive'}
          variant={confirmAction.type === 'delete' ? 'danger' : confirmAction.type === 'cancel' ? 'warning' : 'info'}
          onConfirm={confirmConfigs[confirmAction.type].onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* ═══ PAYMENT DECISION MODAL ═══ */}
      {!isExisting && showPaymentDecision && (
        <BookingPaymentModal
          open={true}
          guestName={guestName}
          roomLabel={roomLabel}
          nights={nights}
          total={total}
          onPayNow={handlePayNow}
          onPayLater={handlePayLater}
          onCancel={handleCancelPaymentDecision}
          processing={saving}
        />
      )}

      {/* ═══ POS PAYMENT DIALOG (global payment workflow) ═══ */}
      {!isExisting && showPosPayment && pendingBookingData && (
        <PosPaymentDialog
          orderId={`booking-${Date.now()}`}
          unpaidItems={[
            {
              id: 'room-charge',
              item_name: `Room ${roomLabel} — ${nights} night${nights !== 1 ? 's' : ''}`,
              quantity: nights,
              unit_price: nightlyRate,
              payment_status: 'pending',
            },
          ]}
          customerName={pendingBookingData.guestName}
          selectedTableId={room.id}
          isRoomPayment={true}
          onClose={() => {
            setShowPosPayment(false)
          }}
          onComplete={handlePaymentComplete}
        />
      )}
    </>
  );
}
