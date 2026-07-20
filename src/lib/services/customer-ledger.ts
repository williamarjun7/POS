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
import type { CustomerRow, InvoiceRow, PaymentRow } from '@/lib/db/types'

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

  // Create a new customer record (dead columns removed — all computed from invoices)
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
 * NOTE: total_spent and total_orders are NOT stored on the customers table
 * anymore — they are calculated dynamically from invoices in the UI.
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
  const { error: updateError } = await db.update(
    'customers',
    {
      last_visit: new Date().toISOString(),
    },
    { id: customer.id },
  )

  if (updateError) {
    console.error('Failed to update customer last_visit:', updateError)
    // Non-fatal — the invoice and payments are already committed
  }

  // Backfill the invoice's customer_id so the FK relationship is intact
  if (invoiceId) {
    const { error: backfillError } = await db.update(
      'invoices',
      { customer_id: customer.id },
      { id: invoiceId },
    )
    if (backfillError) {
      console.error('Failed to backfill invoice customer_id:', backfillError)
    }
  }

  return customer.id
}

/**
 * Link a customer to a credit invoice.
 *
 * Called when a customer buys on credit (no real money exchanged).
 * Ensures the customer record exists, backfills customer_id on the invoice,
 * and updates last_visit.
 *
 * NOTE: This function NO LONGER creates payment records or mutates
 * credit_balance on the customers table. Invoices are the single source
 * of truth for outstanding credit — calculated as SUM(total - paid) across
 * non-cancelled invoices for the customer.
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

  // Backfill the invoice's customer_id so the FK relationship is intact.
  // The invoice was created before the customer existed, so customer_id was NULL.
  if (invoiceId) {
    const { error: invUpdateError } = await db.update(
      'invoices',
      { customer_id: customer.id },
      { id: invoiceId },
    )
    if (invUpdateError) {
      console.error('Failed to backfill invoice customer_id:', invUpdateError)
      // Non-fatal — the invoice is already committed
    }
  }

  // Update last_visit on the customer record
  const { error: updateError } = await db.update(
    'customers',
    {
      last_visit: new Date().toISOString(),
    },
    { id: customer.id },
  )

  if (updateError) {
    console.error('Failed to update customer last_visit:', updateError)
  }
}

/**
 * Get a customer's current outstanding balance from invoices and real payments.
 *
 * Calculates: SUM(non-cancelled invoice totals) - SUM(real payments for those invoices)
 * This is the single source of truth — NOT a stored counter on the customers table.
 */
export async function getCustomerBalance(customerName: string): Promise<number> {
  const { data: customer } = await db.findOne<CustomerRow>('customers', { name: customerName })
  if (!customer) return 0

  // Get all invoices for this customer
  const { data: invoices } = await db.findMany<InvoiceRow>('invoices', {
    customer_id: customer.id,
  })
  if (!invoices || invoices.length === 0) return 0

  // Filter to outstanding invoices (not fully paid, not cancelled)
  const outstandingInvoices = invoices.filter(
    inv => inv.status !== 'paid' && inv.status !== 'cancelled'
  )
  if (outstandingInvoices.length === 0) return 0

  // Get all payments for this customer and calculate real money received per invoice
  const { data: allPayments } = await db.findMany<PaymentRow>('payments', {
    customer_id: customer.id,
  })
  const realPayments = (allPayments ?? []).filter(p => p.payment_method !== 'credit')

  const paidByInvoice = new Map<string, number>()
  for (const p of realPayments) {
    if (p.invoice_id) {
      paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount))
    }
  }

  // Outstanding = invoice total - real payments received
  return outstandingInvoices.reduce((sum, inv) => {
    const paid = paidByInvoice.get(inv.id) ?? 0
    return sum + Math.max(0, Number(inv.total) - paid)
  }, 0)
}

/**
 * Get a customer's full ledger (invoices + payments) from the database.
 *
 * Single source of truth: invoices are debits, real payments are credits.
 * Current balance = SUM(invoice totals) - SUM(real payments) for non-cancelled invoices.
 */
