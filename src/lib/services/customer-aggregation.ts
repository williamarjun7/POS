/**
 * Customer Aggregation Service
 * ─────────────────────────────
 * SINGLE SOURCE OF TRUTH for all customer statistics.
 *
 * Every consumer (CustomerProfile, Customers table, Dashboard, Finance, Ledger)
 * MUST call these functions. No other implementation of these calculations exists.
 *
 * Architecture:
 *   Database (invoices + payments + order_batches)
 *       ↓
 *   customer-aggregation.ts  ← ONLY ONE implementation of each metric
 *       ↓
 *   React Query hooks
 *       ↓
 *   UI Components
 *
 * Definitions (applied consistently everywhere):
 *   Total Orders      = COUNT of non-cancelled invoices (one invoice = one completed sale)
 *   Total Spent       = SUM(non-cancelled invoice totals)
 *   Outstanding Credit = SUM(invoice.total - real payments) for unpaid invoices
 *   Avg Order Value   = Total Spent / Total Orders (when orders > 0)
 *   Credit is NOT payment — payment_method='credit' is filtered from all money metrics
 *
 * ORDER COUNT RULE:
 *   Total Orders counts non-cancelled invoices. This is the correct business rule because:
 *   - Every completed sale produces exactly one invoice (regardless of payment method)
 *   - Order batches are intermediate workflow records — they don't represent completed transactions
 *   - Multiple batches can be consolidated into one invoice (correctly counted as 1 order)
 *   - Credit sales produce invoices with status 'credit_invoice' and must be counted
 *   - Only cancelled invoices are excluded (they don't represent completed sales)
 */

import { useQuery } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'
import { getPaymentMethodLabel } from '@/lib/payment-methods'
import type {
  CustomerRow,
  InvoiceRow,
  PaymentRow,
} from '@/lib/db/types'

// ─── Types ───────────────────────────────────────────────────

export interface CustomerStats {
  totalOrders: number
  totalSpent: number
  outstandingCredit: number
  avgOrderValue: number
  outstandingInvoiceCount: number
}

export interface CustomerLedgerEntry {
  id: string
  date: string
  type: 'charge' | 'payment'
  amount: number
  invoiceNumber?: string
  description: string
}

export interface CustomerLedgerData {
  customerId: string
  customerName: string
  entries: CustomerLedgerEntry[]
  currentBalance: number
}

export interface CustomerPaymentBreakdown {
  method: string
  label: string
  amount: number
  percentage: number
}

// ─── Query Keys ──────────────────────────────────────────────

export const customerAggKeys = {
  all: ['customer-aggregation'] as const,
  stats: (customerId: string) => ['customer-aggregation', 'stats', customerId] as const,
  ledger: (customerId: string) => ['customer-aggregation', 'ledger', customerId] as const,
  outstanding: () => ['customer-aggregation', 'outstanding'] as const,
  allStats: () => ['customer-aggregation', 'all-stats'] as const,
}

// ─── Helpers ─────────────────────────────────────────────────

/** Kathmandu-local date conversion helpers */
function kathmanduStartUTC(kathmanduDate: string): string {
  return new Date(kathmanduDate + 'T00:00:00+05:45').toISOString()
}
function kathmanduEndUTC(kathmanduDate: string): string {
  return new Date(kathmanduDate + 'T23:59:59+05:45').toISOString()
}

/**
 * Filter out credit-method payments from an array of payment rows.
 * Credit is debt, NOT money received. Must be excluded from all cash-flow metrics.
 */
function realPaymentsOnly(payments: PaymentRow[]): PaymentRow[] {
  return payments.filter(p => p.payment_method !== 'credit')
}

/**
 * Build a map of invoice_id → total real money paid.
 */
function buildPaidMap(payments: PaymentRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of payments) {
    if (p.invoice_id) {
      map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount))
    }
  }
  return map
}

// ─── Aggregation: Customer Stats ─────────────────────────────

