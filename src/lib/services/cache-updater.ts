/**
 * Cache Updater — Optimistic React Query Cache Helpers
 * ─────────────────────────────────────────────────────
 *
 * All functions perform IMMEDIATE cache updates via `setQueryData` so the
 * UI never waits for a background refetch.
 *
 * Call these right after a successful transaction. Background invalidations
 * are still scheduled for consistency, but the user sees the new values
 * instantly.
 */

import type { QueryClient } from '@tanstack/react-query'
import { dashboardKeys } from '@/lib/core/query-keys'
import { todayRange } from '@/lib/services/dashboard.service'
import type { DashboardReport } from '@/lib/services/dashboard.service'

// ─── Inline type for dashboard table ─────────────────────────

interface DashboardTableRow {
  id: string
  number?: string
  table_number?: string
  status: string
  capacity?: number
  running_total?: number
  totalAmount?: number
  guestName?: string
  customer?: string
  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Immediately update the dashboard report cache to reflect a new payment.
 *
 * Updates: collected, sales_today, net_sales, outstanding, partially_paid_count
 */
export function updateDashboardReportCache(
  queryClient: QueryClient,
  paymentDetails: {
    grandTotal: number
    paidAmount: number
    creditAmount?: number
    isCreditPayment: boolean
    wasFullSettlement: boolean
  },
): void {
  const range = todayRange()
  const cacheKey = dashboardKeys.report(range.startDate, range.endDate)
  const existing = queryClient.getQueryData<DashboardReport>(cacheKey)

  if (!existing?.summary) return

  const { grandTotal, paidAmount, creditAmount = 0, wasFullSettlement } = paymentDetails
  const totalSettled = paidAmount + creditAmount

  queryClient.setQueryData<DashboardReport>(cacheKey, {
    ...existing,
    summary: {
      ...existing.summary,
      collected: existing.summary.collected + paidAmount,
      sales_today: existing.summary.sales_today + grandTotal,
      net_sales: existing.summary.net_sales + grandTotal,
      outstanding: Math.max(
        0,
        existing.summary.outstanding - totalSettled,
      ),
      partially_paid_count: wasFullSettlement
        ? Math.max(0, (existing.summary.partially_paid_count ?? 0) - 1)
        : (existing.summary.partially_paid_count ?? 0) + 1,
    },
  })
}

/**
 * Immediately mark the table's status in the dashboard tables cache so
 * it shows as available (or still occupied for partial payments).
 */
export function updateTableStatusCache(
  queryClient: QueryClient,
  tableId: string,
  wasFullSettlement: boolean,
): void {
  const tablesCacheKey = dashboardKeys.tables()
  const existing = queryClient.getQueryData<DashboardTableRow[]>(tablesCacheKey)

  if (!existing) return

  const updated = existing.map(table => {
    if (table.id !== tableId) return table
    return {
      ...table,
      status: wasFullSettlement ? 'available' : table.status,
      running_total: wasFullSettlement ? 0 : (table.running_total ?? 0),
      totalAmount: wasFullSettlement ? 0 : (table.totalAmount ?? 0),
      guestName: wasFullSettlement ? '' : table.guestName,
      customer: wasFullSettlement ? '' : table.customer,
    }
  })

  queryClient.setQueryData<DashboardTableRow[]>(tablesCacheKey, updated)
}

/**
 * Immediately remove a paid invoice from the pending-invoices cache.
 * Or update its outstanding to reflect a partial payment.
 */
export function updatePendingInvoicesCache(
  queryClient: QueryClient,
  invoiceId: string,
  grandTotal: number,
  wasFullSettlement: boolean,
): void {
  const cacheKey = dashboardKeys.pendingInvoices
  const existingData = queryClient.getQueryData<any[]>(cacheKey)

  if (!existingData) return

  if (wasFullSettlement) {
    queryClient.setQueryData(
      cacheKey,
      existingData.filter((inv: any) => inv.id !== invoiceId),
    )
  } else {
    queryClient.setQueryData(
      cacheKey,
      existingData.map((inv: any) => {
        if (inv.id !== invoiceId) return inv
        const newRemaining = Math.max(0, (inv.remaining ?? 0) - grandTotal)
        const newPaid = (inv.paidAmount ?? 0) + grandTotal
        return {
          ...inv,
          remaining: newRemaining,
          paidAmount: newPaid,
          status: newRemaining <= 0 ? 'paid' : inv.status,
          badges: newRemaining > 0
            ? [...(inv.badges ?? []).filter((b: string) => b !== 'partial'), 'partial']
            : (inv.badges ?? []).filter((b: string) => b !== 'partial'),
        }
      }),
    )
  }
}

/**
 * Perform ALL instant cache updates after a successful payment transaction.
 * Lightweight background invalidations are scheduled but NOT awaited.
 */
export function updateAllCachesOnPayment(
  queryClient: QueryClient,
  params: {
    tableId: string
    invoiceId: string
    grandTotal: number
    paidAmount: number
    creditAmount?: number
    isCreditPayment: boolean
    wasFullSettlement: boolean
  },
): void {
  // 1. Dashboard report — instant
  updateDashboardReportCache(queryClient, {
    grandTotal: params.grandTotal,
    paidAmount: params.paidAmount,
    creditAmount: params.creditAmount,
    isCreditPayment: params.isCreditPayment,
    wasFullSettlement: params.wasFullSettlement,
  })

  // 2. Table status — instant
  updateTableStatusCache(queryClient, params.tableId, params.wasFullSettlement)

  // 3. Pending invoices — instant
  updatePendingInvoicesCache(queryClient, params.invoiceId, params.grandTotal, params.wasFullSettlement)

  // 4. Schedule lightweight background refetches for consistency (NOT awaited)
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'tables'], refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'rooms'], refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: ['batches'], refetchType: 'active' })
  // Dashboard report refetch is intentionally NOT triggered here —
  // the optimistic update covers it, and the next time it becomes stale
  // (staleTime: 10s) it will refetch naturally.
}
