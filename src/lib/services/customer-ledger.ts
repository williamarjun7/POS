/**
 * Customer Credit Ledger Service
 * ──────────────────────────────
 *
 * Tracks outstanding credit balances per customer and records
 * all credit transactions (charges & payments) in the database
 * (customers table + payments table).
 *
 * The old in-memory Map store has been replaced with database
 * operations via the InsForge SDK.
 */

import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/db/insforge'
import type { CustomerRow, PaymentRow } from '@/lib/db/types'
import { customerLedgerSchemas, validateOrThrow } from '@/lib/validation'

// ─── Types ───────────────────────────────────────────────────

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
 */
async function ensureCustomer(name: string): Promise<CustomerRow> {
  const { data: existing } = await db.findOne<CustomerRow>('customers', { name })

  if (existing) return existing

  // Create a new customer record
  const { data: created, error } = await db.insertOne<CustomerRow>('customers', {
    name,
    phone: '',
    email: '',
    address: '',
    total_orders: 0,
    total_spent: 0,
    last_visit: new Date().toISOString(),
    loyalty_points: 0,
    credit_balance: 0,
    notes: null,
  })

  if (error || !created) throw error ?? new Error('Failed to create customer')
  return created
}

/**
 * Record a credit charge (customer buys on credit).
 * Inserts a payment record and increases the customer's credit_balance.
 */
export async function recordCreditCharge(
  customerName: string,
  amount: number,
  invoiceNumber?: string,
  description?: string,
  invoiceId?: string,
): Promise<void> {
  // Validate input via Zod (amount must be >= 0.01 by schema)
  const safe = validateOrThrow(customerLedgerSchemas.creditCharge, {
    customerName,
    amount,
    invoiceNumber: invoiceNumber ?? '',
    description: description ?? '',
    invoiceId: invoiceId ?? '',
  })

  const customer = await ensureCustomer(safe.customerName)

  // Insert a single payment record with method 'credit' linked to both customer and invoice
  const { error: payError } = await db.insertOne('payments', {
    customer_id: customer.id,
    invoice_id: safe.invoiceId || null,
    amount: safe.amount,
    payment_method: 'credit',
    reference: safe.invoiceNumber || null,
    notes: safe.description || `Credit charge — Invoice ${safe.invoiceNumber || 'N/A'}`,
  })

  if (payError) {
    console.error('Failed to record credit payment:', payError)
    throw payError
  }

  // Backfill the invoice's customer_id so the FK relationship is intact.
  // The invoice was created before the customer existed, so customer_id was NULL.
  if (safe.invoiceId) {
    const { error: invUpdateError } = await db.update(
      'invoices',
      { customer_id: customer.id },
      { id: safe.invoiceId },
    )
    if (invUpdateError) {
      console.error('Failed to backfill invoice customer_id:', invUpdateError)
      // Non-fatal — the invoice is already committed; the payment is linked
    }
  }

  // Update the customer's credit balance
  const newBalance = (customer.credit_balance ?? 0) + safe.amount
  const { error: updateError } = await db.update(
    'customers',
    {
      credit_balance: newBalance,
      total_orders: customer.total_orders + 1,
      total_spent: (customer.total_spent ?? 0) + safe.amount,
      last_visit: new Date().toISOString(),
    },
    { id: customer.id },
  )

  if (updateError) {
    console.error('Failed to update customer credit balance:', updateError)
    throw updateError
  }
}

/**
 * Record a credit payment (customer pays down their balance).
 * Inserts a payment record and decreases the customer's credit_balance.
 */
