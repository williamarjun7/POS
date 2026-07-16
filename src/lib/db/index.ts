/**
 * Database Layer — InsForge SDK
 * ──────────────────────────────
 *
 * Unified entry point for all database operations via @insforge/sdk.
 *
 * Usage:
 *   import { db, insforge } from '@/lib/db'
 *   import type { MenuItemRow } from '@/lib/db'
 *   import { getMenuItems } from '@/lib/db'
 */

// Re-export the InsForge client and typed helpers
export { insforge, db } from './insforge'
export type { InsForgeResult } from './insforge'

// Re-export all database row types
export type {
  BranchRow,
  RestaurantTableRow,
  MenuCategoryRow,
  MenuItemRow,
  CustomerRow,
  RoomTypeRow,
  RoomRow,
  BookingRow,
  OrderBatchRow,
  OrderBatchItemRow,
  InvoiceRow,
  InvoiceItemRow,
  PaymentRow,
  ExpenseRow,
  CashReconciliationRow,
  SupplierRow,
  InventoryItemRow,
  StockMovementRow,
  PurchaseOrderRow,
  PurchaseOrderItemRow,
  SupplierPaymentRow,
  HousekeepingTaskRow,
  MaintenanceRequestRow,
  ActivityLogRow,
  PrintSettingsRow,
  BusinessSettingsRow,
  FeatureFlagRow,
  UserProfileRow,
} from './types'

// Re-export domain operations
export {
  getMenuCategories,
  getMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  createMenuCategory,
  deleteMenuCategory,
} from './menu'
