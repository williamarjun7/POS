/**
 * Payment Methods — helper functions (no hardcoded arrays)
 * Label/color maps and method lists are defined inline per component
 * or fetched from the database at runtime.
 */

/** Inline label map — single source for DB key → display label */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash with Change',
  reception_qr: 'Reception QR',
  fonepay: 'FonePay QR',
  credit: 'Credit Payment',
  split: 'Split Payment',
  partial: 'Partial Payment',
}

/** Inline color map for charts and badges */
const PAYMENT_METHOD_COLORS: Record<string, string> = {
  cash: '#10b981',
  reception_qr: '#0ea5e9',
  fonepay: '#3b82f6',
  credit: '#a855f7',
  split: '#f59e0b',
  partial: '#f97316',
}

export function getPaymentMethodLabel(key: string | undefined | null): string {
  if (!key) return 'Unknown'
  return PAYMENT_METHOD_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
}

export function getPaymentMethodColor(key: string | undefined | null): string {
  if (!key) return '#94a3b8'
  return PAYMENT_METHOD_COLORS[key] ?? '#94a3b8'
}

// ─── Helper: convert a display label to a DB-safe key ──────
//     e.g. "Cash with Change" → "cash", "Credit (John)" → "credit"

export function toPaymentMethodKey(label: string): string {
  const lower = label.toLowerCase().trim()
  if (lower === 'cash' || lower.startsWith('cash')) return 'cash'
  if (lower === 'fonepay' || lower === 'fonepay qr') return 'fonepay'
  if (lower === 'reception qr' || lower === 'reception_qr') return 'reception_qr'
  if (lower.startsWith('credit')) return 'credit'
  if (lower === 'split' || lower.startsWith('split')) return 'split'
  if (lower === 'partial' || lower.startsWith('partial')) return 'partial'
  // Legacy/fallback
  if (lower === 'card') return 'cash'
  if (lower === 'bank_transfer' || lower === 'bank transfer') return 'cash'
  return lower.replace(/\\(.*\\)/, '').replace(/\s+/g, '_').trim()
}

// ─── Chart pie data helper ──────────────────────────────────

export interface PaymentMethodChartEntry {
  name: string
  value: number
  color: string
}

/** DB-safe payment channel values used in the payments table */
export const DB_PAYMENT_CHANNEL_VALUES = ['cash', 'reception_qr', 'fonepay', 'credit', 'split', 'partial'] as const

const KNOWN_METHODS = DB_PAYMENT_CHANNEL_VALUES

/**
 * Aggregate payment amounts by all methods and produce chart-ready entries.
 * Unknown/legacy methods are folded into "Other".
 */
export function aggregatePaymentMethods(
  records: Array<{ method: string; amount: number }>,
): PaymentMethodChartEntry[] {
  const buckets: Record<string, number> = {}
  let otherAmount = 0

  for (const r of records) {
    const key = toPaymentMethodKey(r.method)
    if ((KNOWN_METHODS as readonly string[]).includes(key)) {
      buckets[key] = (buckets[key] ?? 0) + r.amount
    } else {
      otherAmount += r.amount
    }
  }

  const entries: PaymentMethodChartEntry[] = KNOWN_METHODS
    .filter(m => (buckets[m] ?? 0) > 0)
    .map(m => ({
      name: PAYMENT_METHOD_LABELS[m] ?? m,
      value: Math.round(buckets[m] ?? 0),
      color: PAYMENT_METHOD_COLORS[m] ?? '#94a3b8',
    }))

  if (otherAmount > 0) {
    entries.push({ name: 'Other', value: Math.round(otherAmount), color: '#94a3b8' })
  }

  return entries
}
