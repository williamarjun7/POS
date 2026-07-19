import { useState, useCallback, useMemo } from 'react';

type BookingMode = 'reserve' | 'book' | 'manage'
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/core/auth-context';
import { usePrefetchMenu } from '@/lib/api/menu.hooks';
import { useNavigate } from 'react-router-dom';
import { getDashboardReport, todayRange } from '../../lib/services/dashboard.service';
import { dashboardKeys } from '../../lib/core/query-keys';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { showSuccess, showError } from '../../components/ui/toast';

import { motion } from 'framer-motion';
import { AnimatedContainer } from '../../components/AnimatedComponents';
import { Skeleton } from '@/components/ui/skeleton';
import type { Room } from '../../types';
import type { Booking } from '@/lib/services/booking-service';
import { BookingFormModal } from '../../components/rooms/BookingFormModal';
import { DashboardRoomTile } from '../../components/rooms/DashboardRoomTile';
import { useBookings } from '@/lib/services/booking-service';


import { formatCurrency, formatDuration } from '@/lib/utils';

import { StatCard } from '@/components/ui/stat-card';

import {
  TrendingUp, ChevronRight, Users,
  ArrowRight, DollarSign, Timer, LogOut, Sparkles, Wrench,
  BedDouble, Clock, Banknote,
  Smartphone, QrCode, CreditCard, CircleDollarSign
} from 'lucide-react';
import {
  useDashboardTables,
  useRooms,
  useCheckIn,
  useCheckOut,
  useUpdateRoomStatus,
} from '../../lib/hooks';
import { insforge } from '../../lib/services/auth-service';
import { TABLE_STATUS_LABELS, TABLE_STATUS_COLORS } from '@/lib/constants';

interface PendingPaymentItem {
  id: string
  invoiceNumber: string
  customerName: string
  tableNumber: string | null
  tableId: string | null
  total: number
  paidAmount: number
  remaining: number
  status: string
  createdAt: string
  isOverdue: boolean
  badges: Array<'partial' | 'credit' | 'split' | 'overdue'>
}







