/**
 * Finance Aggregation Service
 * ───────────────────────────
 *
 * Single source of truth for every financial metric in the application.
 * Used by Finance, Analytics, Reports, and the Dashboard.
 *
 * Every KPI is computed from LIVE database records — no fabricated values,
 * no pagination-limited aggregations, no stale state.
 *
 * Architecture:
 *   Database → Service Layer → React Query → UI Components
 */

import { useQuery } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'
import type { InvoiceRow, ExpenseRow } from '@/lib/db/types'
import type { ActiveStaffMember } from '@/lib/db/analytics'
import {
  fetchStaffRoleDistribution,
  fetchActiveStaff,
} from '@/lib/db/analytics'

// ─── Query Keys ──────────────────────────────────────────────

export const financeKeys = {
  all: ['finance'] as const,
  summary: () => ['finance', 'summary'] as const,
  summaryForRange: (start?: string, end?: string) =>
    ['finance', 'summary', start, end] as const,
  revenueByDay: (days: number, start?: string, end?: string) =>
    ['finance', 'revenueByDay', days, start, end] as const,
  paymentMethods: (start?: string, end?: string) =>
    ['finance', 'paymentMethods', start, end] as const,
  expenses: (start?: string, end?: string) =>
    ['finance', 'expenses', start, end] as const,
  cashFlow: () => ['finance', 'cashFlow'] as const,
  staffRoles: () => ['finance', 'staffRoles'] as const,
  activeStaff: () => ['finance', 'activeStaff'] as const,
}

// ─── Types ───────────────────────────────────────────────────

export interface FinancialSummary {
  /** Sum of ALL invoice totals (all statuses except cancelled) */
  totalRevenue: number
  /** Sum of all expenses */
  totalExpenses: number
  /** totalRevenue - totalExpenses */
  netProfit: number
  /** Sum of non-paid invoice totals minus non-credit payments */
  outstandingReceivables: number
  /** Sum of credit_invoice invoice totals */
  creditInvoiceTotal: number
  /** Count of credit_invoice invoices */
  creditInvoiceCount: number
  /** Paid invoice count */
  paidCount: number
  /** Pending (unpaid) invoice count */
  pendingCount: number
  /** Overdue invoice count */
  overdueCount: number
  /** Total invoice count */
  totalInvoices: number
  /** Customer credit outstanding balance (computed from invoices minus real payments) */
  creditOutstanding: number
  /** Today's revenue (payments) */
  collectedToday: number
  /** Today's sales (invoices) */
  salesToday: number
  /** Today's expenses (expenses with date = today) */
  expensesToday: number
}

export interface RevenueByDayEntry {
  name: string
  revenue: number
  expenses: number
}

export interface PaymentMethodBreakdownEntry {
  method: string
  label: string
  count: number
  total: number
  percentage: number
  color: string
}

export interface CashFlowEntry {
  name: string
  inflow: number
  outflow: number
}

// ─── Color map for payment methods (matches payment-methods.ts) ─

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981',
  reception_qr: '#0ea5e9',
  fonepay: '#3b82f6',
  credit: '#a855f7',
  split: '#f59e0b',
  partial: '#f97316',
}

function getMethodColor(method: string): string {
  return PAYMENT_COLORS[method] ?? '#94a3b8'
}  function getMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      cash: 'Cash with Change',
      reception_qr: 'Reception QR',
      fonepay: 'FonePay QR',
      credit: 'Credit Created',
      split: 'Split Payment',
      partial: 'Partial Payment',
    }
  return labels[method] ?? method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, ' ')
}

// ─── Date helpers ────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

/** Today's date in Kathmandu timezone (Asia/Kathmandu = UTC+5:45).
 *  This is the "business day" date used for invoices/payments created
 *  in Nepal. In UTC terms, a Kathmandu day runs 18:15Z → 18:14Z next day.
 */
function kathmanduTodayString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' })
}

function daysAgoDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function toISOStart(dateStr: string): string {
  return `${dateStr}T00:00:00Z`
}

function toISOEnd(dateStr: string): string {
  return `${dateStr}T23:59:59Z`
}

