/**
 * Polling & Realtime Subscription Service
 * ────────────────────────────────────────
 *
 * Centralizes periodic cache invalidation for React Query via:
 * 1. Polling (setInterval) — invalidates cached query keys on a timer.
 * 2. WebSocket channels — uses InsForge/Supabase realtime to subscribe
 *    to PostgreSQL changes on key tables for true push-based updates.
 *
 * The polling approach acts as a reliable fallback. WebSocket channels
 * provide near-instant updates when data changes in the database.
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'

type Unsubscribe = () => void

// ─── Query key groups ────────────────────────────────────────

const DASHBOARD_KEYS: QueryKey[] = [
  ['dashboard', 'tables'],
  ['dashboard', 'rooms'],
  ['dashboard', 'report'],
  ['dashboard', 'pendingInvoices'],
  ['dashboard', 'activeBookings'],
  ['dashboard', 'activity'],
  ['dashboard', 'orders'],
  ['table-sessions'],
]

const OPERATIONS_KEYS: QueryKey[] = [
  ['operations'],
  ['dashboard', 'tables'],
  ['dashboard', 'rooms'],
]

/**
 * Start all global polling subscriptions.
 * Call once (e.g. from App.tsx) to keep every module in sync.
 */
export function startRealtimePolling(queryClient: QueryClient): Unsubscribe {
  const intervals: ReturnType<typeof setInterval>[] = []

  // Core dashboard data — every 5 seconds
  intervals.push(setInterval(() => {
    for (const key of DASHBOARD_KEYS) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }, 5_000))

  // Analytics — every 10 seconds
  intervals.push(setInterval(() => {
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
    queryClient.invalidateQueries({ queryKey: ['finance'] })
  }, 10_000))

  // Menu & inventory — every 15 seconds (less volatile data)
  intervals.push(setInterval(() => {
    queryClient.invalidateQueries({ queryKey: ['menu'] })
    queryClient.invalidateQueries({ queryKey: ['batches'] })
  }, 15_000))

  // Operations — every 5 seconds
  intervals.push(setInterval(() => {
    for (const key of OPERATIONS_KEYS) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }, 5_000))

  return () => {
    intervals.forEach(clearInterval)
  }
}

// ─── Table-change handlers (shared between both WebSocket paths) ─

function onOrderBatchesChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['dashboard', 'tables'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  qc.invalidateQueries({ queryKey: ['batches'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'orders'] })
}

function onOrderBatchItemsChange(qc: QueryClient) {
  // Items belong to batches — batch caches, order views, table status all change
  qc.invalidateQueries({ queryKey: ['batches'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'orders'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'tables'] })
}

function onPaymentsChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['dashboard', 'tables'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  qc.invalidateQueries({ queryKey: ['analytics'] })
  qc.invalidateQueries({ queryKey: ['finance'] })
}

function onRestaurantTablesChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['dashboard', 'tables'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  qc.invalidateQueries({ queryKey: ['operations'] })
}

function onInvoicesChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['dashboard', 'pendingInvoices'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  qc.invalidateQueries({ queryKey: ['finance'] })
}

function onRoomsChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['dashboard', 'rooms'] })
  qc.invalidateQueries({ queryKey: ['operations'] })
}

// ─── Attach all table subscriptions to a channel ──────────────

const TABLE_SUBSCRIPTIONS = [
  { table: 'order_batches', handler: onOrderBatchesChange },
  { table: 'order_batch_items', handler: onOrderBatchItemsChange },
  { table: 'payments', handler: onPaymentsChange },
  { table: 'restaurant_tables', handler: onRestaurantTablesChange },
  { table: 'invoices', handler: onInvoicesChange },
  { table: 'rooms', handler: onRoomsChange },
] as const

/**
 * Attach postgres_changes listeners for every subscribed table to the given channel.
 */
function attachTableListeners(channel: any, queryClient: QueryClient) {
  for (const { table, handler } of TABLE_SUBSCRIPTIONS) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => handler(queryClient),
    )
  }
  return channel
}

// ─── Real-time WebSocket subscriptions ────────────────────────

/**
 * Try to subscribe to Postgres changes on the most important tables.
 * Falls back silently if the SDK/backend doesn't support it.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToPostgresChanges(queryClient: QueryClient): Unsubscribe {
  const unsubscribers: (() => void)[] = []

  // --- Attempt 1: top-level `insforge.channel()` (InsForge SDK style) ---
  const channel = (insforge as any).channel?.('pos-realtime')
  if (channel) {
    attachTableListeners(channel, queryClient)

    channel.subscribe((status: string) => {
      if (status !== 'SUBSCRIBED') {
        console.warn('[realtime] Channel status:', status)
      } else {
        console.info('[realtime] WebSocket channel connected')
      }
    })

    unsubscribers.push(() => {
      try { (insforge as any).removeChannel?.(channel) } catch { /* ignore */ }
    })
    console.info('[realtime] WebSocket channel connected')
    return createUnsubscribe(unsubscribers)
  }

  // --- Attempt 2: `insforge.database.channel()` (Supabase SDK style) ---
  try {
    const dbChannel = (insforge.database as any).channel?.('pos-realtime-db')
    if (dbChannel) {
      attachTableListeners(dbChannel, queryClient)

      dbChannel.subscribe((status: string) => {
        console.info('[realtime] DB channel status:', status)
      })

      unsubscribers.push(() => {
        try { (insforge.database as any).removeChannel?.(dbChannel) } catch { /* ignore */ }
      })
      console.info('[realtime] WebSocket DB channel connected')
      return createUnsubscribe(unsubscribers)
    }
  } catch { /* fall through to polling */ }

  console.info('[realtime] WebSocket channels unavailable — using polling fallback')
  return () => {}
}

function createUnsubscribe(fns: (() => void)[]) {
  return () => {
    for (const fn of fns) {
      try { fn() } catch { /* ignore */ }
    }
  }
}

export function getRealtimeDiagnostics() {
  return {
    subscribedTables: TABLE_SUBSCRIPTIONS.map(s => s.table),
    polling: true,
  }
}