export async function recordCreditPayment(
  customerName: string,
  amount: number,
  description?: string,
): Promise<void> {
  // Validate input via Zod (amount must be >= 0.01 by schema)
  const safe = validateOrThrow(customerLedgerSchemas.creditPayment, {
    customerName,
    amount,
    description: description ?? '',
  })

  const customer = await ensureCustomer(safe.customerName)
  const currentBalance = customer.credit_balance ?? 0
  if (currentBalance <= 0) return

  const actualPayment = Math.min(safe.amount, currentBalance)
  if (actualPayment <= 0) return

  // Insert a payment record
  const { error: payError } = await db.insertOne('payments', {
    customer_id: customer.id,
    amount: actualPayment,
    payment_method: 'credit',
    notes: safe.description || `Credit payment of Rs. ${actualPayment.toFixed(2)}`,
  })

  if (payError) {
    console.error('Failed to record credit payment:', payError)
    throw payError
  }

  // Update the customer's credit balance
  const { error: updateError } = await db.update(
    'customers',
    { credit_balance: currentBalance - actualPayment },
    { id: customer.id },
  )

  if (updateError) {
    console.error('Failed to update customer credit balance:', updateError)
    throw updateError
  }
}

/**
 * Get a customer's current outstanding balance from the DB.
 */
export async function getCustomerBalance(customerName: string): Promise<number> {
  const { data } = await db.findOne<CustomerRow>('customers', { name: customerName })
  return data?.credit_balance ?? 0
}

/**
 * Get a customer's full ledger (payment history + current balance).
 */
export async function getCustomerLedger(
  customerName: string,
): Promise<CustomerLedger | null> {
  const { data: customer } = await db.findOne<CustomerRow>('customers', {
    name: customerName,
  })
  if (!customer) return null

  // Fetch all payments for this customer
  const { data: payments } = await db.findMany<PaymentRow>('payments', {
    customer_id: customer.id,
  })

  const entries: LedgerEntry[] = (payments ?? [])
    .filter((p) => p.payment_method === 'credit')
    .map((p) => ({
      id: p.id,
      date: p.created_at,
      type: (p.payment_method === 'credit' ? 'payment' : 'charge') as LedgerEntryType,
      amount: p.amount,
      invoiceNumber: p.reference ?? undefined,
      description: p.notes ?? `Credit transaction on ${p.created_at}`,
    }))
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )

  return {
    customerName: customer.name,
    entries,
    currentBalance: customer.credit_balance ?? 0,
  }
}

/**
 * Get all known customer ledgers (for admin overview).
 *
 * Optimized: fetches customers and their payments in batch queries
 * instead of N+1 individual queries.
 */
export async function getAllLedgers(): Promise<CustomerLedger[]> {
  const { data: customers } = await db.findMany<CustomerRow>('customers')

  if (!customers || customers.length === 0) return []

  // Filter to customers with activity
  const activeCustomers = customers.filter(
    (c) => (c.credit_balance ?? 0) > 0 || c.total_orders > 0
  )

  if (activeCustomers.length === 0) return []

  // Batch-fetch all payments for active customers in one query
  const customerIds = activeCustomers.map((c) => c.id)
  const { data: allPayments } = await db.findMany<PaymentRow>('payments')

  const paymentsByCustomer = new Map<string, PaymentRow[]>()
  for (const payment of allPayments ?? []) {
    if (payment.customer_id && customerIds.includes(payment.customer_id)) {
      const existing = paymentsByCustomer.get(payment.customer_id) ?? []
      existing.push(payment)
      paymentsByCustomer.set(payment.customer_id, existing)
    }
  }

  // Build ledgers from the batch data
  const ledgers: CustomerLedger[] = activeCustomers.map((customer) => {
    const payments = paymentsByCustomer.get(customer.id) ?? []
    const entries: LedgerEntry[] = payments
      .filter((p) => p.payment_method === 'credit')
      .map((p) => ({
        id: p.id,
        date: p.created_at,
        type: 'payment' as LedgerEntryType,
        amount: p.amount,
        invoiceNumber: p.reference ?? undefined,
        description: p.notes ?? `Credit transaction on ${p.created_at}`,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return {
      customerName: customer.name,
      entries,
      currentBalance: customer.credit_balance ?? 0,
    }
  })

  return ledgers
}

// ─── React Query Hooks ───────────────────────────────────────

/**
 * React hook that returns a customer's current credit balance.
 */
export function useCustomerBalance(customerName: string): number {
  const { data } = useQuery({
    queryKey: customerKeys.balance(customerName),
    queryFn: () => getCustomerBalance(customerName),
    enabled: !!customerName,
  })

  return data ?? 0
}

/**
 * React hook that returns a customer's full ledger.
 */
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