/**
 * Convert a Kathmandu-local date string to the correct UTC range boundaries.
 * Kathmandu is UTC+5:45, so:
 *   Start of 2026-07-23 in Kathmandu = 2026-07-22T18:15:00Z
 *   End   of 2026-07-23 in Kathmandu = 2026-07-23T18:14:59Z
 *
 * The DateFilterBar returns dates in Kathmandu timezone (via kathmanduDateString),
 * but the DB stores created_at in UTC. Without this conversion, invoices created
 * between 18:15-23:59 UTC on the previous day (which are already "today" in Nepal)
 * are silently excluded from date-filtered queries.
 */
function kathmanduStartUTC(kathmanduDate: string): string {
  // Parse "2026-07-23T00:00:00+05:45" as Kathmandu midnight → JS converts to UTC
  return new Date(kathmanduDate + 'T00:00:00+05:45').toISOString()
}

function kathmanduEndUTC(kathmanduDate: string): string {
  // Parse "2026-07-23T23:59:59+05:45" as end of day in Kathmandu → JS converts to UTC
  return new Date(kathmanduDate + 'T23:59:59+05:45').toISOString()
}

// ─── 1. Financial Summary (from ALL records, not paginated) ──

async function fetchFinancialSummary(): Promise<FinancialSummary> {
  const today = todayDateString()

  // 1. ALL invoices (no date limit) for totals
  const { data: allInvoices } = await insforge.database
    .from('invoices')
    .select('id, total, discount, status, created_at')

  const invoices = (allInvoices ?? []) as Array<InvoiceRow>

  // Total revenue = sum of all non-cancelled invoices
  const totalRevenue = invoices
    .filter(inv => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + Number(inv.total), 0)

  // Paid/status counts
  const paidCount = invoices.filter(i => i.status === 'paid').length
  const pendingCount = invoices.filter(i => i.status === 'pending').length
  const overdueCount = invoices.filter(i => i.status === 'overdue').length
  const creditInvoiceCount = invoices.filter(i => i.status === 'credit_invoice').length
  const totalInvoices = invoices.length

  // Credit invoice total
  const creditInvoiceTotal = invoices
    .filter(i => i.status === 'credit_invoice')
    .reduce((sum, inv) => sum + Number(inv.total), 0)

  // 2. Outstanding receivables: for unpaid invoices, subtract non-credit payments
  const unpaidInvoiceIds = invoices
    .filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled')
    .map(inv => inv.id)

  let outstandingReceivables = 0
  if (unpaidInvoiceIds.length > 0) {
    // Fetch payments for unpaid invoices
    const { data: paymentsData } = await insforge.database
      .from('payments')
      .select('invoice_id, amount, payment_method')
      .in('invoice_id', unpaidInvoiceIds)

    const paymentsForInvoices = (paymentsData ?? []) as Array<{
      invoice_id: string | null
      amount: number
      payment_method: string | null
    }>

    const paidByInvoice: Record<string, number> = {}
    for (const p of paymentsForInvoices) {
      if (p.invoice_id && p.payment_method !== 'credit') {
        paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] || 0) + Number(p.amount)
      }
    }

    for (const inv of invoices) {
      if (inv.status !== 'paid' && inv.status !== 'cancelled') {
        const paid = paidByInvoice[inv.id] || 0
        const remaining = Math.max(0, Number(inv.total) - paid)
        outstandingReceivables += remaining
      }
    }
  }

  // 3. ALL expenses
  const { data: expensesData } = await insforge.database
    .from('expenses')
    .select('amount')

  const totalExpenses = ((expensesData ?? []) as Array<{ amount: number }>)
    .reduce((sum, e) => sum + Number(e.amount), 0)

  // 4. Customer credit outstanding (computed from invoices, NOT stale credit_balance)
  // Outstanding credit = SUM(invoice.total - real payments) for unpaid invoices.
  // Reuses the outstandingReceivables value computed above from invoices.
  const creditOutstanding = outstandingReceivables

  // 5. Today's collected (REAL MONEY only — credit is NOT payment)
  // "Today" means the current business day in Kathmandu timezone.
  const kathmanduToday = kathmanduTodayString()
  const todayUTCStart = kathmanduStartUTC(kathmanduToday)
  const { data: todayPayments } = await insforge.database
    .from('payments')
    .select('amount, payment_method')
    .gte('created_at', todayUTCStart)

  const collectedToday = ((todayPayments ?? []) as Array<{ amount: number; payment_method: string | null }>)
    .filter(p => p.payment_method !== 'credit')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  // 6. Today's sales (invoices today)
  const { data: todayInvoices } = await insforge.database
    .from('invoices')
    .select('total, status')
    .gte('created_at', todayUTCStart)

  const salesToday = ((todayInvoices ?? []) as Array<{ total: number; status: string }>)
    .filter(inv => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + Number(inv.total), 0)

  // 7. Today's expenses — expense.date is a date column, no timezone
  const { data: todayExpData } = await insforge.database
    .from('expenses')
    .select('amount')
    .gte('date', today)
    .lte('date', today)

  const expensesToday = ((todayExpData ?? []) as Array<{ amount: number }>)
    .reduce((sum, e) => sum + Number(e.amount), 0)

  return {
    totalRevenue: Math.round(totalRevenue),
    totalExpenses: Math.round(totalExpenses),
    netProfit: Math.round(totalRevenue - totalExpenses),
    outstandingReceivables: Math.round(outstandingReceivables),
    creditInvoiceTotal: Math.round(creditInvoiceTotal),
    creditInvoiceCount,
    paidCount,
    pendingCount,
    overdueCount,
    totalInvoices,
    creditOutstanding: Math.round(creditOutstanding),
    collectedToday: Math.round(collectedToday),
    salesToday: Math.round(salesToday),
    expensesToday: Math.round(expensesToday),
  }
}

