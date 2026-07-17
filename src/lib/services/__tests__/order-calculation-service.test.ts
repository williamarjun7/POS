/**
 * Unit tests for OrderCalculationService
 * ───────────────────────────────────────
 *
 * Tests the pure calculation functions that serve as the single source
 * of truth for all order total computations across the application.
 *
 * These are pure functions — no DB mocking needed.
 */

import { describe, it, expect } from 'vitest'
import type { OrderBatch, OrderBatchItem } from '@/types'
import {
  isItemBillable,
  isBatchBillable,
  isVoided,
  isSettledStatus,
  getBillableBatches,
  getBillableItems,
  itemSubtotal,
  itemsTotal,
  billableItemsTotal,
  calculateRunningTotal,
  calculateTotalWithCart,
  countBillableItems,
  hasBillableItems,
  collectBillableItems,
  countVoidedItems,
  voidedItemsTotal,
  getVoidedSummary,
} from '../order-calculation-service'

// ─── Helpers ────────────────────────────────────────────────

function makeItem(overrides: Partial<OrderBatchItem> = {}): OrderBatchItem {
  return {
    id: 'item-1',
    menu_item_id: 'menu-1',
    name: 'Test Item',
    quantity: 2,
    unit_price: 100,
    notes: '',
    status: 'pending',
    batch_id: 'batch-1',
    ...overrides,
  }
}