/**
 * Compute ALL statistics for a single customer.
 *
 * Outstanding Credit is computed as:
 *   Remaining Balance = Invoice Total - Discount - SUM(non-credit payments)
 *
 * This is calculated across ALL non-cancelled invoices (not just unpaid ones)
 * because credit-settled invoices (status='paid' via cash+credit) still have
 * an outstanding balance equal to the credit portion.  Filtering by status
 * would miss these.
 *
 * @param customerId - The customer's UUID
 * @returns CustomerStats with totalOrders, totalSpent, outstandingCredit, avgOrderValue
 */
export async function computeCustomerStats(
  customerId: string,
): Promise<CustomerStats> {
  // Fetch all invoices for this customer
  const { data: invoicesData } = await insforge.database
    .from('invoices')
    .select('id, total, discount, status')
    .eq('customer_id', customerId)

  const invoices = (invoicesData ?? []) as Array<{ id: string; total: number; discount: number; status: string }>

  // Total Orders = COUNT of non-cancelled invoices
  const nonCancelledInvoices = invoices.filter(inv => inv.status !== 'cancelled')
  const totalOrders = nonCancelledInvoices.length

  // Total Spent = SUM of non-cancelled invoice totals
  const totalSpent = nonCancelledInvoices.reduce((sum, inv) => sum + Number(inv.total), 0)

  // Compute outstanding from ALL non-cancelled invoices
  // Fetch ALL payments for this customer's invoices (not just unpaid ones)
  const allInvoiceIds = nonCancelledInvoices.map(inv => inv.id)
  let paidByInvoice = new Map<string, number>()

  if (allInvoiceIds.length > 0) {
    const { data: paymentsData } = await insforge.database
      .from('payments')
      .select('invoice_id, amount, payment_method')
      .in('invoice_id', allInvoiceIds)

    const payments = (paymentsData ?? []) as PaymentRow[]
    // Only real payments count toward reducing outstanding (credit is NOT payment)
    paidByInvoice = buildPaidMap(realPaymentsOnly(payments))
  }

  // Outstanding Credit = SUM(invoice.total - discount - real payments) across ALL non-cancelled invoices
  // This correctly captures credit portions on settled invoices.
  let outstandingCredit = 0
  let outstandingInvoiceCount = 0
  for (const inv of nonCancelledInvoices) {
    const paid = paidByInvoice.get(inv.id) ?? 0
    const remaining = Math.max(0, Number(inv.total) - Number(inv.discount) - paid)
    if (remaining > 0) {
      outstandingCredit += remaining
      outstandingInvoiceCount++
    }
  }

  // Average Order Value = Total Spent / Total Orders
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0

  return {
    totalOrders,
    totalSpent: Math.round(totalSpent),
    outstandingCredit: Math.round(outstandingCredit),
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    outstandingInvoiceCount,
  }
}

// ─── Aggregation: ALL Customer Stats (for table view) ────────

export interface AllCustomerStats {
  statsByCustomer: Map<string, CustomerStats>
  totalOutstandingBalance: number
  creditCustomerCount: number
}

/**
 * Compute stats for ALL customers in a single batch.
 * Avoids N+1 queries by fetching invoices + payments in bulk.
 *
 * @param customerIds - Array of customer UUIDs
 * @param startDate - Optional Kathmandu-local start date (YYYY-MM-DD) to filter invoices by created_at
 * @param endDate   - Optional Kathmandu-local end date (YYYY-MM-DD) to filter invoices by created_at
 */