// ─── 1b. Financial Summary for a Date Range ─────────────────

async function fetchFinancialSummaryForRange(
  startDate?: string,
  endDate?: string,
): Promise<FinancialSummary> {
  const today = todayDateString()
  const hasRange = !!startDate && !!endDate

  // ── Period-dependent metrics (filtered by date range) ─
  let periodRevenue = 0
  let periodExpenses = 0
  let periodPaid = 0
  let periodPending = 0
  let periodOverdue = 0
  let periodCreditInvCount = 0
  let periodCreditInvTotal = 0
  let periodTotalInvoices = 0

  if (hasRange) {
    // Convert Kathmandu-timezone date range to UTC for DB query
    const utcStart = kathmanduStartUTC(startDate)
    const utcEnd = kathmanduEndUTC(endDate)
    // Invoices in range
    const { data: invData } = await insforge.database
      .from('invoices')
      .select('total, status')
      .gte('created_at', utcStart)
      .lte('created_at', utcEnd)
    const invs = (invData ?? []) as Array<{ total: number; status: string }>
    periodTotalInvoices = invs.length
    for (const inv of invs) {
      if (inv.status !== 'cancelled') periodRevenue += Number(inv.total)
      if (inv.status === 'paid') periodPaid++
      if (inv.status === 'pending') periodPending++
      if (inv.status === 'overdue') periodOverdue++
      if (inv.status === 'credit_invoice') {
        periodCreditInvCount++
        periodCreditInvTotal += Number(inv.total)
      }
    }

    // Expenses in range — expense.date is a date (no timezone), so starts/ends are fine
    const { data: expData } = await insforge.database
      .from('expenses')
      .select('amount')
      .gte('date', startDate)
      .lte('date', endDate)
    periodExpenses = ((expData ?? []) as Array<{ amount: number }>)
      .reduce((s, e) => s + Number(e.amount), 0)
  }

  // ── Current-state metrics (always ALL records) ─
  const { data: allInvoices } = await insforge.database
    .from('invoices')
    .select('id, total, status')
  const invoices = (allInvoices ?? []) as Array<{ id: string; total: number; status: string }>

  // Outstanding receivables
  const unpaidIds = invoices
    .filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled')
    .map(inv => inv.id)

  let outstandingReceivables = 0
  if (unpaidIds.length > 0) {
    const { data: pays } = await insforge.database
      .from('payments')
      .select('invoice_id, amount, payment_method')
      .in('invoice_id', unpaidIds)
    const payList = (pays ?? []) as Array<{ invoice_id: string | null; amount: number; payment_method: string | null }>
    const paidMap: Record<string, number> = {}
    for (const p of payList) {
      if (p.invoice_id && p.payment_method !== 'credit') {
        paidMap[p.invoice_id] = (paidMap[p.invoice_id] || 0) + Number(p.amount)
      }
    }
    for (const inv of invoices) {
      if (inv.status !== 'paid' && inv.status !== 'cancelled') {
        outstandingReceivables += Math.max(0, Number(inv.total) - (paidMap[inv.id] || 0))
      }
    }
  }

  // Customer credit outstanding (computed from invoices, NOT stale credit_balance)
  // Reuses the outstandingReceivables value computed above from invoices.
  const creditOutstanding = outstandingReceivables

  // "Today" means the current business day in Kathmandu timezone.
  const kathmanduToday = kathmanduTodayString()
  const todayUTCStart = kathmanduStartUTC(kathmanduToday)
  const { data: todayPays } = await insforge.database
    .from('payments')
    .select('amount, payment_method')
    .gte('created_at', todayUTCStart)
  const collectedToday = ((todayPays ?? []) as Array<{ amount: number; payment_method: string | null }>)
    .filter(p => p.payment_method !== 'credit')
    .reduce((s, p) => s + Number(p.amount), 0)

  // Today's invoices
  const { data: todayInvs } = await insforge.database
    .from('invoices')
    .select('total, status')
    .gte('created_at', todayUTCStart)
  const salesToday = ((todayInvs ?? []) as Array<{ total: number; status: string }>)
    .filter(inv => inv.status !== 'cancelled')
    .reduce((s, inv) => s + Number(inv.total), 0)

  // ALL expenses for all-time fallback
  let totalExpensesVal = periodExpenses
  if (!hasRange) {
    const { data: allExp } = await insforge.database
      .from('expenses')
      .select('amount')
    totalExpensesVal = ((allExp ?? []) as Array<{ amount: number }>)
      .reduce((s, e) => s + Number(e.amount), 0)
  }
  // Today's expenses (always queried for the dashboard card)
  const { data: todayExpData } = await insforge.database
    .from('expenses')
    .select('amount')
    .gte('date', today)
    .lte('date', today)
  const expensesToday = ((todayExpData ?? []) as Array<{ amount: number }>)
    .reduce((s, e) => s + Number(e.amount), 0)

  const totalRevenueVal = hasRange ? periodRevenue : invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + Number(i.total), 0)

  return {
    totalRevenue: Math.round(totalRevenueVal),
    totalExpenses: Math.round(totalExpensesVal),
    netProfit: Math.round(totalRevenueVal - totalExpensesVal),
    outstandingReceivables: Math.round(outstandingReceivables),
    creditInvoiceTotal: Math.round(hasRange ? periodCreditInvTotal : invoices.filter(i => i.status === 'credit_invoice').reduce((s, i) => s + Number(i.total), 0)),
    creditInvoiceCount: hasRange ? periodCreditInvCount : invoices.filter(i => i.status === 'credit_invoice').length,
    paidCount: hasRange ? periodPaid : invoices.filter(i => i.status === 'paid').length,
    pendingCount: hasRange ? periodPending : invoices.filter(i => i.status === 'pending').length,
    overdueCount: hasRange ? periodOverdue : invoices.filter(i => i.status === 'overdue').length,
    totalInvoices: hasRange ? periodTotalInvoices : invoices.length,
    creditOutstanding: Math.round(creditOutstanding),
    collectedToday: Math.round(collectedToday),
    salesToday: Math.round(salesToday),
    expensesToday: Math.round(expensesToday),
  }
}

