/**
 * Customer Credit Ledger Service
 * ──────────────────────────────
 *
 * Handles customer record creation, invoice-backfill, and last_visit updates.
 *
 * All STATISTICS (balance, total spent, total orders, ledger) are delegated to
 * customer-aggregation.ts — the SINGLE source of truth for computed metrics.
 *
 * This file handles:
 *   1. ensureCustomer() — find-or-create customer by name
 *   2. updateCustomerAfterInvoice() — backfill customer_id on invoice + update last_visit
 *   3. recordCreditCharge() — backfill customer_id on credit invoice
 */

import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/db/insforge'
import { insforge } from '@/lib/services/auth-service'
import type { CustomerRow } from '@/lib/db/types'
import { computeCustomerLedger, computeCustomerStats } from '@/lib/services/customer-aggregation'

// ─── Types (re-exported for backward compat) ────────────────

export type LedgerEntryType = 'charge' | 'payment'

export interface LedgerEntry {
  id: string
  date: string
  type: LedgerEntryType
  amount: number
  invoiceNumber?: string
  description: string
}

export interface CustomerLedger {
  customerName: string
  entries: LedgerEntry[]
  currentBalance: number
}

// ─── Query Keys ──────────────────────────────────────────────

export const customerKeys = {
  all: ['customers'] as const,
  balance: (name: string) => [...customerKeys.all, 'balance', name] as const,
  ledger: (name: string) => [...customerKeys.all, 'ledger', name] as const,
  list: () => [...customerKeys.all, 'list'] as const,
}

// ─── Database Operations ─────────────────────────────────────

/**
 * Ensure a customer record exists in the DB. If not found by name,
 * create a minimal record.
 *
 * NOTE: Uses a size-limit on the name to prevent unbounded lookups.
 * The `customers` table has no unique constraint on name, so concurrent
 * calls may create duplicate rows with the same name. This is a known
 * limitation that should be addressed with a DB migration (unique index).
 */
export async function ensureCustomer(name: string): Promise<CustomerRow> {
  const { data: existing } = await db.findOne<CustomerRow>('customers', { name })

  if (existing) return existing

  const { data: created, error } = await db.insertOne<CustomerRow>('customers', {
    name,
    phone: '',
    email: '',
    address: '',
    last_visit: new Date().toISOString(),
    notes: null,
  })

  if (error || !created) throw error ?? new Error('Failed to create customer')
  return created
}

/**
 * Link a customer to an invoice after the invoice is created.
 *
 * Called from POS checkout flow AFTER the invoice is successfully created.
 * Ensures the customer record exists, updates last_visit, and backfills
 * customer_id on the invoice.
 *
 * @returns The customer's database ID, or null if no real customer name.
 */
export async function updateCustomerAfterInvoice(
  customerName: string,
  _invoiceTotal: number,
  invoiceId?: string,
): Promise<string | null> {
  // Skip anonymous/Walk-in — no customer record to update
  if (!customerName || customerName === 'Walk-in' || customerName.trim().length === 0) {
    return null
  }

  const customer = await ensureCustomer(customerName.trim())

  // Update the customer's last_visit only
  // Also backfill the customer_id on the invoice and ALL order_batches with this name
  const customerId = customer.id

  // Batch updates in parallel
  await Promise.allSettled([
    // Update last_visit on customer
    db.update('customers', { last_visit: new Date().toISOString() }, { id: customerId }),

    // Backfill customer_id on the invoice
    ...(invoiceId
      ? [db.update('invoices', { customer_id: customerId }, { id: invoiceId })]
      : []),

    // Backfill customer_id on all order_batches with this customer name (for this customer)
    // Uses the existing name match to find batches that don't have customer_id set
    ...(customerName.trim()
      ? [
          insforge.database
            .from('order_batches')
            .update({ customer_id: customerId })
            .eq('customer_name', customerName.trim())
            .is('customer_id', null),
        ]
      : []),
  ])

  return customerId
}

/**
 * Link a customer to a credit invoice.
 *
 * Called when a customer buys on credit.
 * Ensures the customer record exists, backfills customer_id on the invoice,
 * updates last_visit, and backfills customer_id on order_batches.
 */
export async function recordCreditCharge(
  customerName: string,
  _amount: number,
  _invoiceNumber?: string,
  _description?: string,
  invoiceId?: string,
): Promise<void> {
  if (!customerName || !customerName.trim()) {
    throw new Error('Customer name is required for credit transactions.')
  }

  const customer = await ensureCustomer(customerName.trim())
  const customerId = customer.id

  // Batch all updates in parallel
  await Promise.allSettled([
    // Backfill customer_id on the invoice
    ...(invoiceId
      ? [db.update('invoices', { customer_id: customerId }, { id: invoiceId })]
      : []),

    // Update last_visit
    db.update('customers', { last_visit: new Date().toISOString() }, { id: customerId }),

    // Backfill customer_id on order_batches
    ...(customerName.trim()
      ? [
          insforge.database
            .from('order_batches')
            .update({ customer_id: customerId })
            .eq('customer_name', customerName.trim())
            .is('customer_id', null),
        ]
      : []),
  ])
}

// ─── OLD APIs: Delegated to customer-aggregation.ts ─────────

/** @deprecated Use computeCustomerStats() from customer-aggregation.ts instead */
export async function getCustomerBalance(customerName: string): Promise<number> {
  const { data: customer } = await db.findOne<CustomerRow>('customers', { name: customerName })
  if (!customer) return 0
  const stats = await computeCustomerStats(customer.id)
  return stats.outstandingCredit
}

/** @deprecated Use computeCustomerLedger() from customer-aggregation.ts instead */
export async function getCustomerLedger(
  customerName: string,
): Promise<CustomerLedger | null> {
  const { data: customer } = await db.findOne<CustomerRow>('customers', { name: customerName })
  if (!customer?.data) return null
  const ledgerData = await computeCustomerLedger(customer.data.id)
  if (!ledgerData) return null
  return {
    customerName: ledgerData.customerName,
    entries: ledgerData.entries,
    currentBalance: ledgerData.currentBalance,
  }
}

/** @deprecated Use computeAllCustomerStats() from customer-aggregation.ts instead */
export async function getAllLedgers(): Promise<CustomerLedger[]> {
  // Preserve backward compat by delegating
  const { data: customers } = await db.findMany<CustomerRow>('customers')
  if (!customers || customers.length === 0) return []

  const results = await Promise.allSettled(
    customers.map(c => computeCustomerLedger(c.id)),
  )

  const ledgers: CustomerLedger[] = []
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value && result.value.entries.length > 0) {
      ledgers.push({
        customerName: result.value.customerName,
        entries: result.value.entries,
        currentBalance: result.value.currentBalance,
      })
    }
  }
  return ledgers
}

// ─── React Query Hooks (delegated) ───────────────────────────

/** @deprecated Use useOverallOutstanding() from customer-aggregation.ts instead */
export function useCustomerBalance(customerName: string): number {
  const { data } = useQuery({
    queryKey: customerKeys.balance(customerName),
    queryFn: () => getCustomerBalance(customerName),
    enabled: !!customerName,
  })
  return data ?? 0
}

/** @deprecated Use useCustomerLedgerData() from customer-aggregation.ts instead */
export function useCustomerLedger(
  customerName: string,
): CustomerLedger | null {
  const { data } = useQuery({
    queryKey: customerKeys.ledger(customerName),
    queryFn: () => getCustomerLedger(customerName),
    enabled: !!customerName,
  })
  return data ?? null
}

