/**
 * Menu data layer tests
 * ─────────────────────
 * Regression coverage for menu item fetching. The Menu Management screen used
 * to request a single 99-row page and count only that page, so both the list
 * and every count derived from it were capped once the menu grew past it.
 *
 * Mocks:
 * - insforge.database PostgREST query builder (chainable + thenable)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAllMenuItems, getMenuItems } from '../menu'
import { insforge } from '@/lib/services/auth-service'

vi.mock('@/lib/services/auth-service', () => ({
  insforge: {
    database: { from: vi.fn() },
  },
}))

// ─── Fake PostgREST table ───────────────────────────────────

type Row = Record<string, unknown>

const CATEGORY_ROW: Row = { id: 'cat-1', name: 'Coffee' }

function makeRow(index: number): Row {
  return {
    id: `item-${index}`,
    name: `Item ${index}`,
    description: null,
    price: 100 + index,
    category_id: 'cat-1',
    is_available: index % 3 !== 0,
    is_active: true,
    image_url: null,
    has_packaging: false,
    packaging_fee: 0,
    display_order: index,
  }
}

/** Replaces insforge.database.from with a table backed by `rows`. */
function mockTable(rows: Row[], categories: Row[] = [CATEGORY_ROW]) {
  const ranges: Array<[number, number]> = []

  const from = vi.fn((table: string) => {
    let filtered = table === 'menu_categories' ? categories : rows
    let offset = 0
    let limit = filtered.length

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filtered = filtered.filter((row) => row[column] === value)
        return builder
      },
      ilike: () => builder,
      order: () => builder,
      range: (start: number, end: number) => {
        offset = start
        limit = end - start + 1
        ranges.push([start, end])
        return builder
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: filtered.slice(offset, offset + limit),
          error: null,
          count: filtered.length,
        }).then(resolve),
    }

    return builder
  })

  ;(insforge.database.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(from)

  return { from, ranges }
}

// ─── getAllMenuItems ────────────────────────────────────────

describe('getAllMenuItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the whole menu and the exact total with more than 99 items', async () => {
    mockTable(Array.from({ length: 127 }, (_, i) => makeRow(i + 1)))

    const result = await getAllMenuItems()

    expect(result.data).toHaveLength(127)
    expect(result.total).toBe(127)
  })

  it('pages through every batch instead of stopping at one page', async () => {
    const { ranges } = mockTable(Array.from({ length: 1200 }, (_, i) => makeRow(i + 1)))

    const result = await getAllMenuItems()

    expect(result.data).toHaveLength(1200)
    expect(result.total).toBe(1200)
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ])
  })

  it('loads unavailable items too, so status filters and counts see them', async () => {
    mockTable(Array.from({ length: 120 }, (_, i) => makeRow(i + 1)))

    const result = await getAllMenuItems()

    expect(result.data.filter((item) => !item.available)).toHaveLength(40)
    expect(result.data.filter((item) => item.available)).toHaveLength(80)
  })

  it('reports the count of the filtered set when filters are applied', async () => {
    mockTable(Array.from({ length: 130 }, (_, i) => makeRow(i + 1)))

    const result = await getAllMenuItems({ available: true })

    expect(result.data).toHaveLength(87)
    expect(result.total).toBe(87)
  })
})

// ─── getMenuItems (explicit pagination is preserved) ────────

describe('getMenuItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('still honours an explicit page and pageSize', async () => {
    mockTable(Array.from({ length: 1200 }, (_, i) => makeRow(i + 1)))

    const page1 = await getMenuItems({ page: 1, pageSize: 99 })
    expect(page1.data).toHaveLength(99)
    expect(page1.total).toBe(1200)
    expect(page1.totalPages).toBe(13)

    const page2 = await getMenuItems({ page: 2, pageSize: 99 })
    expect(page2.data[0].id).toBe('item-100')
  })
})
