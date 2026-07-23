export type PaymentMethod = "cash" | "fonepay" | "reception_qr" | "credit" | "split" | "partial"

export type OrderStatus = "completed" | "pending" | "cancelled" | "processing"

export type PaymentStatus = "paid" | "pending" | "overdue" | "partial" | "credit_invoice"

export type ActivityType =
  | "order_completed"
  | "payment_received"
  | "booking_created"
  | "inventory_updated"
  | "room_checked_in"
  | "room_checked_out"
  | "invoice_generated"
  | "supplier_purchase"
  | "customer_added"
  | "expense_recorded"

export type DateRange = "today" | "yesterday" | "7days" | "30days" | "90days" | "custom"

export type SalesChannel = "dine_in" | "takeaway" | "room_service" | "online"

export interface KpiCard {
  id: string
  title: string
  value: number
  previousValue: number
  icon: string
  color: string
  sparkline: number[]
  prefix?: string
  suffix?: string
  decimals?: number
}

export interface Transaction {
  id: string
  invoiceNumber: string
  customer: string
  paymentMethod: PaymentMethod
  amount: number
  status: PaymentStatus
  date: string
  time: string
  items: number
}

export interface PendingPayment {
  id: string
  invoiceNumber: string
  customer: string
  amountDue: number
  dueDate: string
  paymentMethod: PaymentMethod
  priority: "high" | "medium" | "low"
  status: PaymentStatus
  daysOverdue: number
}

export interface Activity {
  id: string
  type: ActivityType
  title: string
  description: string
  timestamp: Date
  user: string
  icon: string
}

export interface ChartDataPoint {
  name: string
  value: number
  value2?: number
}

export interface PaymentChartPoint {
  name: string
  value: number
  color: string
}

export interface HourlyHeatmapPoint {
  hour: string
  day: string
  value: number
}

export interface BusinessMetric {
  id: string
  label: string
  value: string
  subtitle?: string
  trend?: "up" | "down" | "neutral"
  trendValue?: string
}

export interface QuickAction {
  id: string
  label: string
  icon: string
  color: string
  href: string
}

import type { Permission } from '@/lib/core/permissions'

export interface SidebarItem {
  label: string
  icon: string
  href: string
  badge?: number
  /** Optional: user must have this permission to see this nav item */
  permission?: Permission
}

export interface DashboardFilters {
  dateRange: DateRange
  branch: string
  paymentMethod: PaymentMethod | "all"
  salesChannel: SalesChannel | "all"
  employee: string
}

// Module-specific types
export type TableStatus = "available" | "occupied" | "reserved" | "cleaning" | "maintenance" | "disabled"
export type HousekeepingStatus = "pending" | "in_progress" | "completed"
export type MaintenancePriority = "low" | "medium" | "high" | "urgent"
export type ReservationStatus = "confirmed" | "pending" | "cancelled" | "checked_in" | "completed"
export type ExpenseCategory = "utilities" | "supplies" | "maintenance" | "staff" | "marketing" | "other"
export type UserRole = "admin" | "manager" | "cashier" | "waiter" | "housekeeper" | "receptionist" | "owner"

export interface DiningTable {
  id: string
  number: string
  capacity: number
  section: string
  status: TableStatus
  currentOrder?: string
  seatedAt?: string
}

export interface MenuItem {
  id: string
  name: string
  category: string
  price: number
  description: string
  available: boolean
  image?: string
  prepTime?: number
  tags: string[]
}

export interface MenuCategory {
  id: string
  name: string
  itemCount: number
  icon: string
}

export interface InventoryItem {
  id: string
  name: string
  category: string
  currentStock: number
  minStock: number
  unit: string
  costPerUnit: number
  lastRestocked: string
  supplier: string
}

export interface Supplier {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  address: string
  totalOrders: number
  outstandingBalance: number
  rating: number
}

export interface PurchaseOrder {
  id: string
  supplierId: string
  supplierName: string
  items: { name: string; quantity: number; unitPrice: number }[]
  totalAmount: number
  status: "pending" | "ordered" | "received" | "cancelled"
  orderDate: string
  expectedDelivery: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  address?: string
  totalOrders: number
  totalSpent: number
  lastVisit: string
  loyaltyPoints: number
  creditBalance: number
}

export interface Reservation {
  id: string
  guestName: string
  phone: string
  email?: string
  roomType: string
  checkIn: string
  checkOut: string
  guests: number
  status: ReservationStatus
  totalAmount: number
  specialRequests?: string
  paymentStatus: PaymentStatus
}

export interface Invoice {
  id: string
  invoiceNumber: string
  customer: string
  items: { name: string; quantity: number; price: number }[]
  subtotal: number
  discount: number
  total: number
  status: PaymentStatus
  paymentMethod: PaymentMethod
  createdAt: string
  dueDate?: string
}

export interface Expense {
  id: string
  description: string
  category: ExpenseCategory
  amount: number
  date: string
  paymentMethod: PaymentMethod
  recordedBy: string
  receipt?: string
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  phone: string
  active: boolean
  lastLogin: string
}

export interface HousekeepingTask {
  id: string
  roomNumber: string
  assignedTo: string
  status: HousekeepingStatus
  priority: MaintenancePriority
  notes: string
  createdAt: string
  completedAt?: string
}

