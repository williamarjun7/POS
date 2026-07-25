/**
 * InvoiceItemsService
 * ────────────────────
 * DB-backed CRUD for invoice line items.
 *
 * Table: public.invoice_items
 * RLS: authenticated users can SELECT, INSERT
 *
 * Each invoice stores its line items here instead of relying solely
 * on summarized totals in the invoices table.
 */

import { insforge } from '@/lib/services/auth-service'
import type { InvoiceItemRow } from '@/lib/db/types'
import { invoiceItemSchemas, validateOrThrow } from '@/lib/validation'

/* ─── Frontend InvoiceItem type (camelCase) ───────────────── */

export interface InvoiceItem {
  id: string
  invoiceId: string
  menuItemId: string | null
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

/* ─── Mapper ──────────────────────────────────────────────── */

function rowToInvoiceItem(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    menuItemId: row.menu_item_id,
    name: row.name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
  }
}

/* ─── DB operations ───────────────────────────────────────── */

/**
 * Fetch all items for a given invoice.
 */
export async function fetchInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const { data, error } = await insforge.database
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row: unknown) => rowToInvoiceItem(row as InvoiceItemRow))
}

/**
 * Insert multiple items for an invoice in a single batch.
 */
export async function insertInvoiceItems(
  invoiceId: string,
  items: Array<{
    menuItemId?: string
    name: string
    quantity: number
    unitPrice: number
  }>,
): Promise<InvoiceItem[]> {
  if (items.length === 0) return []

  // Validate all input via Zod
  const safe = validateOrThrow(invoiceItemSchemas.insertItems, {
    invoiceId,
    items,
  })

  const rows = safe.items.map((item) => ({
    invoice_id: safe.invoiceId,
    menu_item_id: item.menuItemId ?? null,
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.quantity * item.unitPrice,
  }))

  // Explicitly coerce values to numbers — PostgREST can return numeric as string
  // in some serialization paths. Zod validates, but defense-in-depth saves debugging.
  const safeRows = rows.map(r => ({
    ...r,
    quantity: Number(r.quantity),
    unit_price: Number(r.unit_price),
    total_price: Number(r.total_price),
  }))

  const { data, error } = await insforge.database
    .from('invoice_items')
    .insert(safeRows)
    .select()

  if (error) {
    // Always log, not just DEV mode. This has been silently failing.
    console.error(
      '[INVOICE_ITEMS] Insert failed:',
      JSON.stringify({ message: error.message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint }),
      { invoiceId, itemCount: items.length },
    )
    throw error
  }

  const inserted = (data ?? []).map((row: unknown) => rowToInvoiceItem(row as InvoiceItemRow))
  if (import.meta.env.DEV) {
    console.log('[INVOICE_ITEMS] Inserted', inserted.length, 'items for invoice', invoiceId)
  }
  return inserted
}

/**
 * Delete all items for a given invoice (used when regenerating invoice items).
 */
export async function deleteInvoiceItems(invoiceId: string): Promise<void> {
  const { error } = await insforge.database
    .from('invoice_items')
    .delete()
    .eq('invoice_id', invoiceId)

  if (error) throw error
}

/**
 * Get the total count of items for an invoice.
 */
export async function countInvoiceItems(invoiceId: string): Promise<number> {
  const { count, error } = await insforge.database
    .from('invoice_items')
    .select('*', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)

  if (error) throw error
  return count ?? 0
}

/**
 * Fetch a single invoice with its items joined.
 * Returns null if the invoice doesn't exist.
 */
export async function fetchInvoiceWithItems(
  invoiceId: string,
): Promise<{ invoice: InvoiceItemRow & { invoice_items?: InvoiceItemRow[] } } | null> {
  const { data, error } = await insforge.database
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('id', invoiceId)
    .maybeSingle()

  if (error) throw error
  return data as any
}
