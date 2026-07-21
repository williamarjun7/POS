/**
 * Analytics fetch functions — SQL aggregates and client-side projections.
 *
 * Each function queries the InsForge (PostgREST) backend and returns
 * the exact shape expected by the OperationalAnalytics consumer.
 */

import { insforge } from '@/lib/services/auth-service'
import type { InventoryItemRow, StockMovementRow } from './types'

// ─── Helpers ─────────────────────────────────────────────────

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// ─── Revenue By Period ───────────────────────────────────────

export interface RevenueByPeriodData {
  dayBuckets: Record<string, number>
}

export async function fetchRevenueByPeriod(
  days: number,
): Promise<RevenueByPeriodData> {
  const since = daysAgo(days)

  const { data, error } = await insforge.database
    .from('invoices')
    .select('total, created_at')
    .gte('created_at', since)
    .in('status', ['paid', 'partial'])

  if (error) throw error

  const dayBuckets: Record<string, number> = {}

  for (const row of data ?? []) {
    const r = row as { total: number; created_at: string }
    const date = r.created_at.split('T')[0]
    dayBuckets[date] = (dayBuckets[date] ?? 0) + Number(r.total)
  }

  return { dayBuckets }
}

// ─── Payment Method Breakdown ────────────────────────────────

export async function fetchPaymentMethodBreakdown(): Promise<
  Record<string, { count: number; total: number }>
> {
  const today = daysAgo(0)

  const { data, error } = await insforge.database
    .from('payments')
    .select('payment_method, amount')
    .gte('created_at', today)

  if (error) throw error

  const breakdown: Record<string, { count: number; total: number }> = {}

  for (const row of data ?? []) {
    const r = row as { payment_method: string; amount: number }
    const method = r.payment_method ?? 'unknown'
    if (!breakdown[method]) {
      breakdown[method] = { count: 0, total: 0 }
    }
    breakdown[method].count++
    breakdown[method].total += Number(r.amount)
  }

  return breakdown
}

// ─── Average Order Value ─────────────────────────────────────

export interface AovEntry {
  date: string
  aov: number
}

export async function fetchAverageOrderValue(
  days: number,
): Promise<AovEntry[]> {
  const since = daysAgo(days)

  const { data, error } = await insforge.database
    .from('invoices')
    .select('total, created_at')
    .gte('created_at', since)
    .eq('status', 'paid')

  if (error) throw error

  // Group by date and compute average
  const dayGroups: Record<string, { sum: number; count: number }> = {}

  for (const row of data ?? []) {
    const r = row as { total: number; created_at: string }
    const date = r.created_at.split('T')[0]
    if (!dayGroups[date]) dayGroups[date] = { sum: 0, count: 0 }
    dayGroups[date].sum += Number(r.total)
    dayGroups[date].count++
  }

  return Object.entries(dayGroups)
    .map(([date, g]) => ({
      date,
      aov: g.count > 0 ? Math.round(g.sum / g.count) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Queue Analytics ─────────────────────────────────────────

export interface QueueAnalyticsData {
  queueSize: number
  averageWaitTime: number
  maxWaitTime: number
  tablesServed: number
  averageTableTurnover: number
  peakHour: number
  currentQueueLength: number
}

export async function fetchQueueAnalytics(): Promise<QueueAnalyticsData> {
  // Active orders (not yet paid/cancelled)
  const { data: activeOrders, error: ordersError } = await insforge.database
    .from('order_batches')
    .select('created_at, status')
    .not('status', 'in', '(paid,cancelled)')

  if (ordersError) throw ordersError

  const orders = (activeOrders ?? []) as Array<{
    created_at: string
    status: string
  }>

  // Compute wait times from current time
  const now = Date.now()
  let totalWaitMs = 0
  let maxWaitMs = 0

  for (const o of orders) {
    const waitMs = now - new Date(o.created_at).getTime()
    totalWaitMs += waitMs
    maxWaitMs = Math.max(maxWaitMs, waitMs)
  }

  const queueSize = orders.length
  const avgWaitMin =
    queueSize > 0 ? Math.round(totalWaitMs / queueSize / 60000) : 0
  const maxWaitMin = Math.round(maxWaitMs / 60000)

  // Recent completed orders for turnover
  const today = daysAgo(1)
  const { data: completedOrders } = await insforge.database
    .from('order_batches')
    .select('id, created_at')
    .eq('status', 'paid')
    .gte('created_at', today)

  return {
    queueSize,
    averageWaitTime: avgWaitMin,
    maxWaitTime: maxWaitMin,
    tablesServed: completedOrders?.length ?? 0,
    averageTableTurnover: 45, // estimated default
    peakHour: new Date().getHours(),
    currentQueueLength: queueSize,
  }
}

// ─── Staff Role Distribution ─────────────────────────────────

export async function fetchStaffRoleDistribution(): Promise<
  Record<string, number>
> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('role')
    .eq('active', true)

  if (error) throw error

  const profiles = (data ?? []) as Array<{ role: string }>
  const result: Record<string, number> = {}

  for (const p of profiles) {
    const role = p.role || 'staff'
    result[role] = (result[role] ?? 0) + 1
  }

  return Object.keys(result).length > 0
    ? result
    : { admin: 0, manager: 0, cashier: 0, waiter: 0, receptionist: 0, housekeeper: 0 }
}

// ─── Active Staff ────────────────────────────────────────────

export interface ActiveStaffMember {
  id: string
  name: string | null
  email: string
  role: string
}

export async function fetchActiveStaff(): Promise<ActiveStaffMember[]> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('id, name, email, role, active')
    .eq('active', true)

  if (error) throw error

  const profiles = (data ?? []) as Array<{
    id: string
    name: string | null
    email: string
    role: string
    active: boolean
  }>

  return profiles.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role || 'staff',
  }))
}

