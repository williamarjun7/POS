/**
 * Sequence Service
 * ────────────────
 * Manages business-friendly display numbers for orders and invoices.
 *
 * Principles:
 *   - Internal IDs (UUIDs, base36 hashes) are never shown to users.
 *   - Display numbers are sequential, human-readable, and consistent
 *     across POS, Billing, Reports, and Reprint screens.
 *   - Per-table order numbers reset when a session ends (payment).
 *
 * Numbering formats:
 *   • Order (per-table session):  "Order #1", "Order #2", …
 *   • Invoice (yearly sequential): "INV-2026-000123", …
 */

import { insforge } from '@/lib/services/auth-service'

/**
 * Get the display order number for a batch within its table session.
 * Orders are numbered 1, 2, 3… per table. When the table is paid and
 * the session ends, the next session starts at 1 again.
 *
 * @param batches - All batches for the given table (in order of creation)
 * @param batchId - The batch to find the order number for
 * @returns The 1-based order number
 */
export function getOrderDisplayNumber(
  batches: Array<{ id: string }>,
  batchId: string,
): number {
  const index = batches.findIndex((b) => b.id === batchId)
  return index + 1 // 1-based
}

/**
 * Get the next invoice number in the format "INV-2026-000123".
 * Queries the database for the highest sequential number in the current year
 * and increments it. This ensures uniqueness even across page refreshes.
 *
 * IMPORTANT: If existing invoices use a different format (e.g. "INV-AVJ4V"),
 * those won't be parsed. The counter starts at 1 for the current year.
 */
export async function getNextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`

  try {
    // Find the highest invoice number starting with this year's prefix
    const { data } = await insforge.database
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(1)

    let nextSeq = 1
    if (data && data.length > 0) {
      const parts = (data[0] as { invoice_number: string }).invoice_number.split('-')
      const lastNum = parseInt(parts[2] || '0', 10)
      if (!isNaN(lastNum)) {
        nextSeq = lastNum + 1
      }
    }

    return `${prefix}${String(nextSeq).padStart(6, '0')}`
  } catch {
    // Fallback: timestamp-based (shouldn't normally happen)
    return `${prefix}${String(Date.now()).slice(-6)}`
  }
}