export interface MaintenanceRequest {
  id: string
  roomNumber: string
  description: string
  priority: MaintenancePriority
  status: "open" | "in_progress" | "resolved" | "closed"
  reportedBy: string
  assignedTo?: string
  createdAt: string
  resolvedAt?: string
}

export interface CashReconciliation {
  id: string
  date: string
  openingBalance: number
  cashReceived: number
  cashPaid: number
  expectedBalance: number
  actualBalance: number
  variance: number
  reconciledBy: string
  reconciledAt: string
}



// ===== Dashboard table for real backend =====
export interface DashboardTable {
  id: string;
  number: string;
  table_number?: string;
  table_name?: string;
  status: 'free' | 'occupied' | 'reserved' | 'dirty' | 'needs_checkout' | 'needs_payment' | 'cleaning' | 'maintenance' | 'out_of_order' | 'available' | 'disabled';
  capacity: number;
  currentOrder?: string;
  currentBooking?: string;
  guestName?: string;
  occupiedSince?: string;
  totalAmount?: number;
  paidAmount?: number;
  running_total?: number;
  order_count?: number;
  display_order?: number;
  paymentStatus?: string;
  pendingItems?: number;
  lastUpdated?: string;
  name?: string;
  area?: string;
  type?: string;
  minimumCharge?: number;
  orders?: OrderBatchItem[];
  bill?: OrderBatch;
  lastOrderTime?: string;
  restaurant_tables?: { table_number?: string };
}

export type RoomStatus = 'vacant' | 'occupied' | 'reserved' | 'maintenance' | 'dirty' | 'cleaning' | 'out_of_order' | 'available' | 'partial_paid' | 'fully_paid'

// ===== Room for real backend =====
export interface Room {
  id: string;
  number: string;
  room_number?: string;
  name?: string;
  type: string;
  floor: number;
  status: RoomStatus;
  pricePerNight?: number;
  price?: number;
  capacity?: number;
  amenities: string[];
  isActive?: boolean;
  currentBooking?: Booking;
  lastUpdated?: string;
  guest?: string;
  checkIn?: string;
  checkOut?: string;
  room_types?: { id?: string; name?: string };
  room_type_id?: string;
}

// ===== Room type =====
export interface RoomType {
  id: string;
  name: string;
  description: string;
  pricePerNight: number;
  capacity: number;
  amenities: string[];
}

// ===== Booking for real backend =====
export interface Booking {
  id: string;
  booking_number?: string;
  guestName: string;
  guest_name?: string;
  guestEmail: string;
  guest_email?: string;
  guestPhone: string;
  guest_phone?: string;
  roomId: string;
  room_id?: string;
  checkIn: string;
  check_in?: string;
  checkOut: string;
  check_out?: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  totalAmount: number;
  total?: number;
  paidAmount: number;
  paid_amount?: number;
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  payment_status?: string;
  payment_method?: string;
  specialRequests?: string;
  createdAt: string;
  created_at?: string;
  rooms?: Room;
}

// ===== Order for real backend =====
export interface Order {
  id: string;
  order_number?: string;
  tableId?: string;
  tableNumber?: string;
  table_number?: string;
  items: (OrderItem | string)[];
  order_items?: Array<{ item_name: string; quantity?: number; price?: number }>;
  status: 'pending' | 'completed' | 'cancelled' | 'processing';
  totalAmount?: number;
  total?: number;
  paidAmount?: number;
  paymentStatus?: 'pending' | 'partial' | 'paid' | 'refunded';
  paymentMethod?: string;
  payment_method?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  // Backward-compat fields for old pages
  orderId?: string;
  customer?: string;
  tableRoom?: string;
  channel?: SalesChannel;
  time?: string;
  restaurant_tables?: { table_number?: string };
}

// ===== Order item =====
export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  status: 'pending' | 'paid' | 'cancelled' | 'voided';
}

// ─── Order Batch System ─────────────────────────────────────
export type CartItemStatus = 'pending' | 'paid' | 'credit' | 'cancelled' | 'voided'

export interface OrderBatchItem {
  id: string;
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  notes: string;
  status: CartItemStatus;
  batch_id: string;
}

export interface OrderBatch {
  id: string;
  table_id: string;
  customer_name?: string;
  items: OrderBatchItem[];
  status: 'pending' | 'partial' | 'paid';
  created_at: string;
  is_locked: boolean;
  subtotal: number;
  discount?: number;
  paid_amount: number;
}

// ===== Payment breakdown =====
export interface PaymentBreakdown {
  method: string;
  amount: number;
  count: number;
}

// ===== Hourly data for dashboard chart =====
export interface HourlyData {
  hour: number;
  orders: number;
  revenue: number;
}

// ===== Revenue data =====
export interface RevenueData {
  date: string;
  amount: number;
  orders: number;
}

// ===== Stock movement =====
export interface StockMovement {
  date: string;
  in: number;
  out: number;
}

// ===== Analytics types =====
export interface QueueAnalytics {
  averageWaitTime: number;
  maxWaitTime: number;
  tablesServed: number;
  averageTableTurnover: number;
  peakHour: number;
  currentQueueLength: number;
}

export interface StaffRoleDistribution {
  role: string;
  count: number;
  percentage: number;
}

export interface LowStockProduct {
  name: string;
  currentStock: number;
  minStock: number;
  unit: string;
  category: string;
}

export interface RevenueForecast {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
}

export interface OccupancyForecast {
  date: string;
  predicted: number;
  confidence: number;
}