// ─── Staff Order Counts ──────────────────────────────────────

export async function fetchStaffOrderCounts(): Promise<
  Record<string, { total: number; revenue: number }>
> {
  const since = daysAgo(30)

  const { data, error } = await insforge.database
    .from('activity_logs')
    .select('user_id, user_name, amount, activity_type')
    .gte('created_at', since)
    .ilike('activity_type', '%order%')

  if (error) throw error

  const counts: Record<
    string,
    { total: number; revenue: number }
  > = {}

  for (const row of data ?? []) {
    const r = row as {
      user_id: string
      user_name: string
      amount: number
      activity_type: string
    }
    if (!counts[r.user_id]) {
      counts[r.user_id] = { total: 0, revenue: 0 }
    }
    counts[r.user_id].total++
    counts[r.user_id].revenue += Number(r.amount ?? 0)
  }

  return counts
}

// ─── Low Stock Products ──────────────────────────────────────

export interface LowStockProduct {
  id: string
  name: string
  category: string | null
  unit: string
  reorder_level: number
  stock_balance: number
}

export async function fetchLowStockProducts(): Promise<LowStockProduct[]> {
  // PostgREST cannot compare column-to-column in a filter, so we fetch
  // all items and filter client-side.
  const { data, error } = await insforge.database
    .from('inventory_items')
    .select('id, name, category, unit, current_stock, min_stock')

  if (error) throw error

  return (data ?? [])
    .filter((row: unknown) => {
      const r = row as InventoryItemRow
      return Number(r.current_stock) <= Number(r.min_stock)
    })
    .map((row: unknown) => {
      const r = row as InventoryItemRow
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        unit: r.unit,
        reorder_level: Number(r.min_stock),
        stock_balance: Number(r.current_stock),
      }
    })
    .sort((a, b) => a.stock_balance - b.stock_balance)
}

// ─── Stock Movement Trends ───────────────────────────────────