// ─── 2. Revenue by Day (with real expenses) ──────────────────

async function fetchRevenueByDay(
  days: number,
  startDate?: string,
  endDate?: string,
): Promise<RevenueByDayEntry[]> {
  const start = startDate ?? daysAgoDate(days)
  const end = endDate ?? todayDateString()

  // Convert Kathmandu-timezone date range to UTC for DB query
  const utcStart = kathmanduStartUTC(start)
  const utcEnd = kathmanduEndUTC(end)
  // Fetch invoices in range
  const { data: invoicesData } = await insforge.database
    .from('invoices')
    .select('total, created_at, status')
    .gte('created_at', utcStart)
    .lte('created_at', utcEnd)

  const invoices = (invoicesData ?? []) as Array<{ total: number; created_at: string; status: string }>

  // Fetch expenses in range
  const { data: expensesData } = await insforge.database
    .from('expenses')
    .select('amount, date')
    .gte('date', start)
    .lte('date', end)

  const expenses = (expensesData ?? []) as Array<{ amount: number; date: string }>

  // Build day buckets
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayMap: Record<string, RevenueByDayEntry> = {}

  // Fill all days in range
  const current = new Date(start)
  const endDateObj = new Date(end)
  while (current <= endDateObj) {
    const dateStr = current.toISOString().split('T')[0]
    const dayName = dayNames[current.getDay()]
    dayMap[dateStr] = { name: dayName, revenue: 0, expenses: 0 }
    current.setDate(current.getDate() + 1)
  }

  // Aggregate revenue by date (only paid/partial invoices)
  for (const inv of invoices) {
    if (inv.status === 'paid' || inv.status === 'partial') {
      const date = inv.created_at.split('T')[0]
      if (dayMap[date]) {
        dayMap[date].revenue += Number(inv.total)
      }
    }
  }

  // Aggregate real expenses by date
  for (const exp of expenses) {
    if (dayMap[exp.date]) {
      dayMap[exp.date].expenses += Number(exp.amount)
    }
  }

  return Object.entries(dayMap).map(([_, entry]) => ({
    name: entry.name,
    revenue: Math.round(entry.revenue),
    expenses: Math.round(entry.expenses),
  }))
}

