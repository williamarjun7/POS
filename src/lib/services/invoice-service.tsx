/**
 * InvoiceService
 * ───────────────
 * DB-backed read for invoices with basic financial fields.
 *
 * Table: public.invoices
 * RLS: authenticated users can SELECT
 *
 * Note: Invoice line items live in public.invoice_items and are not
 * joined here. The Finance page displays invoice-level data (totals,
 * statuses) and item counts from a separate query.
 */

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'
import { invoiceKeys } from '@/lib/core/query-keys'
import type { InvoiceRow } from '@/lib/db/types'
import type { Invoice, PaymentMethod, PaymentStatus } from '@/types'

/* ─── Mapper ──────────────────────────────────────────────── */

function rowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customer: row.customer_name,
    items: [],
    subtotal: row.subtotal,
    tax: row.tax,
    discount: row.discount,
    total: row.total,
    status: row.status as PaymentStatus,
    paymentMethod: (row.payment_method as PaymentMethod) ?? 'cash',
    createdAt: row.created_at,
    dueDate: row.due_date ?? undefined,
  }
}

/* ─── DB operations ───────────────────────────────────────── */

export async function fetchInvoicesFromDb(): Promise<Invoice[]> {
  const { data, error } = await insforge.database
    .from('invoices')
    .select('id, invoice_number, customer_name, subtotal, tax, discount, total, status, payment_method, created_at, due_date')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row: unknown) => rowToInvoice(row as InvoiceRow))
}

/**
 * Fetch a single invoice by ID with full DB row shape.
 */
async function fetchInvoiceRowFromDb(id: string): Promise<InvoiceRow | null> {
  const { data, error } = await insforge.database
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data as InvoiceRow) ?? null
}

/* ─── React Query Hooks ───────────────────────────────────── */

/**
 * Fetch a single invoice by ID using React Query.
 */
export function useInvoice(id: string | undefined) {
  return useQuery<InvoiceRow | null>({
    queryKey: invoiceKeys.detail(id ?? '__missing__'),
    queryFn: () => fetchInvoiceRowFromDb(id!),
    enabled: !!id,
    staleTime: 10_000,
  })
}

/* ─── Legacy hooks (kept for backward compatibility) ──────── */

export interface UseInvoicesReturn {
  invoices: Invoice[]
  isLoading: boolean
  loadError: string | null
  refresh: () => Promise<void>
}

export function useInvoices(): UseInvoicesReturn {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchInvoicesFromDb()
      setInvoices(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load invoices')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const data = await fetchInvoicesFromDb()
        if (!cancelled) setInvoices(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load invoices')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  return { invoices, isLoading, loadError, refresh }
}