export async function getCustomerLedger(
  customerName: string,
): Promise<CustomerLedger | null> {
  const customerResult = await db.findOne<CustomerRow>('customers', {
    name: customerName,
  })
  if (!customerResult?.data) return null
  const customer = customerResult.data

  // Fetch invoices and payments in parallel
  const [invoicesResult, paymentsResult] = await Promise.all([
    db.findMany<InvoiceRow>('invoices', { customer_id: customer.id }),
    db.findMany<PaymentRow>('payments', { customer_id: customer.id }),
  ])

  const invoices = (invoicesResult?.data ?? []) as InvoiceRow[]
  const payments = (paymentsResult?.data ?? []) as PaymentRow[]

  // Build chronological entries: invoices = debits, real payments = credits
  const entries: LedgerEntry[] = []

  // Invoice creation = debit (customer owes money)
  for (const inv of invoices) {
    entries.push({
      id: `inv-${inv.id}`,
      date: inv.created_at,
      type: 'charge' as LedgerEntryType,
      amount: Number(inv.total),
      invoiceNumber: inv.invoice_number,
      description: inv.status === 'cancelled'
        ? `Invoice ${inv.invoice_number} (Cancelled)`
        : `Invoice ${inv.invoice_number} — ${inv.status === 'paid' ? 'Paid' : inv.status === 'credit_invoice' ? 'Credit Sale' : inv.status}`,
    })
  }

  // Real payment = credit (customer pays money down)
  for (const p of payments) {
    if (p.payment_method === 'credit') continue // Old-style credit entries are ignored

    const inv = invoices.find(i => i.id === p.invoice_id)
    entries.push({
      id: `pay-${p.id}`,
      date: p.created_at,
      type: 'payment' as LedgerEntryType,
      amount: Number(p.amount),
      invoiceNumber: inv?.invoice_number ?? p.reference ?? undefined,
      description: p.notes ?? `Payment via ${p.payment_method}`,
    })
  }

  // Sort chronologically (oldest first for running balance calculation)
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Calculate current balance from invoices minus real payments
  // Only count non-cancelled invoices
  let balance = 0
  for (const inv of invoices) {
    if (inv.status !== 'cancelled') {
      balance += Number(inv.total)
    }
  }
  // Subtract real payments linked to non-cancelled invoices
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
    customerName: customer.name,
    entries,
    currentBalance: Math.max(0, balance),
  }
}

/**
 * Get all known customer ledgers (for admin overview).
 *
 * Single source of truth: invoices are debits, real payments are credits.
 * 
 * Optimized: fetches customers, invoices, and payments in batch queries
 * instead of N+1 individual queries.
 */
export async function getAllLedgers(): Promise<CustomerLedger[]> {
  const { data: customers } = await db.findMany<CustomerRow>('customers')

  if (!customers || customers.length === 0) return []

  const customerIds = customers.map((c) => c.id)

  // Batch-fetch all invoices and payments for all customers
  const [invoicesResult, paymentsResult] = await Promise.all([
    db.findMany<InvoiceRow>('invoices'),
    db.findMany<PaymentRow>('payments'),
  ])

  const allInvoices = (invoicesResult.data ?? []) as InvoiceRow[]
  const allPayments = (paymentsResult.data ?? []) as PaymentRow[]

  // Group invoices and real payments by customer
  const invoicesByCustomer = new Map<string, InvoiceRow[]>()
  for (const inv of allInvoices) {
    if (inv.customer_id) {
      const existing = invoicesByCustomer.get(inv.customer_id) ?? []
      existing.push(inv)
      invoicesByCustomer.set(inv.customer_id, existing)
    }
  }

  const paymentsByCustomer = new Map<string, PaymentRow[]>()
  for (const payment of allPayments) {
    if (payment.customer_id) {
      const existing = paymentsByCustomer.get(payment.customer_id) ?? []
      existing.push(payment)
      paymentsByCustomer.set(payment.customer_id, existing)
    }
  }

  // Build ledgers for customers with activity
  const ledgers: CustomerLedger[] = []

  for (const customer of customers) {
    const invoices = invoicesByCustomer.get(customer.id) ?? []
    const payments = paymentsByCustomer.get(customer.id) ?? []

    // Skip customers with no activity
    if (invoices.length === 0 && payments.length === 0) continue

    // Build entries
    const entries: LedgerEntry[] = []

    for (const inv of invoices) {
      entries.push({
        id: `inv-${inv.id}`,
        date: inv.created_at,
        type: 'charge' as LedgerEntryType,
        amount: Number(inv.total),
        invoiceNumber: inv.invoice_number,
        description: inv.status === 'cancelled'
          ? `Invoice ${inv.invoice_number} (Cancelled)`
          : `Invoice ${inv.invoice_number} — ${inv.status}`,
      })
    }

    for (const p of payments) {
      if (p.payment_method === 'credit') continue
      const inv = invoices.find(i => i.id === p.invoice_id)
      entries.push({
        id: `pay-${p.id}`,
        date: p.created_at,
        type: 'payment' as LedgerEntryType,
        amount: Number(p.amount),
        invoiceNumber: inv?.invoice_number ?? p.reference ?? undefined,
        description: p.notes ?? `Payment via ${p.payment_method}`,
      })
    }

    // Sort chronologically oldest-first for balance calculation
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Calculate balance
    let balance = 0
    for (const inv of invoices) {
      if (inv.status !== 'cancelled') balance += Number(inv.total)
    }
    for (const p of payments) {
      if (p.payment_method !== 'credit' && p.invoice_id) {
        const inv = invoices.find(i => i.id === p.invoice_id)
        if (inv && inv.status !== 'cancelled') {
          balance -= Number(p.amount)
        }
      }
    }

    // Reverse for display
    entries.reverse()

    ledgers.push({
      customerName: customer.name,
      entries,
      currentBalance: Math.max(0, balance),
    })
  }

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
