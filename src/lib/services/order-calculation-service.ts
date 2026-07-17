/**
 * OrderCalculationService
 * ──────────────────────
 *
 * SINGLE SOURCE OF TRUTH for all order calculation logic.
 *
 * Every module (POS, Dashboard, Billing, Operations, Reports) MUST use
 * these functions to compute running totals, amounts due, and billable
 * items. This ensures consistent totals across the entire application.
 *
 * Business rules:
 *   - Billable batches: status NOT in ('paid', 'cancelled')
 *   - Billable items:   status NOT in ('paid', 'credit', 'cancelled', 'voided')
 *   - Running Total = sum of (unit_price × quantity) for all billable
 *     items within billable batches, plus the current cart subtotal.
 */

import type { OrderBatch, OrderBatchItem, CartItemStatus } from '@/types'

// ─── Status constants ────────────────────────────────────────

/** Item statuses that EXCLUDE an item from all billing calculations */
const SETTLED_ITEM_STATUSES: Set<CartItemStatus> = new Set([
  'paid',
  'credit',
  'cancelled',
  'voided',
])

/** Batch statuses that EXCLUDE a batch's items from all billing calculations */
const SETTLED_BATCH_STATUSES: Set<string> = new Set([
  'paid',
  'cancelled',
])

// ─── Type predicate helpers ──────────────────────────────────

/**
 * Is this batch eligible to contribute to running totals?
 * Cancelled and fully-paid batches are excluded.
 */
export function isBatchBillable(batch: OrderBatch): boolean {
  return !SETTLED_BATCH_STATUSES.has(batch.status)
}

/**
 * Is this item eligible to contribute to running totals?
 * Paid, credit, cancelled, and voided items are excluded.
 */
export function isItemBillable(item: OrderBatchItem): boolean {
  return !SETTLED_ITEM_STATUSES.has(item.status)
}

// ─── Filter helpers ──────────────────────────────────────────

/**
 * Return only billable (non-settled) batches from a list.
 */
export function getBillableBatches(batches: OrderBatch[]): OrderBatch[] {
  return batches.filter(isBatchBillable)
}

/**
 * Return only billable (non-settled) items from a list.
 */
export function getBillableItems(items: OrderBatchItem[]): OrderBatchItem[] {
  return items.filter(isItemBillable)
}

// ─── Calculation helpers ─────────────────────────────────────

/**
 * Calculate the subtotal for a single item (unit_price × quantity).
 */
export function itemSubtotal(item: OrderBatchItem): number {
  return Number(item.unit_price) * item.quantity
}

/**
 * Calculate the total value of a list of items (all statuses included).
 */
export function itemsTotal(items: OrderBatchItem[]): number {
  return items.reduce((sum, item) => sum + itemSubtotal(item), 0)
}

/**
 * Calculate the total value of only the BILLABLE items in a list.
 */
export function billableItemsTotal(items: OrderBatchItem[]): number {
  return items.reduce((sum, item) =>
    sum + (isItemBillable(item) ? itemSubtotal(item) : 0),
  0)
}

/**
 * Calculate the running total from a list of batches.
 *
 * This is the PRIMARY calculation used everywhere:
 *   Running Total = sum of (unit_price × quantity) for all billable
 *   items within billable batches.
 *
 * @param batches - All batches for a table/entity (filtering happens internally)
 * @returns The running total (unpaid amount) across all billable batches
 */
export function calculateRunningTotal(batches: OrderBatch[]): number {
  return batches.reduce((total, batch) => {
    if (!isBatchBillable(batch)) return total
    return total + billableItemsTotal(batch.items)
  }, 0)
}

/**
 * Same as calculateRunningTotal but includes an additional new cart subtotal.
 * Used by the POS page to show the combined total of previous batches + current cart.
 */
export function calculateTotalWithCart(
  batches: OrderBatch[],
  newCartSubtotal: number,
): number {
  return calculateRunningTotal(batches) + newCartSubtotal
}

/**
 * Count total billable items (quantity count) across all batches.
 */
export function countBillableItems(batches: OrderBatch[]): number {
  return batches.reduce((count, batch) => {
    if (!isBatchBillable(batch)) return count
    return count + batch.items.reduce((c, item) =>
      c + (isItemBillable(item) ? item.quantity : 0), 0)
  }, 0)
}

/**
 * Check if any batches have billable items.
 * Used to determine if a table is "active" (has unpaid items).
 */
export function hasBillableItems(batches: OrderBatch[]): boolean {
  return batches.some(batch =>
    isBatchBillable(batch) && batch.items.some(isItemBillable),
  )
}

/**
 * Get all billable items across all billable batches.
 * Used for payment processing.
 */
export function collectBillableItems(batches: OrderBatch[]): OrderBatchItem[] {
  const items: OrderBatchItem[] = []
  for (const batch of batches) {
    if (!isBatchBillable(batch)) continue
    for (const item of batch.items) {
      if (isItemBillable(item)) {
        items.push(item)
      }
    }
  }
  return items
}

/**
 * Get all unsettled item statuses that should be considered "due".
 * This is the canonical list used for filtering across the app.
 */
export function getSettledStatuses(): CartItemStatus[] {
  return Array.from(SETTLED_ITEM_STATUSES)
}

/**
 * Check if a given status represents a settled (paid/cancelled/voided) item.
 */
export function isSettledStatus(status: CartItemStatus | string): boolean {
  return SETTLED_ITEM_STATUSES.has(status as CartItemStatus)
}

/**
 * Check if an item is voided.
 */
export function isVoided(item: OrderBatchItem): boolean {
  return item.status === 'voided'
}

/**
 * Count the total number of voided items (quantity sum) across all batches.
 */
export function countVoidedItems(items: OrderBatchItem[]): number {
  return items
    .filter(isVoided)
    .reduce((sum, item) => sum + item.quantity, 0)
}

/**
 * Calculate the total voided amount across all batches.
 */
export function voidedItemsTotal(items: OrderBatchItem[]): number {
  return items
    .filter(isVoided)
    .reduce((sum, item) => sum + itemSubtotal(item), 0)
}

/**
 * Count voided items and their total amount across billable batches.
 * Returns { count, amount } for reporting purposes.
 */
export function getVoidedSummary(batches: OrderBatch[]): { count: number; amount: number } {
  let count = 0
  let amount = 0
  for (const batch of batches) {
    if (!isBatchBillable(batch)) continue
    count += countVoidedItems(batch.items)
    amount += voidedItemsTotal(batch.items)
  }
  return { count, amount }
}
