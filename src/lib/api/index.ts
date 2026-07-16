/**
 * API Service Layer
 *
 * Entry point for all backend API interactions.
 *
 * Usage:
 *   import { db, getMenuItems, useMenuItems } from '@/lib/api'
 *
 * The layer delegates to the InsForge SDK (@insforge/sdk) for data
 * operations.
 *
 * Architecture:
 *   1. `@/lib/db/insforge.ts` — Typed helpers wrapping insforge.database
 *   2. `@/lib/db/menu.ts`     — Domain operations using the SDK
 *   3. `menu.hooks.ts`        — React Query hooks (useQuery / useMutation)
 */

// Shared API types
export type { ApiResponse, PaginatedResponse, ApiErrorData } from './types'
export type { PaginationParams, CreateMenuItemDto, UpdateMenuItemDto, CreateMenuCategoryDto, MenuItemQueryParams } from './types'

// ─── New InsForge SDK Data Layer ─────────────────────────

export { insforge, db } from '@/lib/db'
export type { InsForgeResult } from '@/lib/db'
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
} from '@/lib/db'

// Domain operations (SDK-based)
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

// React Query hooks (unchanged — they wrap the domain operations above)
export {
  useMenuCategories,
  useMenuItems,
  useMenuItem,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  useToggleMenuItemAvailability,
  useCreateMenuCategory,
  useDeleteMenuCategory,
} from './menu.hooks'
