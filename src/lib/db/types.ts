/**
 * Database Row Types
 * ──────────────────
 *
 * TypeScript interfaces matching the PostgreSQL tables (snake_case)
 * as returned by InsForge's PostgREST API.
 *
 * These represent raw database rows. For frontend display, map
 * to camelCase types in @/types as needed.
 */

// ─── Branches ──────────────────────────────────────────────

export interface BranchRow {
  id: string
  name: string
  address: string
  phone: string
  manager: string
  active: boolean
  created_at: string
  updated_at: string
}

// ─── Restaurant Tables ────────────────────────────────────

export interface RestaurantTableRow {
  id: string
  table_number: string
  capacity: number
  section: string
  branch_id: string | null
  display_order: number
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance' | 'disabled'
  created_at: string
  updated_at: string
}

// ─── Menu Categories ───────────────────────────────────────

export interface MenuCategoryRow {
  id: string
  name: string
  slug: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Menu Items ────────────────────────────────────────────

export interface MenuItemRow {
  id: string
  category_id: string
  name: string
  description: string | null
  price: number
  options: Record<string, unknown> | null
  image_url: string | null
  display_order: number
  is_available: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Customers ─────────────────────────────────────────────

export interface CustomerRow {
  id: string
  name: string
  phone: string
  email: string
  address: string
  last_visit: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Room Types ────────────────────────────────────────────

export interface RoomTypeRow {
  id: string
  name: string
  description: string
  price_per_night: number
  capacity: number
  amenities: string[]
  created_at: string
  updated_at: string
}

// ─── Rooms ─────────────────────────────────────────────────

export interface RoomRow {
  id: string
  room_number: string
  room_type_id: string | null
  floor: number
  price_per_night: number
  amenities: string[]
  status: 'vacant' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance' | 'out_of_order' | 'available' | 'dirty'
  branch_id: string | null
  created_at: string
  updated_at: string
}

// ─── Bookings ──────────────────────────────────────────────

export interface BookingRow {
  id: string
  booking_number: string | null
  guest_name: string
  guest_email: string
  guest_phone: string
  room_id: string
  check_in: string
  check_out: string
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled'
  total_amount: number
  paid_amount: number
  discount: number
  payment_status: 'pending' | 'partial' | 'paid' | 'refunded'
  payment_method: string | null
  special_requests: string | null
  adults: number
  children: number
  user_id: string | null
  created_at: string
  updated_at: string
}

// ─── Order Batches ─────────────────────────────────────────

export interface OrderBatchRow {
  id: string
  table_id: string | null
  room_id: string | null
  customer_name: string | null
  customer_id: string | null
  status: 'pending' | 'partial' | 'paid' | 'cancelled'
  is_locked: boolean
  subtotal: number
  discount: number
  paid_amount: number
  user_id: string | null
  created_at: string
  updated_at: string
}

// ─── Order Batch Items ─────────────────────────────────────

export interface OrderBatchItemRow {
  id: string
  batch_id: string
  menu_item_id: string | null
  name: string
  quantity: number
  unit_price: number
  notes: string
  status: 'pending' | 'paid' | 'credit' | 'cancelled' | 'voided'
  voided_at: string | null
  voided_by: string | null
  created_at: string
}

// ─── Invoices ──────────────────────────────────────────────

export interface InvoiceRow {
  id: string
  invoice_number: string
  customer_id: string | null
  customer_name: string
  table_id: string | null
  booking_id: string | null
  order_batch_ids: string[]
  subtotal: number
  tax: number
  discount: number
  total: number
  status: 'paid' | 'pending' | 'overdue' | 'partial' | 'credit_invoice' | 'cancelled'
  payment_method: string | null
  due_date: string | null
  user_id: string | null
  created_at: string
  updated_at: string
}

// ─── Invoice Items ─────────────────────────────────────────

export interface InvoiceItemRow {
  id: string
  invoice_id: string
  menu_item_id: string | null
  name: string
  quantity: number
  unit_price: number
  total_price: number
  created_at: string
}

// ─── Payments ──────────────────────────────────────────────

export interface PaymentRow {
  id: string
  invoice_id: string | null
  batch_id: string | null
  amount: number
  discount: number
  payment_method: 'cash' | 'fonepay' | 'credit' | 'reception_qr'
  reference: string | null
  customer_id: string | null
  notes: string | null
  user_id: string | null
  created_at: string
}

// ─── Expenses ──────────────────────────────────────────────

export interface ExpenseRow {
  id: string
  description: string
  category: 'utilities' | 'supplies' | 'maintenance' | 'staff' | 'marketing' | 'other'
  amount: number
  date: string
  payment_method: 'cash' | 'fonepay' | 'credit' | 'reception_qr'
  recorded_by: string | null
  receipt_url: string | null
  notes: string | null
  vendor: string | null
  receipt_number: string | null
  created_at: string
  updated_at: string | null
}

// ─── Cash Reconciliations ──────────────────────────────────

export interface CashReconciliationRow {
  id: string
  date: string
  opening_balance: number
  cash_received: number
  cash_paid: number
  expected_balance: number
  actual_balance: number
  variance: number
  reconciled_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Suppliers ─────────────────────────────────────────────

export interface SupplierRow {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  address: string
  total_orders: number
  outstanding_balance: number
  rating: number
  created_at: string
  updated_at: string
}

// ─── Inventory Items ───────────────────────────────────────

export interface InventoryItemRow {
  id: string
  name: string
  category: string
  current_stock: number
  min_stock: number
  unit: string
  cost_per_unit: number
  supplier_id: string | null
  last_restocked: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Stock Movements ───────────────────────────────────────

export interface StockMovementRow {
  id: string
  item_id: string
  type: 'add' | 'remove' | 'create' | 'update'
  quantity: number
  previous_stock: number
  new_stock: number
  user_id: string | null
  notes: string | null
  created_at: string
}

// ─── Purchase Orders ───────────────────────────────────────

export interface PurchaseOrderRow {
  id: string
  po_number: string | null
  supplier_id: string
  supplier_name: string
  total_amount: number
  status: 'pending' | 'ordered' | 'received' | 'cancelled'
  order_date: string
  expected_delivery: string | null
  user_id: string | null
  created_at: string
  updated_at: string
}

// ─── Purchase Order Items ──────────────────────────────────

export interface PurchaseOrderItemRow {
  id: string
  po_id: string
  name: string
  quantity: number
  unit_price: number
  created_at: string
}

// ─── Supplier Payments ─────────────────────────────────────

export interface SupplierPaymentRow {
  id: string
  supplier_id: string
  supplier_name: string
  amount: number
  payment_method: string
  reference: string
  notes: string | null
  user_id: string | null
  payment_date: string
  created_at: string
}

// ─── Housekeeping Tasks ────────────────────────────────────

export interface HousekeepingTaskRow {
  id: string
  room_id: string
  room_number: string
  assigned_to: string | null
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  notes: string
  created_at: string
  completed_at: string | null
  updated_at: string
}

// ─── Maintenance Requests ──────────────────────────────────

export interface MaintenanceRequestRow {
  id: string
  room_id: string | null
  room_number: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  reported_by: string | null
  assigned_to: string | null
  created_at: string
  resolved_at: string | null
  updated_at: string
}

// ─── Activity Logs ─────────────────────────────────────────

export interface ActivityLogRow {
  id: string
  user_id: string | null
  user_name: string | null
  activity_type: string
  entity_id: string | null
  entity_label: string | null
  status: string | null
  location: string | null
  amount: number | null
  details: string | null
  ip_address: string | null
  created_at: string
}

// ─── Settings ──────────────────────────────────────────────

export interface PrintSettingsRow {
  id: string
  phone: string
  pan: string
  paper_size: '58mm' | '80mm' | 'A4'
  show_logo: boolean
  auto_print: boolean
  print_copies: number
  created_at: string
  updated_at: string
}

export interface BusinessSettingsRow {
  id: string
  business_name: string
  address: string
  phone: string
  email: string
  tax_id: string
  vat_rate: number
  service_charge: number
  tax_inclusive: boolean
  apply_vat_room_service: boolean
  apply_service_charge: 'all' | 'dine-in only' | 'disabled'
  created_at: string
  updated_at: string
}

export interface FeatureFlagRow {
  id: string
  name: string
  description: string
  enabled: boolean
  created_at: string
  updated_at: string
}

// ─── User Profiles ───────────────────────────────────────────

export interface UserProfileRow {
  id: string
  email: string
  name: string
  phone: string
  role: 'admin' | 'manager' | 'cashier' | 'waiter' | 'housekeeper' | 'receptionist'
  active: boolean
  last_login: string | null
  created_at: string
  updated_at: string
}
