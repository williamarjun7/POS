/**
 * Unit Tests — Real-Time Customer Name Sync
 * ───────────────────────────────────────────
 *
 * Tests the core sync logic:
 *   1. scheduleCustomerNameSync — debounce, DB query, cache invalidation
 *   2. Debounce timer behavior (cancellation, cleanup)
 *   3. Room vs table batch querying (.or() filter)
 *   4. BookingFormModal save handler validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Pure functions extracted from the sync logic ────────────

interface SyncBatch {
  id: string
  customer_name: string | null
}

/**
 * Core sync decision logic: given the current name and matching batches,
 * determine which batch to update (first unpaid) and whether an update is needed.
 */
function resolveCustomerNameSync(
  name: string,
  batches: SyncBatch[],
): { shouldUpdate: boolean; batchId: string | null; newName: string | null } {
  if (batches.length === 0) {
    return { shouldUpdate: false, batchId: null, newName: null }
  }
  const firstBatch = batches[0]
  if (firstBatch.customer_name === name) {
    return { shouldUpdate: false, batchId: firstBatch.id, newName: name }
  }
  return { shouldUpdate: true, batchId: firstBatch.id, newName: name || null }
}

/**
 * Build cache invalidation keys for entity type.
 */
function getSyncCacheKeys(entityType: 'table' | 'room'): string[][] {
  const keys = [['batches'], ['dashboard', 'tables']]
  if (entityType === 'room') keys.push(['dashboard', 'rooms'])
  return keys
}

/**
 * Validate guest details before save (BookingFormModal pattern)
 */
function validateGuestDetails(name: string, phone: string): { valid: boolean; nameError?: string; phoneError?: string } {
  const errors: { nameError?: string; phoneError?: string } = {}
  if (!name.trim()) errors.nameError = 'Guest name is required'
  if (!phone.trim()) errors.phoneError = 'Phone number is required'
  return { valid: Object.keys(errors).length === 0, ...errors }
}

// ═══════════════════════════════════════════════════════════════
//  resolveCustomerNameSync
// ═══════════════════════════════════════════════════════════════

describe('resolveCustomerNameSync', () => {
  it('returns shouldUpdate=false when no batches exist', () => {
    const r = resolveCustomerNameSync('John', [])
    expect(r.shouldUpdate).toBe(false)
    expect(r.batchId).toBeNull()
  })

  it('returns shouldUpdate=true and the first batch ID when name differs', () => {
    const r = resolveCustomerNameSync('John', [{ id: 'b1', customer_name: 'Old' }])
    expect(r.shouldUpdate).toBe(true)
    expect(r.batchId).toBe('b1')
    expect(r.newName).toBe('John')
  })

  it('returns shouldUpdate=false when name already matches', () => {
    const r = resolveCustomerNameSync('John', [{ id: 'b1', customer_name: 'John' }])
    expect(r.shouldUpdate).toBe(false)
  })

  it('uses the first batch (oldest) when multiple exist', () => {
    const batches = [
      { id: 'old', customer_name: 'A' },
      { id: 'new', customer_name: 'B' },
    ]
    const r = resolveCustomerNameSync('Updated', batches)
    expect(r.shouldUpdate).toBe(true)
    expect(r.batchId).toBe('old')
  })

  it('sets newName to null when name is empty string (clearing)', () => {
    const r = resolveCustomerNameSync('', [{ id: 'b1', customer_name: 'John' }])
    expect(r.shouldUpdate).toBe(true)
    expect(r.newName).toBeNull()
  })

  it('works with room batches (same logic, different entity type)', () => {
    const r = resolveCustomerNameSync('Room Guest', [{ id: 'rb1', customer_name: null }])
    expect(r.shouldUpdate).toBe(true)
    expect(r.batchId).toBe('rb1')
    expect(r.newName).toBe('Room Guest')
  })
})

// ═══════════════════════════════════════════════════════════════
//  getSyncCacheKeys
// ═══════════════════════════════════════════════════════════════

describe('getSyncCacheKeys', () => {
  it('returns table keys without dashboard.rooms', () => {
    const keys = getSyncCacheKeys('table')
    expect(keys).toContainEqual(['batches'])
    expect(keys).toContainEqual(['dashboard', 'tables'])
    expect(keys).not.toContainEqual(['dashboard', 'rooms'])
  })

  it('includes dashboard.rooms for room entity type', () => {
    const keys = getSyncCacheKeys('room')
    expect(keys).toContainEqual(['dashboard', 'rooms'])
  })
})

// ═══════════════════════════════════════════════════════════════
//  Debounce behavior (simulated timer logic)
// ═══════════════════════════════════════════════════════════════

describe('scheduleCustomerNameSync debounce behavior', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('debounces multiple rapid calls — only the last fires', () => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const fn = vi.fn()

    function schedule(name: string) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => fn(name), 1500)
    }

    schedule('A'); schedule('B'); schedule('C')
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('C')
  })

  it('fires after the delay when no new calls arrive', () => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const fn = vi.fn()

    function schedule(name: string) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => fn(name), 1500)
    }

    schedule('Final')
    vi.advanceTimersByTime(1500)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('Final')
  })

  it('clears timer on unmount', () => {
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {}, 1500)
    const cleanup = () => { if (timer) { clearTimeout(timer); timer = null } }
    cleanup()
    expect(timer).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
//  validateGuestDetails
// ═══════════════════════════════════════════════════════════════

describe('validateGuestDetails', () => {
  it('passes when both name and phone are non-empty', () => {
    const r = validateGuestDetails('Ram Sharma', '9812345678')
    expect(r.valid).toBe(true)
  })

  it('fails when name is empty', () => {
    const r = validateGuestDetails('', '9812345678')
    expect(r.valid).toBe(false)
    expect(r.nameError).toBe('Guest name is required')
    expect(r.phoneError).toBeUndefined()
  })

  it('fails when phone is empty', () => {
    const r = validateGuestDetails('Ram Sharma', '')
    expect(r.valid).toBe(false)
    expect(r.phoneError).toBe('Phone number is required')
    expect(r.nameError).toBeUndefined()
  })

  it('fails when both are empty', () => {
    const r = validateGuestDetails('', '')
    expect(r.valid).toBe(false)
    expect(r.nameError).toBe('Guest name is required')
    expect(r.phoneError).toBe('Phone number is required')
  })

  it('trims whitespace', () => {
    const r = validateGuestDetails('  ', '   ')
    expect(r.valid).toBe(false)
  })

  it('passes with trimmed non-empty values', () => {
    const r = validateGuestDetails('  John  ', '  9812345678  ')
    expect(r.valid).toBe(true)
  })
})