// Table status mappings — imported from shared constants
// (see src/lib/constants/index.ts)

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Prefetch menu data so POS opens instantly
  usePrefetchMenu();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [roomViewMode, setRoomViewMode] = useState<'grid' | 'list'>('grid');
  const [activeSection, setActiveSection] = useState<'tables' | 'rooms'>('tables');
  const { data: dashboardTables } = useDashboardTables();
  const { data: rooms, isLoading: roomsLoading } = useRooms();

  const { activeBookings, cancelBooking } = useBookings();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const updateStatus = useUpdateRoomStatus();

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);
  const [bookingMode, setBookingMode] = useState<BookingMode>('reserve');
  const [managedBooking, setManagedBooking] = useState<Booking | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'checkin' | 'checkout' | 'status' | 'postcheckout';
    booking?: Booking;
    room?: Room;
    status?: string;
    checkoutTarget?: 'available' | 'cleaning' | 'maintenance';
  } | null>(null);
  const [postCheckoutRoom, setPostCheckoutRoom] = useState<Room | null>(null);
  const [postCheckoutBooking, setPostCheckoutBooking] = useState<Booking | null>(null);
  // Pending payments query — invoices with outstanding balances
  const { data: pendingPayments } = useQuery({
    queryKey: dashboardKeys.pendingInvoices,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('invoices')
        .select('*, restaurant_tables!left(table_number), payments!left(amount, payment_method, status)')
        .not('status', 'in', '("paid","refunded","cancelled")')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error

      const rows = (data ?? []) as any[]
      // ⚠️ PostgREST `!left` join on `payments` flattens each payment into a
      //    separate row. An invoice with 2 payments produces 2 rows with the
      //    same invoice data but different `payments` objects. We must aggregate
      //    ALL payments per invoice before calculating remaining balances.
      const invoiceMap = new Map<string, {
        row: any
        allPayments: Array<{ amount: number; payment_method: string; status: string }>
      }>()

      // First pass: group all payment rows by invoice ID
      for (const row of rows) {
        if (!row.id) continue
        if (!invoiceMap.has(row.id)) {
          invoiceMap.set(row.id, { row, allPayments: [] })
        }
        // Each flattened row carries a single payment object — accumulate it
        if (row.payments) {
          invoiceMap.get(row.id)!.allPayments.push(row.payments as any)
        }
      }

      // Second pass: process each unique invoice once with ALL its payments
      const items: PendingPaymentItem[] = []
      for (const { row, allPayments } of invoiceMap.values()) {
        const invTotal = Number(row.total || 0)
        const nonCreditPayments = allPayments.filter(p => p.payment_method !== 'credit')
        const nonCreditPaid = nonCreditPayments.reduce((sum, p) => sum + Number(p.amount), 0)
        const remaining = Math.max(0, invTotal - nonCreditPaid)

        if (remaining <= 0) continue // Skip fully settled

        const isPartial = nonCreditPaid > 0 && remaining > 0
        const isCreditInvoice = row.status === 'credit_invoice'
        const isSplitPayment = nonCreditPayments.length > 1 && nonCreditPayments.some(p => p.payment_method !== nonCreditPayments[0].payment_method)
        const isOverdue = row.status === 'overdue' || (row.due_date && new Date(row.due_date) < new Date())

        items.push({
          id: row.id,
          invoiceNumber: row.invoice_number,
          customerName: row.customer_name || 'Walk-in',
          tableNumber: row.restaurant_tables?.table_number ?? null,
          tableId: row.table_id,
          total: invTotal,
          paidAmount: nonCreditPaid,
          remaining,
          status: row.status,
          createdAt: row.created_at,
          isOverdue,
          badges: [
            ...(isPartial ? ['partial' as const] : []),
            ...(isCreditInvoice ? ['credit' as const] : []),
            ...(isSplitPayment ? ['split' as const] : []),
            ...(isOverdue ? ['overdue' as const] : []),
          ],
        })
      }

      return items
    },
    staleTime: 15000,
  })

  // Find active booking for a room
  const getRoomBooking = useCallback((roomId: string): Booking | undefined => {
    return activeBookings.find(b => b.roomId === roomId);
  }, [activeBookings]);

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: dashboardKeys.report(todayRange().startDate, todayRange().endDate),
    queryFn: () => getDashboardReport(todayRange()),
    staleTime: 30000,
  });

  // ─── Voided items query — count and amount for today ───
  const { data: voidedData } = useQuery({
    queryKey: [...dashboardKeys.all, 'voided', todayRange().startDate],
    queryFn: async () => {
      const today = todayRange()
      const { data, error } = await insforge.database
        .from('order_batch_items')
        .select('quantity, unit_price')
        .eq('status', 'voided')
        .gte('created_at', today.startDate)
        .lte('created_at', today.endDate)
      if (error) throw error
      const items = (data ?? []) as Array<{ quantity: number; unit_price: number }>
      const count = items.reduce((s, i) => s + i.quantity, 0)
      const amount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      return { count, amount }
    },
    staleTime: 30000,
  })

  const expensesToday = report?.summary.expenses_today ?? 0;
  const paymentMethods = report?.payment_summary.payment_methods ?? [];

  const netSales = report?.summary.net_sales ?? 0;

  const sortedTables = useMemo(() => [...(dashboardTables ?? [])].sort(
    (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999) || (a.table_number?.localeCompare(b.table_number ?? '', undefined, { numeric: true }) ?? 0)
  ), [dashboardTables]);

  const occupiedTables = useMemo(() => sortedTables.filter(
    (t) => t.status !== 'available' && t.status !== 'free'
  ).length, [sortedTables]);
  const totalTables = useMemo(() => sortedTables.length, [sortedTables]);

  const occupancyTrend = useMemo(() => {
    const hours = report?.hourly_sales?.hours ?? [];
    const TIME_SLOTS = [
      { label: '8AM', hour: 8 }, { label: '10AM', hour: 10 }, { label: '12PM', hour: 12 },
      { label: '2PM', hour: 14 }, { label: '4PM', hour: 16 }, { label: '6PM', hour: 18 }, { label: '8PM', hour: 20 },
    ];
    if (hours.length === 0 || totalTables === 0) return TIME_SLOTS.map(s => ({ label: s.label, value: 0 }));
    return TIME_SLOTS.map(slot => {
      const slotHours = hours.filter(h => h.hour >= slot.hour && h.hour < slot.hour + 2);
      const avgOccupied = slotHours.length > 0
        ? slotHours.reduce((sum, h) => sum + h.occupied_tables, 0) / slotHours.length
        : 0;
      return { label: slot.label, value: Math.round((avgOccupied / totalTables) * 100) };
    });
  }, [report, totalTables]);

  const occupiedRooms = report?.room_summary?.occupied ?? (rooms ?? []).filter((r: Room) => r.status === 'occupied').length;
  const availableRooms = report?.room_summary?.available ?? (rooms ?? []).filter((r: Room) => r.status === 'available' || r.status === 'vacant').length;
  const totalRooms = report?.room_summary?.total_rooms ?? (rooms ?? []).length;

  const filteredRooms = useMemo(() => rooms ?? [], [rooms]);

  const recentActivity = useMemo(() => report?.activity_feed ?? [], [report]);

  const handleTableClick = (table: any) => {
    navigate(`/pos?table=${table.id}`);
  };

  const handleRoomPos = (room: Room) => {
    navigate(`/pos?room=${room.id}`);
  };

  const handleRoomAction = useCallback(async (room: Room, action: string, booking?: Booking | null) => {
    switch (action) {
      case 'reserve':
        setManagedBooking(null);
        setBookingMode('reserve');
        setBookingRoom(room);
        setShowBookingForm(true);
        break;
      case 'book':
        setManagedBooking(null);
        setBookingMode('book');
        setBookingRoom(room);
        setShowBookingForm(true);
        break;
      case 'checkin':
        if (booking) {
          setConfirmAction({ type: 'checkin', booking, room });
        }
        break;
      case 'view':
        if (booking) {
          setManagedBooking(booking);
          setBookingRoom(room);
          setShowBookingForm(true);
        }
        break;
      case 'edit':
        if (booking) {
          setManagedBooking(booking);
          setBookingRoom(room);
          setShowBookingForm(true);
        }
        break;
      case 'cancel':
        if (booking) {
          setConfirmAction({ type: 'status', room, booking, status: 'cancel_booking' });
        }
        break;
      case 'pos':
        handleRoomPos(room);
        break;
      case 'extend':
        if (booking) {
          setManagedBooking(booking);
          setBookingRoom(room);
          setShowBookingForm(true);
        }
        break;
      case 'checkout':
        if (booking) {
          setConfirmAction({ type: 'checkout', booking, room });
        }
        break;
      case 'markavailable':
        try {
          await updateStatus.mutateAsync({ id: room.id, status: 'available' });
          showSuccess(`Room ${room.room_number || room.number} is now available`);
        } catch (err) {
          showError((err as Error)?.message || 'Failed to update room');
        }
        break;
      case 'completemaintenance':
        try {
          await updateStatus.mutateAsync({ id: room.id, status: 'available' });
          showSuccess(`Room ${room.room_number || room.number} maintenance completed`);
        } catch (err) {
          showError((err as Error)?.message || 'Failed to update room');
        }
        break;
    }
  }, [updateStatus, navigate]);

  const getTimestamp = () => Date.now();

  const executeCheckIn = useCallback(async () => {
    if (!confirmAction?.booking || !user) return;
    try {
      await checkIn.mutateAsync({
        p_booking_id: confirmAction.booking.id,
        p_user_id: user.id,
        p_idempotency_key: `checkin:${confirmAction.booking.id}:${getTimestamp()}`,
      });
      showSuccess(`${confirmAction.booking.guestName} checked in successfully`);
      setConfirmAction(null);
    } catch (err) {
      showError((err as Error)?.message || 'Check-in failed');
    }
  }, [confirmAction, user, checkIn]);

  const executeCheckOut = useCallback(async () => {
    if (!confirmAction?.booking || !user) return;
    try {
      await checkOut.mutateAsync({
        p_booking_id: confirmAction.booking.id,
        p_user_id: user.id,
        p_idempotency_key: `checkout:${confirmAction.booking.id}:${getTimestamp()}`,
      });
      setPostCheckoutRoom(confirmAction.room ?? null);
      setPostCheckoutBooking(confirmAction.booking);
      setConfirmAction(null);
    } catch (err) {
      showError((err as Error)?.message || 'Check-out failed');
    }
  }, [confirmAction, user, checkOut]);

  const executePostCheckout = useCallback(async (target: 'available' | 'cleaning' | 'maintenance') => {
    if (!postCheckoutRoom) return;
    try {
      const statusMap = { available: 'available', cleaning: 'cleaning', maintenance: 'maintenance' };
      await updateStatus.mutateAsync({
        id: postCheckoutRoom.id,
        status: statusMap[target],
        reason: `Post-checkout: set to ${target}`,
      });
      showSuccess(`Room ${postCheckoutRoom.room_number || postCheckoutRoom.number} → ${target}`);
      setPostCheckoutRoom(null);
      setPostCheckoutBooking(null);
    } catch (err) {
      showError((err as Error)?.message || 'Failed to update room');
    }
  }, [postCheckoutRoom, updateStatus]);

  const executeStatusChange = useCallback(async () => {
    if (!confirmAction?.room) return;
    try {
      if (confirmAction.status === 'cancel_booking' && confirmAction.booking) {
        await cancelBooking(confirmAction.booking.id);
        showSuccess(`Reservation for ${confirmAction.booking.guestName} cancelled`);
      } else {
        await updateStatus.mutateAsync({
          id: confirmAction.room.id,
          status: confirmAction.status || '',
          reason: `Dashboard quick action to ${confirmAction.status}`,
        });
        showSuccess(`Room ${confirmAction.room.room_number || confirmAction.room.number} marked as ${confirmAction.status}`);
      }
      setConfirmAction(null);
    } catch (err) {
      showError((err as Error)?.message || 'Failed to update room status');
    }
  }, [confirmAction, updateStatus, cancelBooking]);

  return (
    <Skeleton name="dashboard" loading={reportLoading && !dashboardTables}>
      <div className="mx-auto w-full max-w-7xl space-y-6">
      <AnimatedContainer>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, {user?.name ?? 'User'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{new Date().toLocaleDateString('ne-NP', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
      </AnimatedContainer>
      {/* Tables / Rooms Panel */}
      <div className="grid grid-cols-12 gap-4 items-start">
        <div className="col-span-12 lg:col-span-8">
          <AnimatedContainer>
            <div className={`rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md border-t-4 ${activeSection === 'tables' ? 'border-t-orange-500' : 'border-t-violet-500'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider ${activeSection === 'tables' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-muted text-muted-foreground'}`}>
                    <Users className="h-3.5 w-3.5" />{activeSection === 'tables' ? 'Tables' : 'Rooms'}
                  </div>
                  <div className="flex rounded-lg border p-0.5 bg-muted/50">
                    <button
                      onClick={() => setActiveSection('tables')}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${activeSection === 'tables' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Tables
                    </button>
                    <button
                      onClick={() => setActiveSection('rooms')}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${activeSection === 'rooms' ? 'bg-violet-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Rooms
                    </button>
                  </div>
                </div>
                {activeSection === 'tables' && (
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setViewMode('grid')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-all ${viewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Grid</button>
                    <button onClick={() => setViewMode('list')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-all ${viewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>List</button>

                  </div>
                )}

                {activeSection === 'rooms' && (
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setRoomViewMode('grid')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-all ${roomViewMode === 'grid' ? 'bg-violet-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Grid</button>
                    <button onClick={() => setRoomViewMode('list')} className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-all ${roomViewMode === 'list' ? 'bg-violet-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>List</button>
                  </div>
                )}

              </div>

              {/* Tables Section */}
              {activeSection === 'tables' && (
                <>
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 gap-4">
                      {sortedTables.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                          <Users className="h-12 w-12 mb-3 text-muted-foreground/30" />
                          <p className="text-sm font-medium">No tables configured</p>
                          <p className="text-xs mt-1">Tables will appear here once added</p>
                        </div>
                      ) : (
                        sortedTables.map((table: any) => {
                          const isOccupied = table.status === 'occupied';
                          const isReserved = table.status === 'reserved';
                          const guestName = table.guestName || table.customer || '';
                          const outstanding = table.running_total || table.totalAmount || 0;
                          return (
                            <div
                              key={table.id}
                              onClick={() => handleTableClick(table)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTableClick(table); } }}
                              role="button"
                              tabIndex={0}
                              className="flex flex-col items-center gap-2 group cursor-pointer"
                            >
                              <div className={`relative w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 ${
                                isOccupied
                                  ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                                  : isReserved
                                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                                  : 'border-muted-foreground/20 bg-card hover:border-orange-300'
                              }`}>
                                <span className={`text-lg font-extrabold leading-none ${isOccupied ? 'text-orange-700 dark:text-orange-300' : isReserved ? 'text-blue-700 dark:text-blue-300' : 'text-foreground group-hover:text-orange-500 transition-colors'}`}>
                                  {table.table_number || table.number || table.name}
                                </span>
                                {isOccupied && (
                                  <>
                                    {guestName && (
                                      <span className="text-[9px] font-medium text-orange-600/80 dark:text-orange-400/80 mt-0.5 leading-tight text-center px-1">
                                        {guestName}
                                      </span>
                                    )}
                                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400">
                                      {formatCurrency(outstanding)}
                                    </span>
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500/40 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500 border-2 border-white dark:border-gray-900" />
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${
                                isOccupied ? 'bg-orange-100 dark:bg-orange-900/30' : isReserved ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-muted'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${TABLE_STATUS_COLORS[table.status] || 'bg-gray-400'}`} />
                                <span className={`text-[11px] font-medium ${
                                  isOccupied ? 'text-orange-700 dark:text-orange-300' : isReserved ? 'text-blue-700 dark:text-blue-300' : 'text-muted-foreground'
                                }`}>
                                  {TABLE_STATUS_LABELS[table.status] || table.status}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortedTables.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Users className="h-10 w-10 mb-3 text-muted-foreground/30" />
                          <p className="text-sm font-medium">No tables configured</p>
                          <p className="text-xs mt-1">Tables will appear here once added</p>
                        </div>
                      )}
                      {sortedTables.map((table: any) => (
                        <div
                          key={table.id}
                          onClick={() => handleTableClick(table)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTableClick(table); } }}
                          role="button"
                          tabIndex={0}
                          className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 cursor-pointer hover:bg-orange-50 hover:border-orange-200 dark:hover:bg-orange-950/10 dark:hover:border-orange-900/30 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${TABLE_STATUS_COLORS[table.status] || 'bg-gray-400'}`} />
                            <div>
                              <span className="text-sm font-medium">Table {table.table_number || table.number}</span>
                              <span className="text-xs text-muted-foreground ml-2">{TABLE_STATUS_LABELS[table.status] || table.status}</span>
                              {table.status === 'occupied' && (table.running_total || table.totalAmount) && (
                                <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 ml-2">
                                  {formatCurrency(table.running_total || table.totalAmount || 0)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Rooms Section */}
              {activeSection === 'rooms' && (
                <>
                  {roomViewMode === 'grid' ? (
                    <div className="space-y-4">
                      {roomsLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                        </div>
                      ) : filteredRooms.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col items-center justify-center py-16 text-muted-foreground"
                        >
                          <BedDouble className="h-12 w-12 mb-3 text-muted-foreground/30" />
                          <p className="text-sm font-medium">No rooms found</p>
                          <p className="text-xs mt-1">Try adjusting your filters</p>
                        </motion.div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                          {filteredRooms.map((room: Room) => {
                            const roomBooking = getRoomBooking(room.id)
                            return (
                              <DashboardRoomTile
                                key={room.id}
                                room={room}
                                booking={roomBooking}
                                onAction={handleRoomAction}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredRooms.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <BedDouble className="h-10 w-10 mb-3 text-muted-foreground/30" />
                          <p className="text-sm font-medium">No rooms found</p>
                          <p className="text-xs mt-1">Try adjusting your filters</p>
                        </div>
                      )}
                      {filteredRooms.map((room: Room) => {
                        const isOccupied = room.status === 'occupied'
                        const isReserved = room.status === 'reserved'
                        const isCleaning = room.status === 'cleaning'
                        const isAvailable = room.status === 'available' || room.status === 'vacant'
                        const statusLabel = isAvailable ? 'Available' : isOccupied ? 'Occupied' : isReserved ? 'Reserved' : isCleaning ? 'Cleaning' : 'Maintenance'
                        const statusDot = isAvailable ? 'bg-emerald-500' : isOccupied ? 'bg-orange-500' : isReserved ? 'bg-blue-500' : isCleaning ? 'bg-cyan-500' : 'bg-red-500'
                        const roomBooking = getRoomBooking(room.id)

                        const handleRoomClick = () => {
                          if (isOccupied) {
                            handleRoomPos(room)
                          } else if (isReserved && roomBooking) {
                            setManagedBooking(roomBooking)
                            setBookingRoom(room)
                            setShowBookingForm(true)
                          } else if (isAvailable) {
                            setManagedBooking(null)
                            setBookingRoom(room)
                            setShowBookingForm(true)
                          }
                        }

                        return (
                          <div
                            key={room.id}
                            onClick={handleRoomClick}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRoomClick(); } }}
                            role="button"
                            tabIndex={0}
                            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 cursor-pointer hover:bg-violet-50 hover:border-violet-200 dark:hover:bg-violet-950/10 dark:hover:border-violet-900/30 transition-all"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`w-2 h-2 rounded-full ${statusDot} shrink-0`} />
                              <div className="min-w-0">
                                <span className="text-sm font-medium">Room {room.room_number || room.number}</span>
                                {room.room_types?.name && (
                                  <span className="text-xs text-muted-foreground ml-2">{room.room_types.name}</span>
                                )}
                                <span className="text-xs text-muted-foreground ml-2">{statusLabel}</span>
                                {isReserved && roomBooking && (
                                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400 ml-2">
                                    {roomBooking.guestName}
                                  </span>
                                )}
                                {isOccupied && room.guest && (
                                  <span className="text-xs font-medium text-orange-600 dark:text-orange-400 ml-2">
                                    {room.guest}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </AnimatedContainer>
        </div>

      </div>

      {/* Top Stats Row: Active Tables + Room Status + Occupancy Trend */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <AnimatedContainer delay={0.15}>
            <StatCard
              icon="Users"
              label="ACTIVE TABLES"
              value={`${occupiedTables} / ${totalTables}`}
              sublabel={`${totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0}% Occupied`}
              iconBg="bg-orange-100 dark:bg-orange-900/30"
              color="text-orange-600 dark:text-orange-400"
              className="border-l-4 border-l-orange-500"
              index={0}
            />
          </AnimatedContainer>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <AnimatedContainer delay={0.2}>
            <StatCard
              icon="Hotel"
              label="ROOM STATUS"
              value={`${occupiedRooms} / ${totalRooms}`}
              sublabel={`${availableRooms} Available`}
              iconBg="bg-violet-100 dark:bg-violet-900/30"
              color="text-violet-600 dark:text-violet-400"
              className="border-l-4 border-l-violet-500"
              index={1}
            />
          </AnimatedContainer>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <AnimatedContainer delay={0.25}>
            <div className="rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md border-t-4 border-t-primary h-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Timer className="h-4 w-4 text-primary" />
                  Occupancy Trend
                </h3>
              </div>
              {occupancyTrend.every(bar => bar.value === 0) ? (
                <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
                  <Clock className="h-8 w-8 mb-2 text-muted-foreground/30" />
                  <p className="text-xs font-medium">No occupancy data yet</p>
                  <p className="text-[10px] mt-0.5">Data will appear as tables are occupied</p>
                </div>
              ) : (
                <div className="flex items-end justify-between gap-2 h-24 px-1">
                  {occupancyTrend.map((bar, i) => (
                    <div key={i} className="relative flex flex-col items-center gap-1 flex-1 h-full justify-end">
                      <div
                        className="w-full rounded-lg transition-all duration-500 hover:opacity-80"
                        style={{
                          height: `${Math.max(bar.value, 2)}%`,
                          background: i === 3
                            ? 'linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.6) 100%)'
                            : 'linear-gradient(180deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.05) 100%)',
                        }}
                      />
                      <span className="text-[10px] font-medium text-muted-foreground">{bar.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AnimatedContainer>
        </div>
      </div>

      {/* Payment Summary Cards */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 lg:col-span-2">
          <StatCard icon="Banknote" label="COLLECTED TODAY" value={`Rs. ${report?.summary.collected.toFixed(0) ?? '0'}`} sublabel="Actual payments received today" color="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-100 dark:bg-emerald-900/30" className="border-l-4 border-l-emerald-500" index={0} />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-2">
          <StatCard icon="DollarSign" label="SALES TODAY" value={`Rs. ${report?.summary.sales_today.toFixed(0) ?? '0'}`} sublabel="Total invoice value today" color="text-blue-600 dark:text-blue-400" iconBg="bg-blue-100 dark:bg-blue-900/30" className="border-l-4 border-l-blue-500" index={1} />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-2">
          <StatCard icon="TrendingDown" label="EXPENSES TODAY" value={`Rs. ${expensesToday.toFixed(0)}`} sublabel="Total expenses today" color="text-red-600 dark:text-red-400" iconBg="bg-red-100 dark:bg-red-900/30" className="border-l-4 border-l-red-500" index={2} />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-2">
          <StatCard icon="Timer" label="OUTSTANDING" value={`Rs. ${report?.summary.outstanding.toFixed(0) ?? '0'}`} sublabel="Remaining balance (incl. credit)" color="text-orange-600 dark:text-orange-400" iconBg="bg-orange-100 dark:bg-orange-900/30" className="border-l-4 border-l-orange-500" index={3} />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-2">
          <StatCard icon="Receipt" label="PARTIALLY PAID" value={`${report?.summary.partially_paid_count ?? 0}`} sublabel="Invoices awaiting balance" color="text-violet-600 dark:text-violet-400" iconBg="bg-violet-100 dark:bg-violet-900/30" className="border-l-4 border-l-violet-500" index={4} />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-2">
          <StatCard icon="Ban" label="VOIDED ITEMS" value={voidedData?.count != null ? `${voidedData.count} items` : '—'} sublabel={voidedData?.amount != null ? `Rs. ${voidedData.amount.toFixed(0)}` : 'Loading...'} color="text-red-600 dark:text-red-400" iconBg="bg-red-100 dark:bg-red-900/30" className="border-l-4 border-l-red-500" index={5} />
        </div>
      </div>

      {/* Payment Methods Strip — compact */}
      <AnimatedContainer>
        <div className="rounded-xl border bg-card p-0.5 transition-all duration-200 hover:shadow-md">
          <div className="flex flex-wrap items-stretch divide-x divide-border/50">
            {/* Cash */}
            <div className="flex flex-1 flex-col items-center justify-center gap-0.5 p-3 min-w-[100px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Banknote className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cash</span>
              <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">Rs. {(paymentMethods.find(m => m.method === 'cash')?.amount ?? 0).toFixed(0)}</span>
              <span className="text-[10px] text-muted-foreground/60">{paymentMethods.find(m => m.method === 'cash')?.count ?? 0} payments</span>
            </div>
            {/* Reception QR */}
            <div className="flex flex-1 flex-col items-center justify-center gap-0.5 p-3 min-w-[100px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
                <Smartphone className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reception QR</span>
              <span className="text-sm font-bold tabular-nums text-sky-600 dark:text-sky-400">Rs. {(paymentMethods.find(m => m.method === 'reception_qr')?.amount ?? 0).toFixed(0)}</span>
              <span className="text-[10px] text-muted-foreground/60">{paymentMethods.find(m => m.method === 'reception_qr')?.count ?? 0} payments</span>
            </div>
            {/* FonePay QR */}
            <div className="flex flex-1 flex-col items-center justify-center gap-0.5 p-3 min-w-[100px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <QrCode className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">FonePay QR</span>
              <span className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">Rs. {(paymentMethods.find(m => m.method === 'fonepay')?.amount ?? 0).toFixed(0)}</span>
              <span className="text-[10px] text-muted-foreground/60">{paymentMethods.find(m => m.method === 'fonepay')?.count ?? 0} payments</span>
            </div>
            {/* Outstanding Credit — from customers.credit_balance (NOT payments) */}
            <div className="flex flex-1 flex-col items-center justify-center gap-0.5 p-3 min-w-[100px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <CreditCard className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outstanding Credit</span>
              <span className="text-sm font-bold tabular-nums text-purple-600 dark:text-purple-400">Rs. {(report?.summary.credit_outstanding ?? 0).toFixed(0)}</span>
              <span className="text-[10px] text-muted-foreground/60">Customer balances</span>
            </div>
            {/* Net Profit */}
            <div className={`flex flex-1 flex-col items-center justify-center gap-0.5 p-3 min-w-[100px]`}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${netSales - expensesToday >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                <TrendingUp className={`h-3.5 w-3.5 ${netSales - expensesToday >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Profit</span>
              <span className={`text-sm font-bold tabular-nums ${netSales - expensesToday >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>Rs. {(netSales - expensesToday).toFixed(0)}</span>
              <span className="text-[10px] text-muted-foreground/60">{netSales - expensesToday >= 0 ? 'Positive margin' : 'Negative margin'}</span>
            </div>
            {/* Total Collected */}
            <div className="flex flex-1 flex-col items-center justify-center gap-0.5 p-3 min-w-[100px] rounded-r-xl bg-gradient-to-br from-amber-50 to-amber-50/50 dark:from-amber-950/20 dark:to-amber-950/10">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <CircleDollarSign className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Total</span>
              <span className="text-sm font-extrabold tabular-nums text-amber-700 dark:text-amber-300">Rs. {(report?.payment_summary.grand_total ?? 0).toFixed(0)}</span>
              <span className="text-[10px] text-amber-600/60 dark:text-amber-300/60">All methods</span>
            </div>
          </div>
        </div>
      </AnimatedContainer>

      {/* Pending Payments + Recent Activity — equal height cards */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 flex flex-col">
          <AnimatedContainer className="flex flex-col flex-1">
            <div className="rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md border-l-4 border-l-amber-500 flex flex-col flex-1">
              <h3 className="text-base font-semibold mb-4 flex items-center gap-2 shrink-0">
                <DollarSign className="h-4 w-4 text-amber-500" />
                Pending Payments
              </h3>
              {!pendingPayments || pendingPayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <DollarSign className="h-10 w-10 mb-3 text-muted-foreground/30" />
                  <p className="text-sm font-medium">No pending payments</p>
                  <p className="text-xs mt-1">All invoices have been settled</p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">Table</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">Invoice</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">Customer</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap text-right">Total</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap text-right">Outstanding</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">Age</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayments.map((item) => {
                      const ageMinutes = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 60000)
                      return (
                      <TableRow
                        key={item.id}
                        onClick={() => navigate(`/billing/${item.id}`)}
                        className="hover:bg-amber-50/50 dark:hover:bg-amber-950/10 transition-colors cursor-pointer"
                      >
                        <TableCell>
                          {item.tableNumber ? (
                            <span className="text-sm font-semibold tabular-nums">T{item.tableNumber}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium">
                          {item.invoiceNumber || `#${item.id.slice(0, 8)}`}
                        </TableCell>
                        <TableCell className="max-w-[120px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium truncate">{item.customerName}</span>
                            {item.badges.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.badges.includes('partial') && (
                                  <Badge className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0">Partial</Badge>
                                )}
                                {item.badges.includes('credit') && (
                                  <Badge className="text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-0">Credit</Badge>
                                )}
                                {item.badges.includes('split') && (
                                  <Badge className="text-[9px] bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-0">Split</Badge>
                                )}
                                {item.badges.includes('overdue') && (
                                  <Badge className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0">Overdue</Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          Rs. {item.total.toFixed(0)}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${item.remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                          Rs. {item.remaining.toFixed(0)}
                          {item.paidAmount > 0 && (
                            <span className="block text-[10px] text-muted-foreground font-normal">
                              {item.paidAmount > 0 ? `${Math.round((item.remaining / item.total) * 100)}% unpaid` : ''}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDuration(ageMinutes)}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/billing/${item.id}`); }}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-600 transition-all active:scale-95 shadow-sm"
                          >
                            Process <ArrowRight className="h-3 w-3" />
                          </button>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table></div>
              )}
            </div>
          </AnimatedContainer>
        </div>

        <div className="col-span-12 lg:col-span-6 flex flex-col">
          <AnimatedContainer className="flex flex-col flex-1">
            <div className="rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md border-l-4 border-l-blue-500 flex flex-col flex-1">
              <h3 className="text-base font-semibold mb-4 flex items-center gap-2 shrink-0">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Recent Activity
              </h3>
              <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-blue-200 dark:before:bg-blue-900/30 overflow-y-auto flex-1 min-h-0 pr-2">
                {recentActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 pl-8 text-muted-foreground">
                    <TrendingUp className="h-10 w-10 mb-3 text-muted-foreground/30" />
                    <p className="text-sm font-medium">No recent activity</p>
                    <p className="text-xs mt-1">Activity from today will appear here</p>
                  </div>
                ) : (
                  recentActivity.slice(0, 8).map((act) => (
                    <div key={act.id} className="relative pl-8 group">
                      <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white dark:bg-gray-900 border-2 border-blue-300 dark:border-blue-700 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                          {act.activity_type.includes('payment') ? 'Rs.' : '#'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {act.entity_label} — {act.location}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {act.time_ago}
                          {act.amount > 0 ? ` • Rs. ${act.amount.toFixed(2)}` : ''}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </AnimatedContainer>
        </div>
      </div>

      {/* Booking Form Modal (create + manage) */}
      {showBookingForm && bookingRoom && (
        <BookingFormModal
          room={bookingRoom}
          booking={managedBooking}
          mode={managedBooking ? 'manage' : bookingMode}
          onClose={() => { setShowBookingForm(false); setBookingRoom(null); setManagedBooking(null); setBookingMode('reserve'); }}
        />
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={confirmAction?.type === 'checkin'}
        title="Confirm Check-In"
        message={`Check in ${confirmAction?.booking?.guestName} to Room ${confirmAction?.room?.room_number || confirmAction?.room?.number || ''}?`}
        confirmLabel="Yes, Check In"
        variant="info"
        onConfirm={executeCheckIn}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction?.type === 'checkout'}
        title="Confirm Check-Out"
        message={`Check out ${confirmAction?.booking?.guestName} from Room ${confirmAction?.room?.room_number || confirmAction?.room?.number || ''}?`}
        confirmLabel="Yes, Check Out"
        variant="danger"
        onConfirm={executeCheckOut}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction?.type === 'status'}
        title={confirmAction?.status === 'cancel_booking' ? 'Cancel Reservation' : 'Change Room Status'}
        message={
          confirmAction?.status === 'cancel_booking'
            ? `Cancel reservation for ${confirmAction?.booking?.guestName} at Room ${confirmAction?.room?.room_number || confirmAction?.room?.number}?`
            : `Change Room ${confirmAction?.room?.room_number || confirmAction?.room?.number} status to "${confirmAction?.status}"?`
        }
        confirmLabel={confirmAction?.status === 'cancel_booking' ? 'Yes, Cancel' : 'Change Status'}
        variant={confirmAction?.status === 'cancel_booking' ? 'danger' : 'warning'}
        onConfirm={executeStatusChange}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Post-Checkout Dialog */}
      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity ${
          postCheckoutRoom ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => { setPostCheckoutRoom(null); setPostCheckoutBooking(null); }}
      >
        {postCheckoutRoom && (
          <div
            className="w-full max-w-sm rounded-2xl border bg-card shadow-2xl p-6 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
                <LogOut className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Checkout Complete</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Room {postCheckoutRoom.room_number || postCheckoutRoom.number}
                {postCheckoutBooking && ` — ${postCheckoutBooking.guestName}`}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">Where should this room go?</p>
            </div>
            <div className="space-y-2.5">
              <button
                onClick={() => executePostCheckout('available')}
                className="w-full flex items-center justify-between rounded-xl border-2 border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/10 px-4 py-3 text-left transition-all hover:border-emerald-400 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/30 active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Mark Available</p>
                    <p className="text-[10px] text-muted-foreground/60">Room ready for next guest</p>
                  </div>
                </div>
                <div className="h-6 w-6 rounded-full border-2 border-emerald-400 flex items-center justify-center" />
              </button>
              <button
                onClick={() => executePostCheckout('cleaning')}
                className="w-full flex items-center justify-between rounded-xl border-2 border-orange-200 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-950/10 px-4 py-3 text-left transition-all hover:border-orange-400 hover:bg-orange-100/50 dark:hover:bg-orange-950/30 active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                    <BedDouble className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Send to Housekeeping</p>
                    <p className="text-[10px] text-muted-foreground/60">Needs cleaning before next guest</p>
                  </div>
                </div>
                <div className="h-6 w-6 rounded-full border-2 border-orange-400 flex items-center justify-center" />
              </button>
              <button
                onClick={() => executePostCheckout('maintenance')}
                className="w-full flex items-center justify-between rounded-xl border-2 border-gray-200 dark:border-gray-800/40 bg-gray-50/50 dark:bg-gray-950/10 px-4 py-3 text-left transition-all hover:border-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-950/30 active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800/30">
                    <Wrench className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Maintenance</p>
                    <p className="text-[10px] text-muted-foreground/60">Room needs repairs or inspection</p>
                  </div>
                </div>
                <div className="h-6 w-6 rounded-full border-2 border-gray-400 flex items-center justify-center" />
              </button>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setPostCheckoutRoom(null); setPostCheckoutBooking(null); }}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}


      </div>
      </div>
    </Skeleton>
  );
}