export async function computeAllCustomerStats(
  customerIds: string[],
  startDate?: string,
  endDate?: string,
): Promise<AllCustomerStats> {
  if (customerIds.length === 0) {
    return { statsByCustomer: new Map(), totalOutstandingBalance: 0, creditCustomerCount: 0 }
  }

  // Build query with optional date range
  let query = insforge.database
    .from('invoices')
    .select('id, customer_id, total, discount, status')
    .in('customer_id', customerIds)
    .not('status', 'eq', 'cancelled')

  if (startDate && endDate) {
    const utcStart = kathmanduStartUTC(startDate)
    const utcEnd = kathmanduEndUTC(endDate)
    query = query.gte('created_at', utcStart).lte('created_at', utcEnd)
  }

  const { data: invoicesData } = await query

  const invoices = (invoicesData ?? []) as Array<{
    id: string
    customer_id: string | null
    total: number
    discount: number
    status: string
  }>

  // Fetch payments for ALL invoices (not just unpaid ones)
  // This is necessary because credit-settled invoices marked 'paid' still
  // contribute to outstanding (the credit portion).
  const allInvoiceIds = invoices.map(inv => inv.id)
  const paidByInvoice = new Map<string, number>()
  if (allInvoiceIds.length > 0) {
    const { data: paymentsData } = await insforge.database
      .from('payments')
      .select('invoice_id, amount, payment_method')
      .in('invoice_id', allInvoiceIds)

    const payments = (paymentsData ?? []) as PaymentRow[]
    for (const p of payments) {
      // Only real payments (not credit) reduce outstanding
      if (p.payment_method !== 'credit' && p.invoice_id) {
        paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount))
      }
    }
  }

  // Build stats per customer
  const statsByCustomer = new Map<string, CustomerStats>()
  let totalOutstandingBalance = 0
  const customersWithDebt = new Set<string>()

  for (const custId of customerIds) {
    const custInvoices = invoices.filter(inv => inv.customer_id === custId)

    // Total Orders = COUNT of non-cancelled invoices
    const totalOrders = custInvoices.length

    // Total Spent = sum of all invoice totals
    const totalSpent = custInvoices.reduce((sum, inv) => sum + Number(inv.total), 0)

    // Outstanding = SUM(total - discount - real payments) across ALL invoices
    // This correctly captures credit portions on settled invoices.
    let outstandingCredit = 0
    let outstandingInvoiceCount = 0
    for (const inv of custInvoices) {
      const paid = paidByInvoice.get(inv.id) ?? 0
      const remaining = Math.max(0, Number(inv.total) - Number(inv.discount) - paid)
      if (remaining > 0) {
        outstandingCredit += remaining
        outstandingInvoiceCount++
      }
    }

    if (outstandingCredit > 0 && custId) {
      totalOutstandingBalance += outstandingCredit
      customersWithDebt.add(custId)
    }

    statsByCustomer.set(custId, {
      totalOrders,
      totalSpent: Math.round(totalSpent),
      outstandingCredit: Math.round(outstandingCredit),
      avgOrderValue: totalOrders > 0 ? Math.round((totalSpent / totalOrders) * 100) / 100 : 0,
      outstandingInvoiceCount,
    })
  }

  return {
    statsByCustomer,
    totalOutstandingBalance: Math.round(totalOutstandingBalance),
    creditCustomerCount: customersWithDebt.size,
  }
}

// ─── Aggregation: Overall Outstanding Balance ────────────────

export interface OverallOutstanding {
  totalOutstandingBalance: number
  creditCustomerCount: number
}

/**
 * Compute the total outstanding balance across ALL customers.
 * Used by the Customers page header stats and Dashboard.
 *
 * Outstanding = SUM(invoice.total - discount - non-credit payments) across ALL
 * non-cancelled invoices that have a valid customer_id.  Orphan invoices
 * (customer_id IS NULL) are excluded to avoid inflating customer KPIs with
 * Walk-in or unlinked records.
 *
 * @param startDate - Optional Kathmandu-local start date (YYYY-MM-DD) to filter invoices
 * @param endDate   - Optional Kathmandu-local end date (YYYY-MM-DD) to filter invoices
 */