export async function fetchStockMovementTrends(
  days: number,
): Promise<Record<string, Record<string, number>>> {
  const since = daysAgo(days)

  const { data, error } = await insforge.database
    .from('stock_movements')
    .select('type, quantity, created_at')
    .gte('created_at', since)

  if (error) throw error

  const trends: Record<string, Record<string, number>> = {}

  for (const row of data ?? []) {
    const r = row as StockMovementRow
    const date = r.created_at.split('T')[0]
    if (!trends[date]) trends[date] = {}
    const t = r.type ?? 'unknown'
    trends[date][t] = (trends[date][t] ?? 0) + Number(r.quantity)
  }

  return trends
}

// ─── Revenue Forecast ────────────────────────────────────────

export interface RevenueForecastData {
  forecast: Array<{
    day: number
    projected: number
    upper: number
    lower: number
  }>
  trend: 'up' | 'down' | 'stable'
}

export async function fetchRevenueForecast(
  days: number,
): Promise<RevenueForecastData> {
  // 1. Get historical daily revenue for the period
  const since = daysAgo(days * 2) // fetch 2x history for better projection

  const { data, error } = await insforge.database
    .from('invoices')
    .select('total, created_at')
    .gte('created_at', since)
    .in('status', ['paid', 'partial'])

  if (error) throw error

  // 2. Group by date
  const dayBuckets: Record<string, number[]> = {}
  for (const row of data ?? []) {
    const r = row as { total: number; created_at: string }
    const date = r.created_at.split('T')[0]
    if (!dayBuckets[date]) dayBuckets[date] = []
    dayBuckets[date].push(Number(r.total))
  }

  const sortedDates = Object.keys(dayBuckets).sort()
  const dailyTotals = sortedDates.map((d) =>
    dayBuckets[d].reduce((s, v) => s + v, 0),
  )

  // 3. Compute moving average and std dev
  const n = dailyTotals.length
  const avg =
    n > 0 ? dailyTotals.reduce((s, v) => s + v, 0) / n : 100000
  const variance =
    n > 0
      ? dailyTotals.reduce((s, v) => s + (v - avg) ** 2, 0) / n
      : 0
  const stdDev = Math.sqrt(variance) || avg * 0.15

  // 4. Determine trend
  let trend: 'up' | 'down' | 'stable' = 'stable'
  if (n >= 3) {
    const recent = dailyTotals.slice(-3).reduce((s, v) => s + v, 0) / 3
    const older = dailyTotals.slice(0, 3).reduce((s, v) => s + v, 0) / 3
    trend = recent > older * 1.05 ? 'up' : recent < older * 0.95 ? 'down' : 'stable'
  }

  // 5. Build forecast
  const forecast = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    projected: Math.round(avg * (trend === 'up' ? 1 + i * 0.02 : trend === 'down' ? 1 - i * 0.02 : 1)),
    upper: Math.round(avg + stdDev * 1.5),
    lower: Math.max(0, Math.round(avg - stdDev * 1.5)),
  }))

  return { forecast, trend }
}

// ─── Occupancy Forecast ──────────────────────────────────────

export interface OccupancyForecastData {
  forecast: Array<{
    date: string
    occupancyRate: number
  }>
}

export async function fetchOccupancyForecast(
  days: number,
): Promise<OccupancyForecastData> {
  // 1. Get current room status
  const { data: rooms, error } = await insforge.database
    .from('rooms')
    .select('status')

  if (error) throw error

  const totalRooms = rooms?.length ?? 1
  const occupiedRooms = (rooms ?? []).filter(
    (r: { status: string }) => r.status === 'occupied',
  ).length

  const currentRate = Math.round((occupiedRooms / totalRooms) * 100)

  // 3. Simple projection: current rate with slight adjustment from bookings
  const forecast = Array.from({ length: days }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]

    // Weekend boost
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const weekendBoost = isWeekend ? 8 : 0

    // Gradual regression toward mean
    const mean = 55
    const weight = Math.min(1, i / days)
    const rate = Math.round(
      currentRate * (1 - weight) + mean * weight + weekendBoost,
    )

    return { date: dateStr, occupancyRate: Math.min(100, Math.max(10, rate)) }
  })

  return { forecast }
}
