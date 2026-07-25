/**
 * Centralized Cache Invalidation
 * ──────────────────────────────
 * Single source of truth for invalidating React Query caches after mutations.
 *
 * Every mutation handler should call `invalidateAfterMutation(queryClient, type)`
 * rather than manually specifying cache keys. This ensures:
 *   - All related pages refresh together
 *   - No cache keys are missed
 *   - The invalidation pattern is consistent across the app
 *
 * Usage:
 *   import { invalidateAfterMutation } from '@/lib/services/cache-invalidation'
 *
 *   // In mutation onSuccess:
 *   invalidateAfterMutation(queryClient, 'payment_created', { invoiceId })
 */

import type { QueryClient } from '@tanstack/react-query'
import { invoiceKeys } from '@/lib/core/query-keys'

// ─── Mutation types ─────────────────────────────────────────

export type MutationType =
  | 'payment_created'
  | 'invoice_created'
  | 'invoice_cancelled'
  | 'invoice_updated'
  | 'expense_created'
  | 'expense_updated'
  | 'expense_deleted'
  | 'customer_created'
  | 'customer_updated'
  | 'customer_deleted'
  | 'order_created'
  | 'order_voided'
  | 'menu_item_created'
  | 'menu_item_updated'
  | 'menu_item_deleted'
  | 'menu_category_created'
  | 'menu_category_deleted'
  | 'room_updated'
  | 'room_status_changed'
  | 'table_updated'
  | 'table_status_changed'
  | 'booking_created'
  | 'booking_updated'
  | 'booking_cancelled'
  | 'booking_deleted'
  | 'inventory_updated'
  | 'stock_moved'
  | 'print_settings_updated'
  | 'settings_updated'

// ─── Context for targeted invalidation ───────────────────────

export interface InvalidationContext {
  invoiceId?: string
  customerId?: string
  tableId?: string
  roomId?: string
  bookingId?: string
  menuItemId?: string
  expenseId?: string
  inventoryItemId?: string
}

// ─── Cache group definitions ─────────────────────────────────

/**
 * Each mutation type maps to the set of cache key groups that need invalidation.
 * This is the SINGLE source of truth for what refreshes when.
 */