export async function computeOverallOutstanding(
  startDate?: string,
  endDate?: string,
): Promise<OverallOutstanding> {
  let query = insforge.database
    .from('invoices')
    .select('id, customer_id, total, discount')
    .not('status', 'eq', 'cancelled')
    .not('customer_id', 'is', 'null')  // Exclude orphan invoices

  if (startDate && endDate) {
    const utcStart = kathmanduStartUTC(startDate)
    const utcEnd = kathmanduEndUTC(endDate)
    query = query.gte('created_at', utcStart).lte('created_at', utcEnd)
  }

  const { data: invoices } = await query

  if (!invoices || (invoices as Array<unknown>).length === 0) {
    return { totalOutstandingBalance: 0, creditCustomerCount: 0 }
  }

  const invoiceList = invoices as Array<{ id: string; customer_id: string; total: number; discount: number }>
  const invoiceIds = invoiceList.map(inv => inv.id)

  const paidByInvoice = new Map<string, number>()
  if (invoiceIds.length > 0) {
    const { data: payments } = await insforge.database
      .from('payments')
      .select('invoice_id, amount, payment_method')
      .in('invoice_id', invoiceIds)

    for (const p of (payments ?? []) as PaymentRow[]) {
      if (p.payment_method !== 'credit' && p.invoice_id) {
        paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount))
      }
    }
  }

  const customersWithDebt = new Set<string>()
  let totalOutstanding = 0

  for (const inv of invoiceList) {
    const paid = paidByInvoice.get(inv.id) ?? 0
    const outstanding = Math.max(0, Number(inv.total) - Number(inv.discount) - paid)
    if (outstanding > 0) {
      totalOutstanding += outstanding
      if (inv.customer_id) customersWithDebt.add(inv.customer_id)
    }
  }

  return {
    totalOutstandingBalance: Math.round(totalOutstanding),
    creditCustomerCount: customersWithDebt.size,
  }
}

// ─── Aggregation: Customer Ledger ─────────────────────────────

/**
 * Build a customer's full ledger from invoices (debits) and real payments (credits).
 *
 * This is the SINGLE source of truth for all ledger displays.
 * Every consumer must call this function.
 *
 * Balance = SUM(non-cancelled invoice totals) - SUM(real payments for non-cancelled invoices)
 */
export async function computeCustomerLedger(
  customerId: string,
): Promise<CustomerLedgerData | null> {
  const { data: customer } = await insforge.database
    .from('customers')
    .select('id, name')
    .eq('id', customerId)
    .single()

  if (!customer) return null

  const cust = customer as { id: string; name: string }

  const [invoicesResult, paymentsResult] = await Promise.all([
    insforge.database
      .from('invoices')
      .select('id, invoice_number, total, status, created_at')
      .eq('customer_id', customerId),
    insforge.database
      .from('payments')
      .select('id, invoice_id, amount, payment_method, reference, notes, created_at')
      .eq('customer_id', customerId),
  ])

  const invoices = (invoicesResult.data ?? []) as Array<{
    id: string
    invoice_number: string
    total: number
    status: string
    created_at: string
  }>
  const payments = (paymentsResult.data ?? []) as Array<{
    id: string
    invoice_id: string | null
    amount: number
    payment_method: string
    reference: string | null
    notes: string | null
    created_at: string
  }>

  // Build chronological entries
  const entries: CustomerLedgerEntry[] = []

  // Invoice = debit (customer owes money)
  for (const inv of invoices) {
    entries.push({
      id: `inv-${inv.id}`,
      date: inv.created_at,
      type: 'charge',
      amount: Number(inv.total),
      invoiceNumber: inv.invoice_number,
      description:
        inv.status === 'cancelled'
          ? `Invoice ${inv.invoice_number} (Cancelled)`
          : `Invoice ${inv.invoice_number} — ${
              inv.status === 'paid'
                ? 'Paid'
                : inv.status === 'credit_invoice'
                ? 'Credit Sale'
                : inv.status
            }`,
    })
  }

  // Real payment = credit (customer pays money down)
  for (const p of payments) {
    if (p.payment_method === 'credit') continue // Credit is NOT payment

    const inv = invoices.find(i => i.id === p.invoice_id)
    entries.push({
      id: `pay-${p.id}`,
      date: p.created_at,
      type: 'payment',
      amount: Number(p.amount),
      invoiceNumber: inv?.invoice_number ?? p.reference ?? undefined,
      description: p.notes ?? `Payment via ${p.payment_method}`,
    })
  }

  // Sort chronologically for running balance
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Calculate balance from non-cancelled invoices only
  let balance = 0
  for (const inv of invoices) {
    if (inv.status !== 'cancelled') {
      balance += Number(inv.total)
    }
  }
  for (const p of payments) {
    if (p.payment_method !== 'credit' && p.invoice_id) {
      const inv = invoices.find(i => i.id === p.invoice_id)
      if (inv && inv.status !== 'cancelled') {
        balance -= Number(p.amount)
      }
    }
  }

  // Reverse for most-recent-first display
  entries.reverse()

  return {
    customerId: cust.id,
    customerName: cust.name,
    entries,
    currentBalance: Math.max(0, balance),
  }
}

