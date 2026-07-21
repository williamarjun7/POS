/**
 * useActiveTableSessions — Single Source of Truth for Active Tables
 * ────────────────────────────────────────────────────────────────
 *
 * Derives active table state entirely from order_batches (the actual
 * business data). A table is "active" (occupied) if and only if it has
 * non-paid, non-cancelled order batches.
 *
 * This replaces the old pattern of manually setting restaurant_tables.status
 * to 'occupied'/'available', which was unreliable and could desync.
 *
 * Usage:
 *   const { data: sessions } = useActiveTableSessions()
 *   const activeTables = sessions?.filter(s => s.isActive) ?? []
 */

import { useQuery } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'
import type { RestaurantTableRow } from '@/lib/db/types'

// ─── Types ───────────────────────────────────────────────────

export interface ActiveTableSession {
  /** Primary table identifier */
  tableId: string
  tableNumber: string
  capacity: number
  section: string
  displayOrder: number

  /** True when the table has at least one non-paid, non-cancelled order batch */
  isActive: boolean

  /** The raw status stored in the DB (available, reserved, cleaning, etc.) */
  dbStatus: RestaurantTableRow['status']

  /**
   * The display status:
   * - 'occupied' when isActive === true (overrides DB value)
   * - The raw DB status otherwise (reserved, cleaning, maintenance, disabled)
   */
  displayStatus: 'occupied' | RestaurantTableRow['status']

  // ── Session metadata (populated only when isActive === true) ──
  /** ISO timestamp of the earliest non-paid batch for this table */
  sessionStart: string | null
  /** Session duration in minutes (now - sessionStart) */
  sessionDuration: number | null
  /** Customer name from the earliest batch (if any) */
  customerName: string | null
  /** Number of non-paid batches */
  batchCount: number
  /** Sum of all unpaid item values across all batches */
  runningTotal: number
  /** Sum of paid_amount across all batches */
  paidAmount: number
}

// ─── Query Key ───────────────────────────────────────────────

export const TABLE_SESSIONS_KEY = ['table-sessions'] as const

// ─── Fetch function ───────────────────────────────────────────

export async function fetchActiveTableSessions(): Promise<ActiveTableSession[]> {
  // 1. Fetch all tables
  const { data: tablesData, error: tablesError } = await insforge.database
    .from('restaurant_tables')
    .select('id, table_number, capacity, section, display_order, status')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('table_number', { ascending: true })

  if (tablesError) throw tablesError
  const tableRows = (tablesData ?? []) as RestaurantTableRow[]

  // 2. Fetch non-paid batches for all tables
  const tableIds = tableRows.map(r => r.id)
  const { data: batchesData } = await insforge.database
    .from('order_batches')
    .select('id, table_id, customer_name, subtotal, paid_amount, status, created_at')
    .in('table_id', tableIds)
    .not('status', 'in', '(paid,cancelled)')

  const batches = (batchesData ?? []) as Array<{
    id: string
    table_id: string | null
    customer_name: string | null
    subtotal: number
    paid_amount: number
    status: string
    created_at: string
  }>

  // 3. Fetch items for these batches to compute running totals
  const batchIds = batches.map(b => b.id)
  const batchToTable = new Map<string, string>()
  for (const b of batches) {
    if (b.table_id) batchToTable.set(b.id, b.table_id)
  }

  const unpaidTotalByTable: Record<string, number> = {}
  if (batchIds.length > 0) {
    const { data: itemsData } = await insforge.database
      .from('order_batch_items')
      .select('batch_id, unit_price, quantity, status')
      .in('batch_id', batchIds)

    const items = (itemsData ?? []) as Array<{
      batch_id: string
      unit_price: number
      quantity: number
      status: string
    }>

    for (const item of items) {
      if (item.status !== 'paid' && item.status !== 'credit' && item.status !== 'cancelled' && item.status !== 'voided') {
        const tableId = batchToTable.get(item.batch_id)
        if (tableId) {
          unpaidTotalByTable[tableId] = (unpaidTotalByTable[tableId] ?? 0) +
            Number(item.unit_price) * item.quantity
        }
      }
    }
  }

  // 4. Group batches by table
  const batchesByTable = new Map<string, typeof batches>()
  for (const batch of batches) {
    const tid = batch.table_id!
    if (!batchesByTable.has(tid)) batchesByTable.set(tid, [])
    batchesByTable.get(tid)!.push(batch)
  }

  // 5. Build sessions — derive status from batch existence
  return tableRows.map(row => {
    const tableBatches = batchesByTable.get(row.id) ?? []
    const isActive = tableBatches.length > 0

    const sortedBatches = [...tableBatches].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const sessionStart = isActive ? sortedBatches[0].created_at : null
    const sessionDuration = sessionStart
      ? Math.floor((Date.now() - new Date(sessionStart).getTime()) / 60000)
      : null
    const customerName = isActive
      ? (sortedBatches[0].customer_name ?? null)
      : null
    const batchCount = tableBatches.length
    const runningTotal = unpaidTotalByTable[row.id] ?? 0
    const paidAmount = tableBatches.reduce((s, b) => s + Number(b.paid_amount), 0)
    const displayStatus = isActive ? 'occupied' as const : row.status

    return {
      tableId: row.id,
      tableNumber: row.table_number,
      capacity: row.capacity,
      section: row.section,
      displayOrder: row.display_order,
      isActive,
      dbStatus: row.status,
      displayStatus,
      sessionStart,
      sessionDuration,
      customerName,
      batchCount,
      runningTotal,
      paidAmount,
    }
  })
}

// ─── React Query Hook ─────────────────────────────────────────

/**
 * Single source of truth for all table session data.
 *
 * Returns every table with its derived session status computed from
 * actual order batch data rather than an imperatively-set status column.
 */
export function useActiveTableSessions() {
  return useQuery<ActiveTableSession[]>({
    queryKey: TABLE_SESSIONS_KEY,
    queryFn: fetchActiveTableSessions,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}