// ─── 3. Payment Method Breakdown from payments table ─────────

async function fetchPaymentMethodBreakdown(
  startDate?: string,
  endDate?: string,
): Promise<PaymentMethodBreakdownEntry[]> {
  const start = startDate ?? daysAgoDate(30)
  const end = endDate ?? todayDateString()

  // Convert Kathmandu-timezone date range to UTC for DB query
  const utcStart = kathmanduStartUTC(start)
  const utcEnd = kathmanduEndUTC(end)
  const q = insforge.database
    .from('payments')
    .select('payment_method, amount')
    .gte('created_at', utcStart)
    .lte('created_at', utcEnd)

  const { data: paymentsData } = await q
  const payments = (paymentsData ?? []) as Array<{
    payment_method: string | null
    amount: number
  }>

  const buckets: Record<string, { count: number; total: number }> = {}
  for (const p of payments) {
    const method = p.payment_method ?? 'unknown'
    if (!buckets[method]) buckets[method] = { count: 0, total: 0 }
    buckets[method].count++
    buckets[method].total += Number(p.amount)
  }

  // REAL MONEY methods only — credit is NOT payment
  const methodKeys = ['cash', 'reception_qr', 'fonepay']

  const entries: PaymentMethodBreakdownEntry[] = []
  let grandTotal = 0

  for (const method of methodKeys) {
    const data = buckets[method]
    if (data) {
      grandTotal += data.total
    }
  }

  // Handle unknown methods
  for (const [method, data] of Object.entries(buckets)) {
    if (!methodKeys.includes(method)) {
      grandTotal += data.total
    }
  }

  for (const method of methodKeys) {
    const data = buckets[method]
    if (!data) {
      entries.push({
        method,
        label: getMethodLabel(method),
        count: 0,
        total: 0,
        percentage: 0,
        color: getMethodColor(method),
      })
      continue
    }
    entries.push({
      method,
      label: getMethodLabel(method),
      count: data.count,
      total: Math.round(data.total),
      percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0,
      color: getMethodColor(method),
    })
  }

  // Add unknown methods as "Other"
  const unknownMethods = Object.entries(buckets).filter(
    ([method]) => !methodKeys.includes(method),
  )
  for (const [method, data] of unknownMethods) {
    entries.push({
      method,
      label: getMethodLabel(method),
      count: data.count,
      total: Math.round(data.total),
      percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0,
      color: getMethodColor(method),
    })
  }

  return entries
}

