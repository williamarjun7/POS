/**
 * Dashboard Report Service
 * ────────────────────────
 *
 * Fetches all dashboard KPIs from the InsForge (PostgREST) backend.
 * Every value comes from live database queries — no hardcoded placeholders.
 */

import { insforge } from '@/lib/services/auth-service'
import { getPaymentMethodLabel } from '@/lib/payment-methods'
import { formatTimeAgo } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────

export interface DashboardReport {
  summary: {
    gross_sales: number
    total_discounts: number
    net_sales: number
    refunded: number
    credit_outstanding: number
    average_check: number
    collected: number
    sales_today: number
    outstanding: number
    partially_paid_count: number
    credit_collected: number
    expenses_today: number
  }
  hourly_sales: {
    hours: Array<{
      hour: number
      label: string
      orders: number
      revenue: number
      occupied_tables: number
    }>
  }
  payment_summary: {
    payment_methods: Array<{
      method: string
      label: string
      amount: number
      count: number
      percentage: number
    }>
    grand_total: number
  }
  room_summary: {
    occupied: number
    available: number
    reserved: number
    cleaning: number
    maintenance: number
    total_rooms: number
  }
  activity_feed: ActivityItem[]
}

export interface ActivityItem {
  id: string
  activity_type: string
  entity_id: string
  entity_label: string
  status: string
  location: string
  amount: number
  created_at: string
  time_ago: string
  user_name: string | null
}

// ─── Helpers ─────────────────────────────────────────────────

export function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 86400000 - 1)
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}



function hourLabel(h: number): string {
  if (h === 0) return '12AM'
  if (h < 12) return `${h}AM`
  if (h === 12) return '12PM'
  return `${h - 12}PM`
}

// ─── Main Dashboard Report ───────────────────────────────────