function makeBatch(overrides: Partial<OrderBatch> = {}): OrderBatch {
  return {
    id: 'batch-1',
    table_id: 'table-1',
    items: [],
    status: 'pending',
    created_at: '2026-07-14T10:00:00Z',
    is_locked: true,
    subtotal: 0,
    paid_amount: 0,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
//  isItemBillable — the core void exclusion predicate
// ═══════════════════════════════════════════════════════════════

describe('isItemBillable', () => {
  it('returns true for pending items', () => {
    expect(isItemBillable(makeItem({ status: 'pending' }))).toBe(true)
  })

  it('returns false for paid items', () => {
    expect(isItemBillable(makeItem({ status: 'paid' }))).toBe(false)
  })

  it('returns false for credit items', () => {
    expect(isItemBillable(makeItem({ status: 'credit' }))).toBe(false)
  })

  it('returns false for cancelled items', () => {
    expect(isItemBillable(makeItem({ status: 'cancelled' }))).toBe(false)
  })

  it('returns false for voided items — VOIDED items excluded from billing', () => {
    expect(isItemBillable(makeItem({ status: 'voided' }))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
//  isBatchBillable
// ═══════════════════════════════════════════════════════════════

describe('isBatchBillable', () => {
  it('returns true for pending batches', () => {
    expect(isBatchBillable(makeBatch({ status: 'pending' }))).toBe(true)
  })

  it('returns true for partial batches', () => {
    expect(isBatchBillable(makeBatch({ status: 'partial' }))).toBe(true)
  })

  it('returns false for paid batches', () => {
    expect(isBatchBillable(makeBatch({ status: 'paid' }))).toBe(false)
  })

  it('returns false for cancelled batches', () => {
    expect(isBatchBillable(makeBatch({ status: 'cancelled' }))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
//  isVoided
// ═══════════════════════════════════════════════════════════════

describe('isVoided', () => {
  it('returns true for voided items', () => {
    expect(isVoided(makeItem({ status: 'voided' }))).toBe(true)
  })

  it('returns false for non-voided items', () => {
    expect(isVoided(makeItem({ status: 'pending' }))).toBe(false)
    expect(isVoided(makeItem({ status: 'paid' }))).toBe(false)
    expect(isVoided(makeItem({ status: 'credit' }))).toBe(false)
    expect(isVoided(makeItem({ status: 'cancelled' }))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
//  isSettledStatus
// ═══════════════════════════════════════════════════════════════

describe('isSettledStatus', () => {
  it('returns true for settled statuses (paid, credit, cancelled, voided)', () => {
    expect(isSettledStatus('paid')).toBe(true)
    expect(isSettledStatus('credit')).toBe(true)
    expect(isSettledStatus('cancelled')).toBe(true)
    expect(isSettledStatus('voided')).toBe(true)
  })

  it('returns false for pending status', () => {
    expect(isSettledStatus('pending')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
//  getBillableBatches
// ═══════════════════════════════════════════════════════════════

describe('getBillableBatches', () => {
  it('filters out paid and cancelled batches', () => {
    const batches = [
      makeBatch({ id: 'b1', status: 'pending' }),
      makeBatch({ id: 'b2', status: 'partial' }),
      makeBatch({ id: 'b3', status: 'paid' }),
      makeBatch({ id: 'b4', status: 'cancelled' }),
    ]
    const result = getBillableBatches(batches)
    expect(result).toHaveLength(2)
    expect(result.map(b => b.id)).toEqual(['b1', 'b2'])
  })
})

// ═══════════════════════════════════════════════════════════════
//  getBillableItems
// ═══════════════════════════════════════════════════════════════

describe('getBillableItems', () => {
  it('filters out paid, credit, cancelled, and voided items', () => {
    const items = [
      makeItem({ id: 'i1', status: 'pending' }),
      makeItem({ id: 'i2', status: 'paid' }),
      makeItem({ id: 'i3', status: 'credit' }),
      makeItem({ id: 'i4', status: 'cancelled' }),
      makeItem({ id: 'i5', status: 'voided' }),
    ]
    const result = getBillableItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('i1')
  })
})

// ═══════════════════════════════════════════════════════════════
//  itemSubtotal
// ═══════════════════════════════════════════════════════════════

describe('itemSubtotal', () => {
  it('calculates unit_price × quantity', () => {
    expect(itemSubtotal(makeItem({ unit_price: 150, quantity: 3 }))).toBe(450)
  })

  it('handles zero quantity', () => {
    expect(itemSubtotal(makeItem({ quantity: 0 }))).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
//  itemsTotal — all statuses included
// ═══════════════════════════════════════════════════════════════

describe('itemsTotal', () => {
  it('sums all items regardless of status', () => {
    const items = [
      makeItem({ unit_price: 100, quantity: 2, status: 'pending' }),   // 200
      makeItem({ unit_price: 50, quantity: 1, status: 'paid' }),       // 50
      makeItem({ unit_price: 200, quantity: 1, status: 'voided' }),    // 200
    ]
    expect(itemsTotal(items)).toBe(450)
  })
})

// ═══════════════════════════════════════════════════════════════
//  billableItemsTotal — voided items excluded
// ═══════════════════════════════════════════════════════════════

describe('billableItemsTotal', () => {
  it('excludes voided items from total', () => {
    const items = [
      makeItem({ unit_price: 100, quantity: 2, status: 'pending' }),   // 200 — billable
      makeItem({ unit_price: 50, quantity: 1, status: 'paid' }),       // 50  — excluded
      makeItem({ unit_price: 200, quantity: 1, status: 'voided' }),    // 200 — excluded
      makeItem({ unit_price: 30, quantity: 3, status: 'credit' }),     // 90  — excluded
      makeItem({ unit_price: 75, quantity: 2, status: 'cancelled' }),  // 150 — excluded
    ]
    expect(billableItemsTotal(items)).toBe(200)
  })

  it('returns 0 when all items are voided', () => {
    const items = [
      makeItem({ unit_price: 100, quantity: 2, status: 'voided' }),
      makeItem({ unit_price: 50, quantity: 1, status: 'voided' }),
    ]
    expect(billableItemsTotal(items)).toBe(0)
  })

  it('returns 0 for empty list', () => {
    expect(billableItemsTotal([])).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
//  calculateRunningTotal — end-to-end with voided items
// ═══════════════════════════════════════════════════════════════

describe('calculateRunningTotal', () => {
  it('sums billable items across billable batches, excluding voided', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [
          makeItem({ id: 'i1', unit_price: 100, quantity: 1, status: 'pending' }),  // 100
          makeItem({ id: 'i2', unit_price: 50, quantity: 2, status: 'voided' }),    // excluded
        ],
      }),
      makeBatch({
        id: 'b2',
        status: 'partial',
        items: [
          makeItem({ id: 'i3', unit_price: 200, quantity: 1, status: 'pending' }),  // 200
        ],
      }),
      makeBatch({
        id: 'b3',
        status: 'paid',  // entire batch excluded
        items: [
          makeItem({ id: 'i4', unit_price: 500, quantity: 1, status: 'pending' }),
        ],
      }),
    ]
    expect(calculateRunningTotal(batches)).toBe(300)
  })

  it('returns 0 when all items in billable batches are voided', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [
          makeItem({ id: 'i1', unit_price: 100, quantity: 2, status: 'voided' }),
          makeItem({ id: 'i2', unit_price: 50, quantity: 1, status: 'voided' }),
        ],
      }),
    ]
    expect(calculateRunningTotal(batches)).toBe(0)
  })

  it('returns 0 for empty batch list', () => {
    expect(calculateRunningTotal([])).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
//  calculateTotalWithCart
// ═══════════════════════════════════════════════════════════════

describe('calculateTotalWithCart', () => {
  it('adds running total and cart subtotal', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [makeItem({ unit_price: 200, quantity: 1, status: 'pending' })],
      }),
    ]
    const cartSubtotal = 150
    expect(calculateTotalWithCart(batches, cartSubtotal)).toBe(350)
  })
})

// ═══════════════════════════════════════════════════════════════
//  countBillableItems
// ═══════════════════════════════════════════════════════════════

describe('countBillableItems', () => {
  it('counts quantity of billable items only, excluding voided', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [
          makeItem({ quantity: 2, status: 'pending' }),   // counts: 2
          makeItem({ quantity: 3, status: 'voided' }),     // excluded
        ],
      }),
    ]
    expect(countBillableItems(batches)).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════
//  hasBillableItems
// ═══════════════════════════════════════════════════════════════

describe('hasBillableItems', () => {
  it('returns true when batches have billable items', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [makeItem({ status: 'pending' })],
      }),
    ]
    expect(hasBillableItems(batches)).toBe(true)
  })

  it('returns false when all items are voided', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [makeItem({ status: 'voided' })],
      }),
    ]
    expect(hasBillableItems(batches)).toBe(false)
  })

  it('returns false for empty batch list', () => {
    expect(hasBillableItems([])).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
//  collectBillableItems
// ═══════════════════════════════════════════════════════════════

describe('collectBillableItems', () => {
  it('returns only billable items from billable batches', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [
          makeItem({ id: 'i1', status: 'pending' }),
          makeItem({ id: 'i2', status: 'voided' }),
          makeItem({ id: 'i3', status: 'paid' }),
        ],
      }),
      makeBatch({
        id: 'b2',
        status: 'paid',  // batch excluded
        items: [makeItem({ id: 'i4', status: 'pending' })],
      }),
    ]
    const result = collectBillableItems(batches)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('i1')
  })
})

// ═══════════════════════════════════════════════════════════════
//  countVoidedItems
// ═══════════════════════════════════════════════════════════════

describe('countVoidedItems', () => {
  it('counts total quantity of voided items', () => {
    const items = [
      makeItem({ quantity: 2, status: 'voided' }),
      makeItem({ quantity: 5, status: 'voided' }),
      makeItem({ quantity: 1, status: 'pending' }),  // not voided
    ]
    expect(countVoidedItems(items)).toBe(7)
  })

  it('returns 0 when no voided items', () => {
    expect(countVoidedItems([makeItem({ status: 'pending' })])).toBe(0)
  })

  it('returns 0 for empty list', () => {
    expect(countVoidedItems([])).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
//  voidedItemsTotal
// ═══════════════════════════════════════════════════════════════

describe('voidedItemsTotal', () => {
  it('calculates total value of voided items only', () => {
    const items = [
      makeItem({ unit_price: 100, quantity: 2, status: 'voided' }),  // 200
      makeItem({ unit_price: 50, quantity: 3, status: 'voided' }),   // 150
      makeItem({ unit_price: 500, quantity: 1, status: 'pending' }), // excluded
    ]
    expect(voidedItemsTotal(items)).toBe(350)
  })

  it('returns 0 when no voided items', () => {
    expect(voidedItemsTotal([makeItem({ status: 'pending' })])).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
//  getVoidedSummary — end-to-end voided reporting
// ═══════════════════════════════════════════════════════════════

describe('getVoidedSummary', () => {
  it('counts voided items and amount across billable batches', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [
          makeItem({ id: 'i1', unit_price: 100, quantity: 2, status: 'voided' }),  // count:2 amount:200
          makeItem({ id: 'i2', unit_price: 50, quantity: 1, status: 'pending' }),
        ],
      }),
      makeBatch({
        id: 'b2',
        status: 'partial',
        items: [
          makeItem({ id: 'i3', unit_price: 200, quantity: 3, status: 'voided' }),  // count:3 amount:600
        ],
      }),
      makeBatch({
        id: 'b3',
        status: 'paid',  // entire batch excluded
        items: [
          makeItem({ id: 'i4', unit_price: 500, quantity: 1, status: 'voided' }),
        ],
      }),
    ]
    const result = getVoidedSummary(batches)
    expect(result).toEqual({ count: 5, amount: 800 })
  })

  it('returns zeroes when no voided items exist', () => {
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'pending',
        items: [makeItem({ status: 'pending' })],
      }),
    ]
    expect(getVoidedSummary(batches)).toEqual({ count: 0, amount: 0 })
  })

  it('returns zeroes for empty batch list', () => {
    expect(getVoidedSummary([])).toEqual({ count: 0, amount: 0 })
  })

  it('does not count voided items from paid batches', () => {
    // Voided items in fully-paid batches should NOT be counted in the summary
    // since those batches are no longer active/billable
    const batches = [
      makeBatch({
        id: 'b1',
        status: 'paid',
        items: [
          makeItem({ id: 'i1', unit_price: 1000, quantity: 2, status: 'voided' }), // excluded
        ],
      }),
    ]
    expect(getVoidedSummary(batches)).toEqual({ count: 0, amount: 0 })
  })
})