// ─── 4. Cash Flow from reconciliations ───────────────────────

async function fetchCashFlow(): Promise<CashFlowEntry[]> {
  const { data } = await insforge.database
    .from('cash_reconciliations')
    .select('date, cash_received, cash_paid')
    .order('date', { ascending: true })

  const reconData = (data ?? []) as Array<{
    date: string
    cash_received: number
    cash_paid: number
  }>

  return reconData.map(r => ({
    name: r.date.slice(5),
    inflow: Number(r.cash_received),
    outflow: Number(r.cash_paid),
  }))
}

// ─── React Query Hooks ───────────────────────────────────────

/**
 * Financial Summary — ALL records, no pagination limits.
 * Used by Finance Overview tab, and can be consumed by Analytics/Reports.
 */
export function useFinancialSummary() {
  return useQuery({
    queryKey: financeKeys.summary(),
    queryFn: fetchFinancialSummary,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

/**
 * Financial Summary for a specific date range.
 * Period KPIs (revenue, expenses, counts) are filtered by the range.
 * Current-state KPIs (outstanding, credit) are always ALL records.
 * When no dates provided, behaves identically to useFinancialSummary().
 */
export function useFinancialSummaryForRange(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: financeKeys.summaryForRange(startDate, endDate),
    queryFn: () => fetchFinancialSummaryForRange(startDate, endDate),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

/**
 * Revenue vs Expenses by day over a date range.
 * Uses REAL expense data from the expenses table.
 */
export function useRevenueByDay(days = 7, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: financeKeys.revenueByDay(days, startDate, endDate),
    queryFn: () => fetchRevenueByDay(days, startDate, endDate),
    staleTime: 30_000,
  })
}

/**
 * Payment method breakdown from the actual payments table.
 * Returns ALL methods including ones with zero values.
 */
export function usePaymentMethodBreakdown(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: financeKeys.paymentMethods(startDate, endDate),
    queryFn: () => fetchPaymentMethodBreakdown(startDate, endDate),
    staleTime: 30_000,
  })
}

/**
 * Expense data for a date range.
 */
export function useExpensesAggregated(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: financeKeys.expenses(startDate, endDate),
    queryFn: async () => {
      const start = startDate ?? daysAgoDate(30)
      const end = endDate ?? todayDateString()

      const { data } = await insforge.database
        .from('expenses')
        .select('*')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })

      return (data ?? []) as ExpenseRow[]
    },
    staleTime: 30_000,
  })
}

/**
 * Staff role distribution from user_profiles.
 */
export function useStaffRoleDistribution() {
  return useQuery<Record<string, number>>({
    queryKey: financeKeys.staffRoles(),
    queryFn: fetchStaffRoleDistribution,
    staleTime: 120_000,
  })
}

/**
 * Active staff members from user_profiles.
 */
export function useActiveStaff() {
  return useQuery<ActiveStaffMember[]>({
    queryKey: financeKeys.activeStaff(),
    queryFn: fetchActiveStaff,
    staleTime: 120_000,
  })
}

/**
 * Today's expenses total — lightweight query just for the dashboard card.
 */
export function useTodayExpenses() {
  const today = todayDateString()
  return useQuery({
    queryKey: ['expenses', 'today'] as const,
    queryFn: async () => {
      const { data } = await insforge.database
        .from('expenses')
        .select('amount')
        .gte('date', today)
        .lte('date', today)
      return ((data ?? []) as Array<{ amount: number }>)
        .reduce((sum, e) => sum + Number(e.amount), 0)
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

/**
 * Cash flow data from reconciliation records.
 */
export function useCashFlow() {
  return useQuery({
    queryKey: financeKeys.cashFlow(),
    queryFn: fetchCashFlow,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

// ─── Cache Invalidation Helper ───────────────────────────────

import { useQueryClient } from '@tanstack/react-query'

/**
 * Call this after any payment, expense, or invoice event to ensure
 * Finance, Analytics, Reports, and Dashboard all refresh.
 */
export function useInvalidateFinance() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: financeKeys.all })
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'pendingInvoices'] })
  }
}