export async function getDashboardReport(
  range: { startDate: string; endDate: string },
): Promise<DashboardReport> {
  const { startDate, endDate } = range
  const todayStart = `${startDate}T00:00:00Z`
  const todayEnd = `${endDate}T23:59:59Z`

  // ── 1. Payments collected today ───────────────────────────
  const { data: paymentsData } = await insforge.database
    .from('payments')
    .select('amount, payment_method, created_at')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)

  const payments = (paymentsData ?? []) as Array<{
    amount: number
    payment_method: string
    created_at: string
  }>

  // ═══ Collect only REAL MONEY received — credit is NOT payment ═══
  // Credit entries in the payments table represent outstanding debt,
  // NOT money in the cash drawer. They must be excluded from cash metrics.
  const realPayments = payments.filter(p => p.payment_method !== 'credit')
  const collected = realPayments.reduce((sum, p) => sum + Number(p.amount), 0)
  const creditCollected = payments
    .filter(p => p.payment_method === 'credit')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  // ── 2. Invoices today ─────────────────────────────────────
  const { data: invoicesData } = await insforge.database
    .from('invoices')
    .select('total, discount, status, created_at')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)

  const invoices = (invoicesData ?? []) as Array<{
    total: number
    discount: number
    status: string
    created_at: string
  }>

  const salesToday = invoices
    .filter(inv => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + Number(inv.total), 0)

  const grossSales = invoices
    .filter(inv => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + Number(inv.total), 0)

  const totalDiscounts = invoices
    .filter(inv => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + Number(inv.discount), 0)

  const netSales = grossSales - totalDiscounts

  const refunded = invoices
    .filter(inv => inv.status === 'refunded')
    .reduce((sum, inv) => sum + Number(inv.total), 0)

  // ── 3. Outstanding & partially paid ───────────────────────
  const { data: unpaidInvoices } = await insforge.database
    .from('invoices')
    .select('id, total, status')
    .not('status', 'in', '(paid,refunded,cancelled)')

  const unpaid = (unpaidInvoices ?? []) as Array<{
    id: string
    total: number
    status: string
  }>

  // Get payments for unpaid invoices to calculate true outstanding balance
  const unpaidIds = unpaid.map(inv => inv.id)
  let paidByInvoice: Record<string, number> = {}
  if (unpaidIds.length > 0) {
    const { data: paymentsData } = await insforge.database
      .from('payments')
      .select('invoice_id, amount, payment_method')
      .in('invoice_id', unpaidIds)

    const paymentsForInvoices = (paymentsData ?? []) as Array<{
      invoice_id: string | null
      amount: number
      payment_method: string | null
    }>
    for (const p of paymentsForInvoices) {
      if (p.invoice_id && p.payment_method !== 'credit') {
        paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] || 0) + Number(p.amount)
      }
    }
  }

  // Outstanding = SUM(invoice.total - paid_amount) for each unpaid invoice
  let outstanding = 0
  let partiallyPaidCount = 0
  for (const inv of unpaid) {
    const paid = paidByInvoice[inv.id] || 0
    const remaining = Math.max(0, Number(inv.total) - paid)
    outstanding += remaining
    if (paid > 0 && remaining > 0) {
      partiallyPaidCount++
    }
  }

  // ── 4. Credit outstanding (computed from invoices — NOT stale credit_balance) ──
  // Outstanding credit = SUM(invoice.total - real payments) for unpaid invoices.
  // This is the same calculation as `outstanding` above, computed via invoice-based
  // single source of truth rather than the stale customers.credit_balance column.
  const creditOutstanding = outstanding

  // ── 5. Average check ──────────────────────────────────────
  const paidInvoices = invoices.filter(inv =>
    inv.status === 'paid' || inv.status === 'partial',
  )
  const averageCheck = paidInvoices.length > 0
    ? Math.round(paidInvoices.reduce((sum, inv) => sum + Number(inv.total), 0) / paidInvoices.length)
    : 0

  // ── 6. Hourly sales / occupancy ───────────────────────────
  const { data: orderBatches } = await insforge.database
    .from('order_batches')
    .select('created_at, table_id')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)
    .not('status', 'eq', 'cancelled')

  const batches = (orderBatches ?? []) as Array<{
    created_at: string
    table_id: string | null
  }>

  const hours = Array.from({ length: 24 }, (_, hour) => {
    const hourBatches = batches.filter(b => {
      const bh = new Date(b.created_at).getHours()
      return bh === hour
    })
    // Hourly revenue = REAL payments only (credit is not revenue)
    const hourPayments = realPayments.filter(p => {
      const ph = new Date(p.created_at).getHours()
      return ph === hour
    })
    return {
      hour,
      label: hourLabel(hour),
      orders: hourBatches.length,
      revenue: hourPayments.reduce((sum, p) => sum + Number(p.amount), 0),
      occupied_tables: new Set(hourBatches.filter(b => b.table_id).map(b => b.table_id)).size,
    }
  })

  // ── 7. Payment method breakdown (REAL MONEY only, NOT credit) ──
  //    Credit is debt, not payment. It's tracked separately via credit_outstanding.
  const methodMap: Record<string, { method: string; label: string; amount: number; count: number }> = {}
  for (const p of realPayments) {
    const method = p.payment_method || 'unknown'
    if (!methodMap[method]) {
      methodMap[method] = { method, label: methodLabel(method), amount: 0, count: 0 }
    }
    methodMap[method].amount += Number(p.amount)
    methodMap[method].count++
  }

  const paymentMethods = Object.values(methodMap)
  const grandTotal = paymentMethods.reduce((sum, m) => sum + m.amount, 0)

  const paymentSummary = {
    payment_methods: paymentMethods.map(m => ({
      ...m,
      percentage: grandTotal > 0 ? Math.round((m.amount / grandTotal) * 100) : 0,
    })),
    grand_total: grandTotal,
  }

  // ── 7b. Expenses today ────────────────────────────────────
  const { data: todayExpData } = await insforge.database
    .from('expenses')
    .select('amount')
    .gte('date', startDate)
    .lte('date', endDate)

  const expensesToday = ((todayExpData ?? []) as Array<{ amount: number }>)
    .reduce((sum, e) => sum + Number(e.amount), 0)

  // ── 8. Room summary ───────────────────────────────────────
  const { data: rooms } = await insforge.database
    .from('rooms')
    .select('status')

  const roomList = (rooms ?? []) as Array<{ status: string }>
  const totalRooms = roomList.length
  const occupiedRooms = roomList.filter(r => r.status === 'occupied').length
  const availableRooms = roomList.filter(r => r.status === 'available' || r.status === 'vacant').length
  const reservedRooms = roomList.filter(r => r.status === 'reserved').length
  const cleaningRooms = roomList.filter(r => r.status === 'cleaning').length
  const maintenanceRooms = roomList.filter(r => r.status === 'maintenance').length

  // ── 9. Activity feed ──────────────────────────────────────
  const activityFeed = await fetchRecentActivity(10)

  return {
    summary: {
      gross_sales: Math.round(grossSales),
      total_discounts: Math.round(totalDiscounts),
      net_sales: Math.round(netSales),
      refunded: Math.round(refunded),
      credit_outstanding: Math.round(creditOutstanding),
      average_check: averageCheck,
      collected: Math.round(collected),
      sales_today: Math.round(salesToday),
      outstanding: Math.round(outstanding),
      partially_paid_count: partiallyPaidCount,
      credit_collected: Math.round(creditCollected),
      expenses_today: Math.round(expensesToday),
    },
    hourly_sales: { hours },
    payment_summary: paymentSummary,
    room_summary: {
      occupied: occupiedRooms,
      available: availableRooms,
      reserved: reservedRooms,
      cleaning: cleaningRooms,
      maintenance: maintenanceRooms,
      total_rooms: totalRooms,
    },
    activity_feed: activityFeed,
  }
}

// ─── Activity Feed ───────────────────────────────────────────

export async function fetchRecentActivity(limit = 20): Promise<ActivityItem[]> {
  const { data, error } = await insforge.database
    .from('activity_logs')
    .select('id, activity_type, entity_id, entity_label, status, location, amount, created_at, user_name')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as Array<{
    id: string
    activity_type: string
    entity_id: string | null
    entity_label: string | null
    status: string | null
    location: string | null
    amount: number | null
    created_at: string
    user_name: string | null
  }>).map(row => ({
    id: row.id,
    activity_type: row.activity_type,
    entity_id: row.entity_id ?? '',
    entity_label: row.entity_label ?? '',
    status: row.status ?? '',
    location: row.location ?? '',
    amount: Number(row.amount ?? 0),
    created_at: row.created_at,
    time_ago: formatTimeAgo(row.created_at),
    user_name: row.user_name,
  }))
}

// ─── Payment method label helper (delegates to centralized mapping) ──

function methodLabel(method: string): string {
  return getPaymentMethodLabel(method)
}