// ─── Aggregation: Payment Breakdown ──────────────────────────

/**
 * Build payment breakdown from a customer's payment records.
 * Only counts REAL payments (credit is NOT payment).
 */
export async function computePaymentBreakdown(
  customerId: string,
): Promise<CustomerPaymentBreakdown[]> {
  const { data: payments } = await insforge.database
    .from('payments')
    .select('payment_method, amount')
    .eq('customer_id', customerId)

  const realPayments = ((payments ?? []) as Array<{ payment_method: string; amount: number }>)
    .filter(p => p.payment_method !== 'credit')

  const methodTotals = new Map<string, number>()
  for (const p of realPayments) {
    const key = p.payment_method
    methodTotals.set(key, (methodTotals.get(key) ?? 0) + Number(p.amount))
  }

  const totalAmount = Array.from(methodTotals.values()).reduce((s, v) => s + v, 0)

  return Array.from(methodTotals.entries())
    .map(([method, amount]) => ({
      method,
      label: getPaymentMethodLabel(method),
      amount,
      percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

// ─── React Query Hooks ───────────────────────────────────────

/**
 * Hook: Customer Stats for a single customer.
 */
export function useCustomerStats(customerId: string | undefined): CustomerStats | null {
  const { data } = useQuery({
    queryKey: customerAggKeys.stats(customerId ?? ''),
    queryFn: () => computeCustomerStats(customerId!),
    enabled: !!customerId,
    staleTime: 10_000,
  })
  return data ?? null
}

/**
 * Hook: Customer Ledger for a single customer.
 */
export function useCustomerLedgerData(customerId: string | undefined): CustomerLedgerData | null {
  const { data } = useQuery({
    queryKey: customerAggKeys.ledger(customerId ?? ''),
    queryFn: () => computeCustomerLedger(customerId!),
    enabled: !!customerId,
    staleTime: 10_000,
  })
  return data ?? null
}

/**
 * Hook: Overall outstanding balance across all customers.
 *
 * @param startDate - Optional Kathmandu-local start date (YYYY-MM-DD) to filter invoices
 * @param endDate   - Optional Kathmandu-local end date (YYYY-MM-DD) to filter invoices
 */
export function useOverallOutstanding(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: [...customerAggKeys.outstanding(), startDate, endDate],
    queryFn: () => computeOverallOutstanding(startDate, endDate),
    staleTime: 15_000,
  })
}

/**
 * Hook: Batch stats for multiple customers (for the customer table view).
 *
 * @param customerIds - Array of customer UUIDs
 * @param startDate   - Optional Kathmandu-local start date (YYYY-MM-DD) to filter invoices
 * @param endDate     - Optional Kathmandu-local end date (YYYY-MM-DD) to filter invoices
 */
export function useAllCustomerStats(
  customerIds: string[],
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: [...customerAggKeys.allStats(), startDate, endDate],
    queryFn: () => computeAllCustomerStats(customerIds, startDate, endDate),
    enabled: customerIds.length > 0,
    staleTime: 10_000,
  })
}