const INVALIDATION_MAP: Record<MutationType, { keys: unknown[][]; refetchType?: 'active' | 'all' }> = {
  // ── Payments ──────────────────────────────────────────
  payment_created: {
    keys: [
      ['dashboard'],
      ['batches'],
      ['finance'],
      ['analytics'],
      ['customers'],
    ],
    refetchType: 'all',
  },
  // ── Invoices ──────────────────────────────────────────
  invoice_created: {
    keys: [
      ['dashboard'],
      ['batches'],
      ['finance'],
      ['analytics'],
    ],
    refetchType: 'all',
  },
  invoice_cancelled: {
    keys: [
      ['dashboard'],
      ['batches'],
      ['finance'],
      ['analytics'],
      ['customers'],
    ],
    refetchType: 'all',
  },
  invoice_updated: {
    keys: [
      ['dashboard', 'report'],
      ['finance'],
      ['analytics'],
    ],
    refetchType: 'all',
  },

  // ── Expenses ──────────────────────────────────────────
  expense_created: {
    keys: [
      ['expenses'],
      ['finance'],
      ['analytics'],
      ['dashboard', 'report'],
    ],
  },
  expense_updated: {
    keys: [
      ['expenses'],
      ['finance'],
      ['analytics'],
      ['dashboard', 'report'],
    ],
  },
  expense_deleted: {
    keys: [
      ['expenses'],
      ['finance'],
      ['analytics'],
      ['dashboard', 'report'],
    ],
  },

  // ── Customers ─────────────────────────────────────────
  customer_created: { keys: [['customers']] },
  customer_updated: { keys: [['customers'], ['dashboard', 'report']] },
  customer_deleted: { keys: [['customers'], ['finance'], ['analytics']] },

  // ── Orders (POS) ──────────────────────────────────────
  order_created: {
    keys: [
      ['dashboard'],
      ['batches'],
      ['operations'],
    ],
  },
  order_voided: {
    keys: [
      ['dashboard'],
      ['batches'],
      ['finance'],
      ['analytics'],
    ],
  },

  // ── Menu ──────────────────────────────────────────────
  menu_item_created: { keys: [['menu']] },
  menu_item_updated: { keys: [['menu']] },
  menu_item_deleted: { keys: [['menu']] },
  menu_category_created: { keys: [['menu', 'categories']] },
  menu_category_deleted: { keys: [['menu', 'categories']] },

  // ── Rooms ─────────────────────────────────────────────
  room_updated: {
    keys: [
      ['dashboard', 'rooms'],
      ['dashboard', 'report'],
      ['operations'],
      ['analytics'],
      ['finance'],
    ],
  },
  room_status_changed: {
    keys: [
      ['dashboard', 'rooms'],
      ['operations'],
    ],
  },

  // ── Tables ────────────────────────────────────────────
  table_updated: {
    keys: [
      ['dashboard', 'tables'],
      ['dashboard', 'report'],
      ['operations'],
      ['analytics'],
      ['finance'],
    ],
  },
  table_status_changed: {
    keys: [
      ['dashboard', 'tables'],
      ['operations'],
    ],
  },

  // ── Bookings ──────────────────────────────────────────
  booking_created: {
    keys: [
      ['dashboard', 'rooms'],
      ['dashboard', 'activeBookings'],
      ['dashboard', 'report'],
    ],
  },
  booking_updated: {
    keys: [
      ['dashboard', 'rooms'],
      ['dashboard', 'activeBookings'],
    ],
  },
  booking_cancelled: {
    keys: [
      ['dashboard', 'rooms'],
      ['dashboard', 'activeBookings'],
      ['dashboard', 'report'],
    ],
  },
  booking_deleted: {
    keys: [
      ['dashboard', 'rooms'],
      ['dashboard', 'activeBookings'],
    ],
  },

  // ── Inventory ─────────────────────────────────────────
  inventory_updated: {
    keys: [
      ['inventory'],
      ['dashboard', 'report'],
      ['analytics'],
    ],
  },
  stock_moved: {
    keys: [
      ['inventory'],
      ['analytics'],
    ],
  },

  // ── Settings ──────────────────────────────────────────
  print_settings_updated: { keys: [['printSettings']] },
  settings_updated: { keys: [['featureFlags']] },
}

// ─── Main API ───────────────────────────────────────────────

/**
 * Invalidate all caches affected by a given mutation type.
 * Call this from mutation onSuccess handlers throughout the app.
 *
 * @param queryClient - The React Query client
 * @param type - The mutation type that occurred
 * @param context - Optional context for targeted invalidation (e.g. invoiceId)
 */
export function invalidateAfterMutation(
  queryClient: QueryClient,
  type: MutationType,
  context?: InvalidationContext,
): void {
  const config = INVALIDATION_MAP[type]
  if (!config) return

  for (const key of config.keys) {
    queryClient.invalidateQueries({
      queryKey: key as readonly unknown[],
      refetchType: config.refetchType ?? 'active',
    })
  }

  // Targeted invoice-level invalidation
  if (context?.invoiceId) {
    // invoiceKeys.detail() and invoiceKeys.payments() are subordinate keys
    // under the ['invoices'] prefix, so invalidating ['invoices'] covers them.
    // But for targeted refreshes, be explicit:
    queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(context.invoiceId), refetchType: 'active' })
    queryClient.invalidateQueries({ queryKey: invoiceKeys.payments(context.invoiceId), refetchType: 'active' })
    queryClient.invalidateQueries({ queryKey: invoiceKeys.items(context.invoiceId), refetchType: 'active' })
  }

  // Targeted customer-level invalidation
  if (context?.customerId) {
    queryClient.invalidateQueries({ queryKey: ['customers', context.customerId], refetchType: 'active' })
  }
}
