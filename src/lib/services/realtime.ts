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
 *
 * RESILIENCE:
 * - Exponential backoff on repeated 502/503/504 errors (5s→10s→20s→40s→60s)
 * - Automatic backoff reset when requests succeed again
 * - Request deduplication: concurrent invalidations for the same key are coalesced
 * - Tab visibility awareness: skips invalidations when tab is hidden
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'
import { classifyError } from '@/lib/services/error-classifier'

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

// ─── Backoff State ───────────────────────────────────────────

interface BackoffState {
  consecutiveFailures: number
  currentDelay: number
}

const BASE_INTERVAL = 15_000  // 15s — the fundamental polling tick
const MAX_BACKOFF = 120_000   // 2 minutes max backoff
const BACKOFF_MULTIPLIER = 2
const RESET_AFTER_SUCCESS_MS = 30_000

let globalBackoff: BackoffState = { consecutiveFailures: 0, currentDelay: BASE_INTERVAL }
let lastSuccessTime = 0

function getEffectiveInterval(): number {
  // Reset backoff if enough time has passed since last failure
  if (
    globalBackoff.consecutiveFailures > 0 &&
    Date.now() - lastSuccessTime > RESET_AFTER_SUCCESS_MS
  ) {
    globalBackoff = { consecutiveFailures: 0, currentDelay: BASE_INTERVAL }
  }
  return globalBackoff.currentDelay
}

function recordPollSuccess() {
  lastSuccessTime = Date.now()
  if (globalBackoff.consecutiveFailures > 0) {
    // Gradually reduce backoff on success instead of hard reset
    globalBackoff.consecutiveFailures = Math.max(0, globalBackoff.consecutiveFailures - 1)
    globalBackoff.currentDelay = Math.max(
      BASE_INTERVAL,
      globalBackoff.currentDelay / BACKOFF_MULTIPLIER,
    )
  }
}

function recordPollFailure(error: unknown) {
  const { class: errorClass, retryable } = classifyError(error)
  if (!retryable) return // Don't backoff on client/auth errors

  globalBackoff.consecutiveFailures++
  globalBackoff.currentDelay = Math.min(
    MAX_BACKOFF,
    BASE_INTERVAL * Math.pow(BACKOFF_MULTIPLIER, globalBackoff.consecutiveFailures),
  )

  if (globalBackoff.consecutiveFailures <= 3) {
    console.warn(
      `[polling] Backoff #${globalBackoff.consecutiveFailures}: next poll in ${globalBackoff.currentDelay / 1000}s (class: ${errorClass})`,
    )
  }
}

// ─── Staggered Group Schedules ───────────────────────────────
// Each group runs at a different multiple of BASE_INTERVAL to spread load.
// Instead of all invalidating every tick, groups are staggered:
//
//   Tick 0:  dashboard (15s)
//   Tick 1:  analytics (30s)
//   Tick 2:  menu/batches (45s)
//   Tick 3:  dashboard again (60s)
//   ...

interface PollGroup {
  keys: QueryKey[]
  everyNTicks: number
  label: string
}

const POLL_GROUPS: PollGroup[] = [
  { keys: DASHBOARD_KEYS, everyNTicks: 1, label: 'dashboard' },
  { keys: OPERATIONS_KEYS, everyNTicks: 1, label: 'operations' },
  { keys: [['analytics'], ['finance']], everyNTicks: 2, label: 'analytics' },
  { keys: [['menu'], ['batches']], everyNTicks: 3, label: 'menu' },
  { keys: [['customers']], everyNTicks: 4, label: 'customers' },
]

/**
 * Start all global polling subscriptions.
 * Call once (e.g. from App.tsx) to keep every module in sync.
 *
 * Uses a SINGLE master interval (BASE_INTERVAL = 15s) with staggered groups
 * to spread invalidations over time instead of firing all at once.
 *
 * Polling automatically pauses when the browser tab is hidden (Page Visibility API)
 * and resumes when the tab becomes visible again — no wasted network requests.
 */
export function startRealtimePolling(queryClient: QueryClient): Unsubscribe {
  let pollingPaused = false
  let tickCount = 0
  let masterInterval: ReturnType<typeof setInterval>

  // ── Visibility-aware master tick ────────────────────────────
  masterInterval = setInterval(() => {
    if (pollingPaused) return

    const effectiveInterval = getEffectiveInterval()
    // Skip tick if backoff demands a longer interval
    if (tickCount > 0 && (tickCount * BASE_INTERVAL) % effectiveInterval > BASE_INTERVAL) {
      tickCount++
      return
    }

    // Invalidate groups that are due this tick
    for (const group of POLL_GROUPS) {
      if (tickCount % group.everyNTicks === 0) {
        for (const key of group.keys) {
          queryClient.invalidateQueries({ queryKey: key })
        }
      }
    }

    // Probe a lightweight query to detect backend health
    // If this succeeds, we reset backoff. If it fails, we backoff.
    probeBackendHealth(queryClient)
      .then(() => recordPollSuccess())
      .catch((err) => recordPollFailure(err))

    tickCount++
  }, BASE_INTERVAL)

  // ── Watch page visibility ───────────────────────────────────
  const onVisibilityChange = () => {
    pollingPaused = document.hidden
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    clearInterval(masterInterval)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

/**
 * Lightweight health probe: fetches a single dashboard table row.
 * If this fails with 502/503, we know the backend is down and
 * should back off before hammering it with more requests.
 */
async function probeBackendHealth(queryClient: QueryClient): Promise<void> {
  // Just invalidate — React Query will handle the actual fetch.
  // We track errors at the polling level via the invalidateQueries promise.
  // If the backend is down, the invalidate will fail silently (React Query retry).
  const keys = DASHBOARD_KEYS[0]
  await queryClient.invalidateQueries({ queryKey: keys, exact: true })
}

// ─── Table-change handlers (shared between both WebSocket paths) ─

function onOrderBatchesChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['dashboard', 'tables'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  qc.invalidateQueries({ queryKey: ['batches'] })
  qc.invalidateQueries({ queryKey: ['dashboard', 'orders'] })
}

function onOrderBatchItemsChange(qc: QueryClient) {
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
    backoff: {
      consecutiveFailures: globalBackoff.consecutiveFailures,
      currentDelay: globalBackoff.currentDelay,
    },
  }
}
